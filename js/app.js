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
  getRedLightMaskGuidance,
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
import {
  DEFAULT_SETTINGS,
  exportAll,
  loadSettings,
  loadJson,
  resetAll,
  saveJson,
  saveSettings
} from './storage.js';
import { renderAssessments } from './ui/assessments.js';
import { renderGuide } from './ui/guide.js';
import { getPrepareCheckinState, isSameDayUploadedCheckin, renderLog } from './ui/log.js';
import { renderSettings } from './ui/settings.js';
import { renderToday } from './ui/today.js';

const routes = ['today', 'log', 'assessments', 'guide', 'settings'];
const DAILY_STATE_KEY = 'halo_daily_v1';
const APPLIED_ASSESSMENT_KEY = 'halo_applied_assessment_v1';
const CHECKIN_DRAFTS_KEY = 'halo_checkin_drafts_v1';
const DAILY_CLAIM_FILE = 'daily-claim.json';
const PHOTO_DB_NAME = 'halo-post-care-db';
const DEFAULT_SYMPTOMS = {
  redness: 1,
  swelling: 1,
  flaking: 1,
  itch: 1,
  tightness: 1
};

let activeLogRenderToken = 0;
let activeLogPreviewUrls = [];
let settingsDraftState = null;
let settingsUiState = createInitialSettingsUiState();

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
    claimedCheckinPath: '',
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
    claimedCheckinPath: typeof storedDraft.claimedCheckinPath === 'string'
      ? storedDraft.claimedCheckinPath
      : '',
    uploadedCheckinPath: typeof storedDraft.uploadedCheckinPath === 'string'
      ? storedDraft.uploadedCheckinPath
      : '',
    errorMessage: typeof storedDraft.errorMessage === 'string' ? storedDraft.errorMessage : ''
  };
}

function createInitialSettingsUiState() {
  return {
    connectionMessage: '',
    connectionTone: 'neutral',
    syncMessage: '',
    syncTone: 'neutral',
    dataMessage: '',
    dataTone: 'neutral',
    resetConfirming: false,
    busyAction: ''
  };
}

function mergeSettingsDraft(nextSettings) {
  settingsDraftState = {
    ...DEFAULT_SETTINGS,
    ...(settingsDraftState ?? {}),
    ...(isPlainObject(nextSettings) ? nextSettings : {})
  };
  return settingsDraftState;
}

function normalizeSettingsInput(rawSettings) {
  const acyclovirRaw = Number(rawSettings?.acyclovirPerDay);
  const normalizedAcyclovir = Number.isFinite(acyclovirRaw)
    ? Math.max(0, Math.trunc(acyclovirRaw))
    : DEFAULT_SETTINGS.acyclovirPerDay;

  return {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    procedureDate: typeof rawSettings?.procedureDate === 'string' && rawSettings.procedureDate
      ? rawSettings.procedureDate
      : DEFAULT_SETTINGS.procedureDate,
    acyclovirPerDay: normalizedAcyclovir,
    githubOwner: typeof rawSettings?.githubOwner === 'string'
      ? rawSettings.githubOwner.trim()
      : DEFAULT_SETTINGS.githubOwner,
    dataRepo: typeof rawSettings?.dataRepo === 'string'
      ? rawSettings.dataRepo.trim()
      : DEFAULT_SETTINGS.dataRepo,
    token: typeof rawSettings?.token === 'string' ? rawSettings.token.trim() : ''
  };
}

function readSettingsForm() {
  const form = document.querySelector('[data-settings-form]');
  if (!(form instanceof HTMLFormElement)) {
    return normalizeSettingsInput(settingsDraftState ?? loadSettings(window.localStorage));
  }

  const formData = new FormData(form);
  return normalizeSettingsInput({
    ...settingsDraftState,
    procedureDate: `${formData.get('procedureDate') ?? ''}`,
    acyclovirPerDay: `${formData.get('acyclovirPerDay') ?? ''}`,
    githubOwner: `${formData.get('githubOwner') ?? ''}`,
    dataRepo: `${formData.get('dataRepo') ?? ''}`,
    token: `${formData.get('token') ?? ''}`
  });
}

