import { getCompletionSummary } from '../checklist.js';
import { getRedLightMaskGuidance } from '../day.js';
import {
  escapeHtml,
  renderAssessmentDetails,
  renderGuidanceCards,
  renderRecoveryTools,
  renderSafetyPanel
} from './components.js';

function renderRoutine(period, items, state, summary) {
  const rows = items
    .map((item) => {
      const complete = Boolean(state[item.id]);
      return `
        <button
          class="checklist-row${complete ? ' is-complete' : ''}"
          type="button"
          data-action="toggle-step"
          data-period="${period}"
          data-step-id="${escapeHtml(item.id)}"
          aria-pressed="${complete ? 'true' : 'false'}"
        >
          <span class="checklist-row__state" aria-hidden="true">${complete ? 'Done' : 'Tap'}</span>
          <span class="checklist-row__copy">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.details)}</span>
          </span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="panel stack-md">
      <div class="section-row">
        <div class="stack-xxs">
          <p class="section-label">${period.toUpperCase()}</p>
          <h2 class="section-title">${period === 'am' ? 'Morning routine' : 'Evening routine'}</h2>
        </div>
        <p class="progress-chip">${summary.completed}/${summary.total}</p>
      </div>
      <div class="stack-sm">${rows}</div>
    </section>
  `;
}

function renderCounters(counters, values) {
  const rows = Object.entries(counters)
    .filter(([, spec]) => spec.target > 0)
    .map(([counterId, spec]) => `
      <div class="counter-row">
        <div class="stack-xxs">
          <strong>${escapeHtml(spec.label)}</strong>
          <span class="meta-text">Target ${spec.target}</span>
        </div>
        <div class="counter-controls">
          <button type="button" class="icon-button" data-action="counter-dec" data-counter-id="${escapeHtml(counterId)}" aria-label="Decrease ${escapeHtml(spec.label)}">-</button>
          <span class="counter-value">${values[counterId] ?? 0}</span>
          <button type="button" class="icon-button" data-action="counter-inc" data-counter-id="${escapeHtml(counterId)}" aria-label="Increase ${escapeHtml(spec.label)}">+</button>
        </div>
      </div>
    `)
    .join('');

  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">Counters</p>
        <h2 class="section-title">Keep the repeatables on pace</h2>
      </div>
      <div class="stack-sm">${rows}</div>
    </section>
  `;
}

function renderFlags(flags, values) {
  const rows = Object.entries(flags)
    .map(([flagId, spec]) => {
      const enabled = Boolean(values[flagId]);
      return `
        <button
          class="flag-row${enabled ? ' is-on' : ''}"
          type="button"
          data-action="set-flag"
          data-flag-id="${escapeHtml(flagId)}"
          aria-pressed="${enabled ? 'true' : 'false'}"
        >
          <span>${escapeHtml(spec.label)}</span>
          <span class="flag-row__value">${enabled ? 'Yes' : 'No'}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">Flags</p>
        <h2 class="section-title">Quick confirmations</h2>
      </div>
      <div class="stack-sm">${rows}</div>
    </section>
  `;
}

function formatUrgency(value) {
  return `${value || 'call_clinic'}`
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function renderCodexSafetyAlert(assessment) {
  const safety = assessment?.safety;
  const urgency = typeof safety?.urgency === 'string' ? safety.urgency : '';
  const shouldShowAlert = safety?.callClinic === true || ['call_clinic', 'urgent'].includes(urgency);

  if (!shouldShowAlert) {
    return '';
  }

  const reasons = Array.isArray(safety.reasons)
    ? safety.reasons.filter((reason) => typeof reason === 'string' && reason.trim())
    : [];
  const reasonRows = reasons.length > 0
    ? reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li>Clinic follow-up recommended by Codex assessment.</li>';

  return `
    <section class="panel stack-md codex-safety-alert is-call" aria-labelledby="codex-safety-title">
      <div class="stack-xs">
        <p class="section-label">Codex safety alert</p>
        <h2 id="codex-safety-title" class="section-title">${escapeHtml(formatUrgency(urgency))}</h2>
      </div>
      <ul class="bullet-list">${reasonRows}</ul>
    </section>
  `;
}

export function renderToday(root, context) {
  const summary = getCompletionSummary(context.state, context.targets);
  const redLightMaskGuidance = context.redLightMaskGuidance
    ?? getRedLightMaskGuidance(context.recoveryDay);

  root.innerHTML = `
    <div class="stack-lg">
      <section class="hero-panel">
        <div class="hero-panel__top">
          <div class="stack-xs">
            <p class="eyebrow">Recovery day ${context.recoveryDay}</p>
            <h2>${escapeHtml(context.stage.title)}</h2>
          </div>
          <p class="stage-badge">${escapeHtml(context.timeline.title)}</p>
        </div>
        <p class="hero-summary">${escapeHtml(context.stage.summary)}</p>
        <p class="body-copy">${escapeHtml(context.timeline.keyTakeaway)}</p>
      </section>

      ${renderRoutine('am', context.targets.am, context.state.am, summary.am)}
      ${renderRoutine('pm', context.targets.pm, context.state.pm, summary.pm)}
      ${renderCounters(context.targets.counters, context.state.counters)}
      ${renderFlags(context.targets.flags, context.state.flags)}
      ${renderRecoveryTools([redLightMaskGuidance])}
      ${renderCodexSafetyAlert(context.assessment)}
      ${renderAssessmentDetails(context.assessment)}
      ${renderSafetyPanel()}
      ${renderGuidanceCards(context.guidance, context.provenance)}
    </div>
  `;
}
