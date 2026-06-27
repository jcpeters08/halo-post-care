import { getDefaultGuidance, validateAssessment } from './assessment.js';
import {
  createDailyState,
  setCounterValue,
  setFlagValue,
  toggleRoutineStep
} from './checklist.js';
import {
  buildDailyTargets,
  computeRecoveryDay,
  formatLocalIsoDate,
  getStageForDay,
  getTimelineForDay
} from './day.js';
import { loadSettings, loadJson, saveJson } from './storage.js';
import { renderGuide } from './ui/guide.js';
import { renderToday } from './ui/today.js';

const routes = ['today', 'log', 'guide', 'settings'];
const DAILY_STATE_KEY = 'halo_daily_v1';
const APPLIED_ASSESSMENT_KEY = 'halo_applied_assessment_v1';

function getRoute() {
  const hash = window.location.hash.replace('#', '');
  return routes.includes(hash) ? hash : 'today';
}

function getTodayIso() {
  return formatLocalIsoDate(new Date());
}

function createInitialDailyState(targets) {
  const state = createDailyState(targets);

  for (const [flagId, spec] of Object.entries(targets.flags)) {
    state.flags[flagId] = Boolean(spec.default);
  }

  return state;
}

function loadDailyState(storage, todayIso, targets) {
  const byDate = loadJson(storage, DAILY_STATE_KEY, {});

  if (byDate && typeof byDate === 'object' && !Array.isArray(byDate) && byDate[todayIso]) {
    return byDate[todayIso];
  }

  const state = createInitialDailyState(targets);
  saveJson(storage, DAILY_STATE_KEY, {
    ...(byDate && typeof byDate === 'object' && !Array.isArray(byDate) ? byDate : {}),
    [todayIso]: state
  });
  return state;
}

function saveDailyState(storage, todayIso, state) {
  const byDate = loadJson(storage, DAILY_STATE_KEY, {});
  saveJson(storage, DAILY_STATE_KEY, {
    ...(byDate && typeof byDate === 'object' && !Array.isArray(byDate) ? byDate : {}),
    [todayIso]: state
  });
}

function loadAppliedAssessment(storage) {
  const candidate = loadJson(storage, APPLIED_ASSESSMENT_KEY, null);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  return validateAssessment(candidate).valid ? candidate : null;
}

function getGuidanceContext(assessment) {
  if (!assessment) {
    return {
      guidance: getDefaultGuidance(),
      provenance: 'Default guidance'
    };
  }

  return {
    guidance: assessment.guidance,
    provenance: `Codex assessment from ${assessment.assessmentDate}`
  };
}

function buildContext() {
  const settings = loadSettings(window.localStorage);
  const todayIso = getTodayIso();
  const recoveryDay = computeRecoveryDay(todayIso, settings.procedureDate);
  const targets = buildDailyTargets(recoveryDay, settings.acyclovirPerDay);
  const state = loadDailyState(window.localStorage, todayIso, targets);
  const assessment = loadAppliedAssessment(window.localStorage);
  const { guidance, provenance } = getGuidanceContext(assessment);

  return {
    assessment,
    guidance,
    procedureDate: settings.procedureDate,
    provenance,
    recoveryDay,
    settings,
    stage: getStageForDay(recoveryDay),
    state,
    targets,
    timeline: getTimelineForDay(recoveryDay),
    todayIso
  };
}

function renderPlaceholder(root, route) {
  const labels = { log: 'Log', settings: 'Settings' };
  root.innerHTML = `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">${labels[route]}</p>
        <h2 class="section-title">${labels[route]}</h2>
      </div>
      <p class="body-copy">This tab is reserved for a later task.</p>
    </section>
  `;
}

function updateNav(route) {
  for (const button of document.querySelectorAll('[data-route]')) {
    button.classList.toggle('is-active', button.dataset.route === route);
  }
}

function render(route = getRoute()) {
  const root = document.querySelector('#app');
  const title = document.querySelector('#screen-title');
  const labels = { today: 'Today', log: 'Log', guide: 'Guide', settings: 'Settings' };
  const context = buildContext();

  title.textContent = labels[route];

  if (route === 'today') {
    renderToday(root, context);
  } else if (route === 'guide') {
    renderGuide(root, context);
  } else {
    renderPlaceholder(root, route);
  }

  updateNav(route);
}

function mutateDailyState(mutator) {
  const context = buildContext();
  const nextState = mutator(context.state, context.targets);
  saveDailyState(window.localStorage, context.todayIso, nextState);
  render();
}

document.addEventListener('click', (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) {
    window.location.hash = routeButton.dataset.route;
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) {
    return;
  }

  const { action } = actionTarget.dataset;

  if (action === 'toggle-step') {
    mutateDailyState((state) =>
      toggleRoutineStep(state, actionTarget.dataset.period, actionTarget.dataset.stepId)
    );
    return;
  }

  if (action === 'counter-dec' || action === 'counter-inc') {
    const delta = action === 'counter-inc' ? 1 : -1;
    mutateDailyState((state) =>
      setCounterValue(
        state,
        actionTarget.dataset.counterId,
        (state.counters[actionTarget.dataset.counterId] ?? 0) + delta
      )
    );
    return;
  }

  if (action === 'set-flag') {
    mutateDailyState((state) =>
      setFlagValue(
        state,
        actionTarget.dataset.flagId,
        !(state.flags[actionTarget.dataset.flagId] ?? false)
      )
    );
  }
});

window.addEventListener('hashchange', () => render());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

render();