function setSettingsUiState(nextState) {
  settingsUiState = {
    ...settingsUiState,
    ...nextState
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
  const uploadedToday = isSameDayUploadedCheckin(draft, getTodayIso());
  return {
    ...draft,
    syncStatus: uploadedToday ? 'uploaded' : nextSyncStatus(hasRequiredPhotos),
    claimedCheckinPath: uploadedToday ? draft.claimedCheckinPath : draft.claimedCheckinPath,
    uploadedCheckinPath: uploadedToday ? draft.uploadedCheckinPath : '',
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

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function clearLocalDraftPhotos() {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.deleteDatabase !== 'function') {
    return false;
  }

  return await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(PHOTO_DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

async function syncLatestAssessment(settings) {
  const client = createGitHubClient(settings);
  const assessmentPaths = await client.findAssessmentFiles();

  if (assessmentPaths.length === 0) {
    throw new Error('No completed check-ins with assessment.json were found.');
  }

  const validAssessments = [];

  for (const assessmentPath of assessmentPaths) {
    try {
      const assessment = await client.getJson(assessmentPath);
      const candidate = {
        ...assessment,
        assessmentPath
      };

      if (isValidAssessmentCandidate(candidate)) {
        validAssessments.push(candidate);
      }
    } catch {
      // Ignore malformed or unreadable assessment files and keep scanning for a valid one.
    }
  }

  const latestAssessment = selectLatestValidAssessment(validAssessments);
  if (!latestAssessment) {
    throw new Error('No valid assessment.json files found in completed check-ins.');
  }

  saveJson(window.localStorage, APPLIED_ASSESSMENT_KEY, {
    syncedAt: new Date().toISOString(),
    assessments: sortAssessmentsNewestFirst(validAssessments)
  });
  saveSettings(window.localStorage, {
    ...loadSettings(window.localStorage),
    lastAssessmentPath: latestAssessment.assessmentPath ?? ''
  });

  return latestAssessment;
}

function describeSyncState(draft) {
  if (draft.syncStatus === 'uploading') {
    return 'Uploading check-in...';
  }

  if (isSameDayUploadedCheckin(draft, getTodayIso())) {
    return 'Today\'s check-in already uploaded.';
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

function getDirectoryEntryPath(entry, fallbackPath) {
  return entry?.path || fallbackPath;
}

function isDirectoryEntry(entry) {
  return entry?.type === 'dir';
}

function isFileEntry(entry, fileName) {
  return entry?.type === 'file' && entry?.name === fileName;
}

export async function checkinPathHasCompleteMarker(client, checkinPath) {
  try {
    const checkinEntries = await client.listDirectory(checkinPath);
    return checkinEntries.some((checkinEntry) => isFileEntry(checkinEntry, 'complete.json'));
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function findCompletedCheckinPathForDate(client, todayIso) {
  const datePath = `checkins/${todayIso}`;
  let dateEntries;

  try {
    dateEntries = await client.listDirectory(datePath);
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }

  for (const entry of dateEntries.filter(isDirectoryEntry)) {
    const checkinPath = getDirectoryEntryPath(entry, `${datePath}/${entry?.name || ''}`);
    if (await checkinPathHasCompleteMarker(client, checkinPath)) {
      return checkinPath;
    }
  }

  return null;
}

function buildDayClaimPath(todayIso) {
  return `checkins/${todayIso}/${DAILY_CLAIM_FILE}`;
}

function buildDayClaim({ todayIso, checkinPath, claimedAt }) {
  return {
    schemaVersion: 1,
    date: todayIso,
    checkinPath,
    claimedAt
  };
}

function isNotFoundError(error) {
  return error?.status === 404;
}

function isClaimConflictError(error) {
  if (error?.status === 409 || error?.status === 422) {
    return true;
  }

  return /already exists|exists/i.test(`${error?.message || ''}`);
}

function getClaimPathForDate(claim, todayIso) {
  if (!isPlainObject(claim) || typeof claim.checkinPath !== 'string') {
    return '';
  }

  return claim.checkinPath.startsWith(`checkins/${todayIso}/`) ? claim.checkinPath : '';
}

async function loadDayClaim(client, todayIso) {
  try {
    return await client.getJson(buildDayClaimPath(todayIso));
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function reserveCheckinDay({
  client,
  todayIso,
  proposedCheckinPath,
  claimedAt,
  syncStatus,
  claimedCheckinPath
}) {
  const existingClaim = await loadDayClaim(client, todayIso);
  const existingClaimPath = getClaimPathForDate(existingClaim, todayIso);
  const reusableClaimPath = typeof claimedCheckinPath === 'string'
    && claimedCheckinPath.startsWith(`checkins/${todayIso}/`)
    ? claimedCheckinPath
    : '';

  if (existingClaimPath) {
    const claimHasCompleteMarker = await checkinPathHasCompleteMarker(client, existingClaimPath);

    if (!claimHasCompleteMarker && syncStatus === 'upload_failed' && reusableClaimPath && reusableClaimPath === existingClaimPath) {
      return {
        status: 'reserved',
        checkinPath: existingClaimPath,
        claimedCheckinPath: existingClaimPath
      };
    }

    return {
      status: 'blocked',
      checkinPath: existingClaimPath,
      claimedCheckinPath: existingClaimPath,
      reason: claimHasCompleteMarker ? 'completed' : 'claimed'
    };
  }

  const existingCompletedPath = await findCompletedCheckinPathForDate(client, todayIso);
  if (existingCompletedPath) {
    return {
      status: 'blocked',
      checkinPath: existingCompletedPath,
      claimedCheckinPath: existingCompletedPath,
      reason: 'completed'
    };
  }

  if (syncStatus === 'upload_failed' && reusableClaimPath) {
    return {
      status: 'reserved',
      checkinPath: reusableClaimPath,
      claimedCheckinPath: reusableClaimPath
    };
  }

  try {
    await client.putFile(
      buildDayClaimPath(todayIso),
      JSON.stringify(buildDayClaim({
        todayIso,
        checkinPath: proposedCheckinPath,
        claimedAt
      }), null, 2),
      'Claim daily check-in'
    );

    return {
      status: 'reserved',
      checkinPath: proposedCheckinPath,
      claimedCheckinPath: proposedCheckinPath
    };
  } catch (error) {
    if (!isClaimConflictError(error)) {
      throw error;
    }

    const conflictingClaim = await loadDayClaim(client, todayIso);
    const conflictingClaimPath = getClaimPathForDate(conflictingClaim, todayIso);
    if (conflictingClaimPath) {
      const claimHasCompleteMarker = await checkinPathHasCompleteMarker(client, conflictingClaimPath);
      return {
        status: 'blocked',
        checkinPath: conflictingClaimPath,
        claimedCheckinPath: conflictingClaimPath,
        reason: claimHasCompleteMarker ? 'completed' : 'claimed'
      };
    }

    const completedPath = await findCompletedCheckinPathForDate(client, todayIso);
    if (completedPath) {
      return {
        status: 'blocked',
        checkinPath: completedPath,
        claimedCheckinPath: completedPath,
        reason: 'completed'
      };
    }

    return {
      status: 'blocked',
      checkinPath: '',
      claimedCheckinPath: '',
      reason: 'claimed'
    };
  }
}

export function buildBlockedReservationDraft(storedDraft, reservation) {
  const knownPath = reservation?.checkinPath || '';

  if (reservation?.reason === 'completed') {
    return {
      ...storedDraft,
      syncStatus: 'uploaded',
      claimedCheckinPath: knownPath,
      uploadedCheckinPath: knownPath,
      errorMessage: ''
    };
  }

  return {
    ...storedDraft,
    syncStatus: 'upload_failed',
    claimedCheckinPath: '',
    uploadedCheckinPath: '',
    errorMessage: 'Another device is preparing today\'s check-in. Sync/try again after it finishes.'
  };
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

function getExpectedAssessmentCheckinPath(assessmentPath) {
  if (typeof assessmentPath !== 'string' || !assessmentPath.endsWith('/assessment.json')) {
    return '';
  }

  return assessmentPath.slice(0, -'/assessment.json'.length);
}

function isValidAssessmentCandidate(candidate) {
  if (!validateAssessment(candidate).valid) {
    return false;
  }

  if (typeof candidate?.assessmentPath !== 'string') {
    return true;
  }

  return candidate.checkinPath === getExpectedAssessmentCheckinPath(candidate.assessmentPath);
}

function sortAssessmentsNewestFirst(assessments) {
  return [...assessments].sort((a, b) => {
    const dateCompare = `${b?.assessmentDate || ''}`.localeCompare(`${a?.assessmentDate || ''}`);
    if (dateCompare !== 0) return dateCompare;
    return `${b?.checkinPath || ''}`.localeCompare(`${a?.checkinPath || ''}`);
  });
}

export function loadAssessmentHistory(storage) {
  const candidate = loadJson(storage, APPLIED_ASSESSMENT_KEY, null);
  return sortAssessmentsNewestFirst(getAssessmentCandidates(candidate).filter(isValidAssessmentCandidate));
}

export function loadAppliedAssessment(storage) {
  return selectLatestValidAssessment(loadAssessmentHistory(storage));
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
  const assessmentHistory = loadAssessmentHistory(window.localStorage);
  const assessment = selectLatestValidAssessment(assessmentHistory);
  const { guidance, provenance } = getGuidanceContext(assessment);

  return {
    assessment,
    assessmentHistory,
    guidance,
    procedureDate: settings.procedureDate,
    provenance,
    redLightMaskGuidance: getRedLightMaskGuidance(recoveryDay),
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

function renderSettingsRoute(root, context) {
  const settings = mergeSettingsDraft(settingsDraftState ?? context.settings);
  renderSettings(root, {
    settings,
    connectionMessage: settingsUiState.connectionMessage,
    connectionTone: settingsUiState.connectionTone,
    syncMessage: settingsUiState.syncMessage,
    syncTone: settingsUiState.syncTone,
    dataMessage: settingsUiState.dataMessage,
    dataTone: settingsUiState.dataTone,
    resetConfirming: settingsUiState.resetConfirming,
    busyAction: settingsUiState.busyAction,
    appliedAssessment: context.assessment
  });
}

function render(route = getRoute()) {
  const root = document.querySelector('#app');
  const title = document.querySelector('#screen-title');
  const labels = {
    today: 'Today',
    log: 'Log',
    assessments: 'Assessments',
    guide: 'Guide',
    settings: 'Settings'
  };
  const context = buildContext();

  title.textContent = labels[route];

  if (route === 'today') {
    revokeLogPreviewUrls();
    renderToday(root, context);
    updateSyncStatusText('Ready');
  } else if (route === 'log') {
    void renderLogRoute(root, context);
  } else if (route === 'assessments') {
    revokeLogPreviewUrls();
    renderAssessments(root, context);
    updateSyncStatusText('Ready');
  } else if (route === 'guide') {
    revokeLogPreviewUrls();
    renderGuide(root, context);
    updateSyncStatusText('Ready');
  } else if (route === 'settings') {
    revokeLogPreviewUrls();
    renderSettingsRoute(root, context);
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
  const prepareState = getPrepareCheckinState({
    draft: storedDraft,
    todayIso: context.todayIso,
    hasAllPhotos
  });

  if (prepareState.reason === 'already_uploaded') {
    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'uploaded',
      claimedCheckinPath: storedDraft.claimedCheckinPath,
      errorMessage: ''
    });
    render('log');
    return;
  }

  if (!hasAllPhotos) {
    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'draft',
      claimedCheckinPath: storedDraft.claimedCheckinPath,
      errorMessage: prepareState.message
    });
    render('log');
    return;
  }

  if (settingsError) {
    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'ready',
      claimedCheckinPath: storedDraft.claimedCheckinPath,
      errorMessage: settingsError
    });
    render('log');
    return;
  }

  const now = new Date();
  const claimedAt = formatLocalTimestamp(now);
  const proposedCheckinPath = storedDraft.syncStatus === 'upload_failed' && storedDraft.claimedCheckinPath
    ? storedDraft.claimedCheckinPath
    : buildCheckinPath(context.todayIso, formatLocalTimeValue(now));

  let client;
  let reservedCheckinPath = storedDraft.claimedCheckinPath;
  let startedUpload = false;
  try {
    client = createGitHubClient(context.settings);
    const reservation = await reserveCheckinDay({
      client,
      todayIso: context.todayIso,
      proposedCheckinPath,
      claimedAt,
      syncStatus: storedDraft.syncStatus,
      claimedCheckinPath: storedDraft.claimedCheckinPath
    });

    if (reservation.status === 'blocked') {
      saveCheckinDraft(
        window.localStorage,
        context.todayIso,
        buildBlockedReservationDraft(storedDraft, reservation)
      );
      render('log');
      return;
    }

    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'uploading',
      claimedCheckinPath: reservation.claimedCheckinPath,
      uploadedCheckinPath: '',
      errorMessage: ''
    });
    startedUpload = true;
    render('log');

    const checkinPath = reservation.checkinPath;
    reservedCheckinPath = checkinPath;
    const adherence = getCompletionSummary(context.state, context.targets);
    const manifest = buildManifest({
      checkinPath,
      createdAt: claimedAt,
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
      claimedCheckinPath: checkinPath,
      uploadedCheckinPath: checkinPath,
      errorMessage: ''
    });
  } catch (error) {
    const message = error instanceof GitHubSettingsError
      ? error.message
      : startedUpload
        ? `Upload failed before complete.json. ${error.message || 'Draft saved locally.'}`
        : `Could not reserve today's check-in upload. ${error.message || 'Try again.'}`;

    saveCheckinDraft(window.localStorage, context.todayIso, {
      ...storedDraft,
      syncStatus: 'upload_failed',
      claimedCheckinPath: reservedCheckinPath,
      errorMessage: message
    });
    render('log');
    return;
  }
  render('log');
}

function resetSettingsFeedback() {
  setSettingsUiState({
    connectionMessage: '',
    connectionTone: 'neutral',
    syncMessage: '',
    syncTone: 'neutral',
    dataMessage: '',
    dataTone: 'neutral'
  });
}

function isSettingsActionBlocked() {
  return Boolean(settingsUiState.busyAction);
}

function persistSettingsFromForm() {
  const nextSettings = mergeSettingsDraft(readSettingsForm());
  saveSettings(window.localStorage, nextSettings);
  resetSettingsFeedback();
  setSettingsUiState({
    dataMessage: 'Settings saved.',
    dataTone: 'ok',
    resetConfirming: false,
    busyAction: ''
  });
  render('settings');
}

async function testSettingsConnection() {
  const nextSettings = mergeSettingsDraft(readSettingsForm());
  setSettingsUiState({
    busyAction: 'test-connection',
    connectionMessage: '',
    connectionTone: 'neutral',
    syncMessage: '',
    syncTone: 'neutral',
    resetConfirming: false
  });
  render('settings');

  try {
    const client = createGitHubClient(nextSettings);
    await client.testConnection();
    setSettingsUiState({
      busyAction: '',
      connectionMessage: 'Connection OK.',
      connectionTone: 'ok'
    });
  } catch (error) {
    setSettingsUiState({
      busyAction: '',
      connectionMessage: error.message || 'Connection test failed.',
      connectionTone: 'warning'
    });
  }

  render('settings');
}

async function applySyncedAssessment() {
  const nextSettings = mergeSettingsDraft(readSettingsForm());
  setSettingsUiState({
    busyAction: 'sync-assessment',
    connectionMessage: '',
    connectionTone: 'neutral',
    syncMessage: '',
    syncTone: 'neutral',
    resetConfirming: false
  });
  render('settings');

  try {
    const assessment = await syncLatestAssessment(nextSettings);
    setSettingsUiState({
      busyAction: '',
      syncMessage: `Synced Codex assessments through ${assessment.assessmentDate}.`,
      syncTone: 'ok'
    });
  } catch (error) {
    setSettingsUiState({
      busyAction: '',
      syncMessage: error.message || 'Codex assessment sync failed.',
      syncTone: 'warning'
    });
  }

  render('settings');
}

function exportLocalData() {
  const payload = exportAll(window.localStorage);
  downloadJsonFile(`halo-post-care-export-${getTodayIso()}.json`, payload);
  setSettingsUiState({
    dataMessage: 'Export downloaded.',
    dataTone: 'ok',
    resetConfirming: false,
    busyAction: ''
  });
  render('settings');
}

async function resetLocalData() {
  if (!settingsUiState.resetConfirming) {
    setSettingsUiState({
      dataMessage: 'Tap reset again to clear app data and local draft photos.',
      dataTone: 'warning',
      resetConfirming: true,
      busyAction: ''
    });
    render('settings');
    return;
  }

  setSettingsUiState({
    busyAction: 'reset-data',
    dataMessage: '',
    dataTone: 'neutral'
  });
  render('settings');

  resetAll(window.localStorage);
  settingsDraftState = { ...DEFAULT_SETTINGS };
  const photosCleared = await clearLocalDraftPhotos();
  settingsUiState = createInitialSettingsUiState();
  setSettingsUiState({
    dataMessage: photosCleared
      ? 'Local app data cleared.'
      : 'Local settings were cleared, but draft photos could not be removed automatically.',
    dataTone: photosCleared ? 'ok' : 'warning'
  });
  render('settings');
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
      return;
    }

    if (action === 'save-settings') {
      if (isSettingsActionBlocked()) {
        return;
      }
      persistSettingsFromForm();
      return;
    }

    if (action === 'test-connection') {
      if (isSettingsActionBlocked()) {
        return;
      }
      void testSettingsConnection();
      return;
    }

    if (action === 'sync-assessment') {
      if (isSettingsActionBlocked()) {
        return;
      }
      void applySyncedAssessment();
      return;
    }

    if (action === 'export-data') {
      if (isSettingsActionBlocked()) {
        return;
      }
      exportLocalData();
      return;
    }

    if (action === 'reset-data') {
      if (isSettingsActionBlocked()) {
        return;
      }
      void resetLocalData();
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
    const settingsInput = event.target.closest('[data-settings-field]');
    if (settingsInput instanceof HTMLInputElement) {
      mergeSettingsDraft(readSettingsForm());
      return;
    }

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
