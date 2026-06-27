import {
  getDefaultGuidance,
  selectLatestValidAssessment,
  validateAssessment
} from './assessment.js';
import {
  createDailyState,
  getCompletionSummary,
  setCounterValue,
  setFlagValue,
  toggleRoutineStep
} from './checklist.js';
import {
  buildCheckinPath,
  buildCompleteMarker,
  buildManifest,
  buildSummaryMarkdown
} from './checkins.js';
import {
  buildDailyTargets,
  computeRecoveryDay,
  formatLocalIsoDate,
  getStageForDay,
  getTimelineForDay
} from './day.js';
import { createGitHubClient, GitHubSettingsError } from './github.js';
import {
  buildPhotoDraftId,
  compressImageFile,
  draftsByArea,
  getPhotoDrafts,
  PHOTO_AREAS,
  savePhotoDraft
} from './photos.js';
import { loadSettings, loadJson, saveJson } from './storage.js';
import { renderGuide } from './ui/guide.js';
import { renderLog } from './ui/log.js';
import { renderToday } from './ui/today.js';

const routes = ['today', 'log', 'guide', 'settings'];
const DAILY_STATE_KEY = 'halo_daily_v1';
const APPLIED_ASSESSMENT_KEY = 'halo_applied_assessment_v1';
const CHECKIN_DRAFTS_KEY = 'halo_checkin_drafts_v1';
const DEFAULT_SYMPTOMS = {
  redness: 1,
  swelling: 1,
  flaking: 1,
  itch: 1,
  tightness: 1
};

let activeLogRenderToken = 0;
let activeLogPreviewUrls = [];

function padTwo(value) {
  return String(value).padStart(2, '0');
}

function formatLocalTimeValue(date) {
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function formatLocalTimestamp(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;

  return `${formatLocalIsoDate(date)}T${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}${sign}${padTwo(offsetHours)}:${padTwo(offsetRemainder)}`;
}

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSymptomValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, Math.trunc(parsed)));
}

function createInitialCheckinDraft() {
  return {
    symptoms: { ...DEFAULT_SYMPTOMS },
    note: '',
    syncStatus: 'draft',
    uploadedCheckinPath: '',
    errorMessage: ''
  };
}

function normalizeCheckinDraft(storedDraft) {
  const initial = createInitialCheckinDraft();
  if (!isPlainObject(storedDraft)) {
    return initial;
  }

  const symptoms = isPlainObject(storedDraft.symptoms) ? storedDraft.symptoms : {};
  const syncStatus = typeof storedDraft.syncStatus === 'string'
    ? storedDraft.syncStatus
    : initial.syncStatus;

  return {
    symptoms: Object.fromEntries(
      Object.keys(DEFAULT_SYMPTOMS).map((key) => [key, normalizeSymptomValue(symptoms[key])])
    ),
    note: typeof storedDraft.note === 'string' ? storedDraft.note : '',
    syncStatus,
    uploadedCheckinPath: typeof storedDraft.uploadedCheckinPath === 'string'
      ? storedDraft.uploadedCheckinPath
      : '',
    errorMessage: typeof storedDraft.errorMessage === 'string' ? storedDraft.errorMessage : ''
  };
}

function loadCheckinDraft(storage, todayIso) {
  const byDate = loadJson(storage, CHECKIN_DRAFTS_KEY, {});
  if (!isPlainObject(byDate)) {
    return createInitialCheckinDraft();
  }

  const normalized = normalizeCheckinDraft(byDate[todayIso]);
  saveJson(storage, CHECKIN_DRAFTS_KEY, {
    ...byDate,
    [todayIso]: normalized
  });
  return normalized;
}

function saveCheckinDraft(storage, todayIso, draft) {
  const byDate = loadJson(storage, CHECKIN_DRAFTS_KEY, {});
  saveJson(storage, CHECKIN_DRAFTS_KEY, {
    ...(isPlainObject(byDate) ? byDate : {}),
    [todayIso]: normalizeCheckinDraft(draft)
  });
}

function nextSyncStatus(hasRequiredPhotos) {
  return hasRequiredPhotos ? 'ready' : 'draft';
}

function markCheckinDraftDirty(draft, hasRequiredPhotos) {
  return {
    ...draft,
    syncStatus: nextSyncStatus(hasRequiredPhotos),
    uploadedCheckinPath: '',
    errorMessage: ''
  };
}

function revokeLogPreviewUrls() {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    activeLogPreviewUrls = [];
    return;
  }

  for (const url of activeLogPreviewUrls) {
    URL.revokeObjectURL(url);
  }
  activeLogPreviewUrls = [];
}

function buildPreviewUrls(photoDraftsByArea) {
  revokeLogPreviewUrls();

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return {};
  }

  const previewUrls = {};

  for (const area of PHOTO_AREAS) {
    const blob = photoDraftsByArea[area]?.blob;
    if (!(blob instanceof Blob)) {
      continue;
    }

    const url = URL.createObjectURL(blob);
    activeLogPreviewUrls.push(url);
    previewUrls[area] = url;
  }

  return previewUrls;
}

function getSettingsErrorMessage(settings) {
  if (!settings?.token) {
    return 'Add a GitHub token in Settings before preparing a check-in.';
  }

  if (!settings?.githubOwner || !settings?.dataRepo) {
    return 'Add a GitHub owner and data repo in Settings before preparing a check-in.';
  }

  return '';
}

function describeSyncState(draft) {
  if (draft.syncStatus === 'uploading') {
    return 'Uploading check-in...';
  }

  if (draft.syncStatus === 'uploaded') {
    return draft.uploadedCheckinPath
      ? `Uploaded: ${draft.uploadedCheckinPath}`
      : 'Uploaded';
  }

  if (draft.syncStatus === 'upload_failed') {
    return draft.errorMessage || 'Upload failed. Draft saved locally.';
  }

  if (draft.errorMessage) {
    return draft.errorMessage;
  }

  if (draft.syncStatus === 'ready') {
    return 'Ready to prepare check-in.';
  }

  return 'Draft in progress.';
}

function updateSyncStatusText(value) {
  const node = document.querySelector('#sync-status');
  if (node) {
    node.textContent = value;
  }
}

function encodeBytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }

  throw new Error('No base64 encoder available');
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  return encodeBytesToBase64(new Uint8Array(buffer));
}

function normalizeRoutineState(storedRoutine, targetItems) {
  return Object.fromEntries(
    targetItems.map((item) => [item.id, storedRoutine?.[item.id] === true])
  );
}

function normalizeCounterState(storedCounters, targets) {
  return Object.fromEntries(
    Object.keys(targets).map((counterId) => {
      const value = storedCounters?.[counterId];
      const parsed = Number(value);
      const normalized = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
      return [counterId, normalized];
    })
  );
}

function normalizeFlagState(storedFlags, targets, defaults) {
  return Object.fromEntries(
    Object.keys(targets).map((flagId) => {
      const value = storedFlags?.[flagId];
      if (typeof value === 'boolean') {
        return [flagId, value];
      }

      return [flagId, defaults[flagId]];
    })
  );
}

export function normalizeDailyState(storedState, targets) {
  const initialState = createInitialDailyState(targets);

  if (!isPlainObject(storedState)) {
    return initialState;
  }

  return {
    am: normalizeRoutineState(isPlainObject(storedState.am) ? storedState.am : null, targets.am),
    pm: normalizeRoutineState(isPlainObject(storedState.pm) ? storedState.pm : null, targets.pm),
    counters: normalizeCounterState(
      isPlainObject(storedState.counters) ? storedState.counters : null,
      targets.counters
    ),
    flags: normalizeFlagState(
      isPlainObject(storedState.flags) ? storedState.flags : null,
      targets.flags,
      initialState.flags
    )
  };
}

export function loadDailyState(storage, todayIso, targets) {
  const byDate = loadJson(storage, DAILY_STATE_KEY, {});

  if (byDate && typeof byDate === 'object' && !Array.isArray(byDate) && byDate[todayIso]) {
    const normalized = normalizeDailyState(byDate[todayIso], targets);
    saveJson(storage, DAILY_STATE_KEY, {
      ...byDate,
      [todayIso]: normalized
    });
    return normalized;
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

function getAssessmentCandidates(candidate) {
  if (Array.isArray(candidate)) {
    return candidate;
  }

  if (validateAssessment(candidate).valid) {
    return [candidate];
  }

  if (!isPlainObject(candidate)) {
    return [];
  }

  if (Array.isArray(candidate.history)) {
    return candidate.history;
  }

  if (Array.isArray(candidate.assessments)) {
    return candidate.assessments;
  }

  return [];
}

export function loadAppliedAssessment(storage) {
  const candidate = loadJson(storage, APPLIED_ASSESSMENT_KEY, null);
  return selectLatestValidAssessment(getAssessmentCandidates(candidate));
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

async function renderLogRoute(root, context) {
  const renderToken = ++activeLogRenderToken;
  const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);

  renderLog(root, context, {
    draft: storedDraft,
    photoDraftsByArea: {},
    previewUrls: {},
    photoError: ''
  });
  updateSyncStatusText(describeSyncState(storedDraft));

  try {
    const photoDrafts = await getPhotoDrafts(context.todayIso);
    if (renderToken !== activeLogRenderToken || getRoute() !== 'log') {
      return;
    }

    const byArea = draftsByArea(photoDrafts);
    const normalizedDraft = normalizeCheckinDraft({
      ...storedDraft,
      syncStatus: ['uploading', 'uploaded', 'upload_failed'].includes(storedDraft.syncStatus)
        ? storedDraft.syncStatus
        : nextSyncStatus(PHOTO_AREAS.every((area) => !!byArea[area]))
    });
    saveCheckinDraft(window.localStorage, context.todayIso, normalizedDraft);
    const previewUrls = buildPreviewUrls(byArea);

    renderLog(root, context, {
      draft: normalizedDraft,
      photoDraftsByArea: byArea,
      previewUrls,
      photoError: ''
    });
    updateSyncStatusText(describeSyncState(normalizedDraft));
  } catch (error) {
    if (renderToken !== activeLogRenderToken || getRoute() !== 'log') {
      return;
    }

    renderLog(root, context, {
      draft: storedDraft,
      photoDraftsByArea: {},
      previewUrls: {},
      photoError: 'Photo drafts are unavailable on this device right now.'
    });
    updateSyncStatusText('Photo drafts unavailable.');
  }
}

function render(route = getRoute()) {
  const root = document.querySelector('#app');
  const title = document.querySelector('#screen-title');
  const labels = { today: 'Today', log: 'Log', guide: 'Guide', settings: 'Settings' };
  const context = buildContext();

  title.textContent = labels[route];

  if (route === 'today') {
    revokeLogPreviewUrls();
    renderToday(root, context);
    updateSyncStatusText('Ready');
  } else if (route === 'log') {
    void renderLogRoute(root, context);
  } else if (route === 'guide') {
    revokeLogPreviewUrls();
    renderGuide(root, context);
    updateSyncStatusText('Ready');
  } else {
    revokeLogPreviewUrls();
    renderPlaceholder(root, route);
    updateSyncStatusText('Ready');
  }

  updateNav(route);
}

function mutateDailyState(mutator) {
  const context = buildContext();
  const nextState = mutator(context.state, context.targets);
  saveDailyState(window.localStorage, context.todayIso, nextState);
  render();
}

async function saveSelectedPhoto(area, file) {
  const context = buildContext();
  const compressedBlob = await compressImageFile(file);
  await savePhotoDraft({
    id: buildPhotoDraftId(context.todayIso, area),
    area,
    date: context.todayIso,
    blob: compressedBlob,
    updatedAt: new Date().toISOString()
  });

  const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
  const photoDrafts = await getPhotoDrafts(context.todayIso);
  const byArea = draftsByArea(photoDrafts);
  saveCheckinDraft(
    window.localStorage,
    context.todayIso,
    markCheckinDraftDirty(storedDraft, PHOTO_AREAS.every((photoArea) => !!byArea[photoArea]))
  );
}

async function prepareCheckin() {
  const context = buildContext();
  const settingsError = getSettingsErrorMessage(context.settings);
  const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
  const photoDrafts = await getPhotoDrafts(context.todayIso);
  const byArea = draftsByArea(photoDrafts);
  const hasAllPhotos = PHOTO_AREAS.every((area) => !!byArea[area]);

  if (!hasAllPhotos) {
    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'draft',
      errorMessage: 'Add face, neck, and hands photos before preparing a check-in.'
    });
    render('log');
    return;
  }

  if (settingsError) {
    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'ready',
      errorMessage: settingsError
    });
    render('log');
    return;
  }

  saveCheckinDraft(window.localStorage, context.todayIso, {
    ...storedDraft,
    syncStatus: 'uploading',
    errorMessage: ''
  });
  render('log');

  const now = new Date();
  const checkinPath = buildCheckinPath(context.todayIso, formatLocalTimeValue(now));
  const adherence = getCompletionSummary(context.state, context.targets);
  const manifest = buildManifest({
    checkinPath,
    createdAt: formatLocalTimestamp(now),
    procedureDate: context.procedureDate,
    recoveryDay: context.recoveryDay,
    stageAuto: context.stage.id,
    symptoms: storedDraft.symptoms,
    adherence,
    note: storedDraft.note
  });
  const photoFiles = Object.fromEntries(
    await Promise.all(
      PHOTO_AREAS.map(async (area) => {
        const blob = byArea[area]?.blob;
        if (!(blob instanceof Blob)) {
          throw new Error(`Missing ${area} photo`);
        }
        return [`${area}.jpg`, await blobToBase64(blob)];
      })
    )
  );

  try {
    const client = createGitHubClient(context.settings);
    await client.uploadCheckin({
      path: checkinPath,
      files: photoFiles,
      manifest,
      summary: buildSummaryMarkdown(manifest),
      complete: buildCompleteMarker(manifest)
    });

    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'uploaded',
      uploadedCheckinPath: checkinPath,
      errorMessage: ''
    });
  } catch (error) {
    const message = error instanceof GitHubSettingsError
      ? error.message
      : `Upload failed before complete.json. ${error.message || 'Draft saved locally.'}`;

    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'upload_failed',
      errorMessage: message
    });
  }

  render('log');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
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
      return;
    }

    if (action === 'prepare-checkin') {
      void prepareCheckin().catch((error) => {
        const context = buildContext();
        const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
        saveCheckinDraft(window.localStorage, context.todayIso, {
          ...storedDraft,
          syncStatus: 'upload_failed',
          errorMessage: error.message || 'Could not prepare the check-in.'
        });
        render('log');
      });
    }
  });

  document.addEventListener('change', (event) => {
    const photoInput = event.target.closest('[data-photo-area]');
    if (photoInput instanceof HTMLInputElement && photoInput.files?.[0]) {
      void saveSelectedPhoto(photoInput.dataset.photoArea, photoInput.files[0])
        .then(() => render('log'))
        .catch((error) => {
          const context = buildContext();
          const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
          saveCheckinDraft(window.localStorage, context.todayIso, {
            ...storedDraft,
            syncStatus: nextSyncStatus(false),
            errorMessage: error.message || 'Could not save that photo.'
          });
          render('log');
        });
      return;
    }

    const symptomInput = event.target.closest('[data-symptom-id]');
    if (symptomInput instanceof HTMLInputElement) {
      const context = buildContext();
      const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
      void getPhotoDrafts(context.todayIso)
        .then((drafts) => {
          saveCheckinDraft(window.localStorage, context.todayIso, markCheckinDraftDirty({
            ...storedDraft,
            symptoms: {
              ...storedDraft.symptoms,
              [symptomInput.dataset.symptomId]: normalizeSymptomValue(symptomInput.value)
            }
          }, PHOTO_AREAS.every((area) => !!draftsByArea(drafts)[area])));
          render('log');
        })
        .catch(() => {
          saveCheckinDraft(window.localStorage, context.todayIso, {
            ...storedDraft,
            symptoms: {
              ...storedDraft.symptoms,
              [symptomInput.dataset.symptomId]: normalizeSymptomValue(symptomInput.value)
            }
          });
          render('log');
        });
    }
  });

  document.addEventListener('input', (event) => {
    const noteInput = event.target.closest('[data-note-input]');
    if (!(noteInput instanceof HTMLTextAreaElement)) {
      return;
    }

    const context = buildContext();
    const storedDraft = loadCheckinDraft(window.localStorage, context.todayIso);
    void getPhotoDrafts(context.todayIso)
      .then((drafts) => {
        saveCheckinDraft(window.localStorage, context.todayIso, markCheckinDraftDirty({
          ...storedDraft,
          note: noteInput.value
        }, PHOTO_AREAS.every((area) => !!draftsByArea(drafts)[area])));
        updateSyncStatusText(describeSyncState(loadCheckinDraft(window.localStorage, context.todayIso)));
      })
      .catch(() => {
        saveCheckinDraft(window.localStorage, context.todayIso, {
          ...storedDraft,
          note: noteInput.value
        });
      });
  });

  window.addEventListener('hashchange', () => render());
  window.addEventListener('beforeunload', revokeLogPreviewUrls);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  render();
}
