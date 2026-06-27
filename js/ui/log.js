import { PHOTO_AREAS } from '../photos.js';

const PHOTO_LABELS = {
  face: 'Face',
  neck: 'Neck',
  hands: 'Hands'
};

const PHOTO_HINTS = {
  face: 'Straight-on, even light, no filters.',
  neck: 'Include the full treated neck area.',
  hands: 'Show both hands in one frame if possible.'
};

const SYMPTOM_FIELDS = [
  ['redness', 'Redness'],
  ['swelling', 'Swelling'],
  ['flaking', 'Flaking'],
  ['itch', 'Itch'],
  ['tightness', 'Tightness']
];

const SYNC_LABELS = {
  draft: 'Draft',
  ready: 'Ready',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  upload_failed: 'Upload failed'
};

const SYNC_TONES = {
  draft: '',
  ready: 'is-watch',
  uploading: 'is-limited',
  uploaded: 'is-ok',
  upload_failed: 'is-call'
};

export function isSameDayUploadedCheckin(draft, todayIso) {
  if (draft?.syncStatus !== 'uploaded') {
    return false;
  }

  if (typeof draft?.uploadedCheckinPath !== 'string' || typeof todayIso !== 'string') {
    return false;
  }

  return draft.uploadedCheckinPath.startsWith(`checkins/${todayIso}/`);
}

export function getPrepareCheckinState({ draft, todayIso, hasAllPhotos }) {
  if (isSameDayUploadedCheckin(draft, todayIso)) {
    return {
      disabled: true,
      label: 'Today\'s check-in uploaded',
      message: 'Today\'s check-in already uploaded. Come back tomorrow for the next one.',
      reason: 'already_uploaded'
    };
  }

  if (draft?.syncStatus === 'uploading') {
    return {
      disabled: true,
      label: 'Uploading...',
      message: '',
      reason: 'uploading'
    };
  }

  if (!hasAllPhotos) {
    return {
      disabled: true,
      label: 'Prepare check-in',
      message: 'Add face, neck, and hands photos before preparing a check-in.',
      reason: 'missing_photos'
    };
  }

  return {
    disabled: false,
    label: 'Prepare check-in',
    message: '',
    reason: 'ready'
  };
}

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderPhotoSlot(area, photoDraft, previewUrl) {
  const label = PHOTO_LABELS[area] ?? area;
  const preview = previewUrl
    ? `<img class="photo-slot__image" src="${previewUrl}" alt="${label} draft preview">`
    : `<div class="photo-slot__placeholder">Add ${label.toLowerCase()} photo</div>`;
  const capturedAt = photoDraft?.updatedAt
    ? new Date(photoDraft.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Required';

  return `
    <label class="photo-slot stack-sm">
      <div class="section-row">
        <div class="stack-xxs">
          <h3>${label}</h3>
          <p class="meta-text">${PHOTO_HINTS[area]}</p>
        </div>
        <span class="status-pill ${photoDraft ? 'is-ok' : ''}">${capturedAt}</span>
      </div>
      <div class="photo-slot__preview">${preview}</div>
      <span class="file-field">
        <span>Choose photo</span>
        <input
          class="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          data-photo-area="${area}"
        >
      </span>
    </label>
  `;
}

function renderSymptomField(id, label, value) {
  return `
    <div class="symptom-row">
      <div class="stack-xxs">
        <p class="symptom-row__label">${label}</p>
        <p class="meta-text">1 is mild, 5 is intense.</p>
      </div>
      <div class="score-group" role="radiogroup" aria-label="${label}">
        ${[1, 2, 3, 4, 5].map((score) => `
          <label class="score-chip">
            <input
              type="radio"
              name="symptom-${id}"
              value="${score}"
              data-symptom-id="${id}"
              ${score === value ? 'checked' : ''}
            >
            <span>${score}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderLog(root, context, viewModel) {
  const { photoDraftsByArea = {}, previewUrls = {}, photoError = '', draft } = viewModel;
  const hasAllPhotos = PHOTO_AREAS.every((area) => !!photoDraftsByArea[area]);
  const prepareState = getPrepareCheckinState({
    draft,
    todayIso: context.todayIso,
    hasAllPhotos
  });
  const syncStatus = draft.syncStatus ?? 'draft';
  const syncLabel = SYNC_LABELS[syncStatus] ?? SYNC_LABELS.draft;
  const syncTone = SYNC_TONES[syncStatus] ?? '';
  const helperText = photoError
    || draft.errorMessage
    || prepareState.message
    || (draft.uploadedCheckinPath ? `Latest upload: ${draft.uploadedCheckinPath}` : 'Drafts stay on this device until upload finishes.');

  root.innerHTML = `
    <section class="stack-lg">
      <section class="hero-panel stack-md">
        <div class="hero-panel__top">
          <div class="stack-xs">
            <p class="section-label">Check-in log</p>
            <h2 class="section-title">Recovery day ${context.recoveryDay}</h2>
          </div>
          <span class="status-pill ${syncTone}">${syncLabel}</span>
        </div>
        <p class="hero-summary">${context.stage.summary}</p>
        <p class="meta-text">${helperText}</p>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Required photos</p>
          <h2 class="section-title">Face, neck, and hands</h2>
        </div>
        <div class="photo-grid">
          ${PHOTO_AREAS.map((area) => renderPhotoSlot(area, photoDraftsByArea[area], previewUrls[area])).join('')}
        </div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Symptoms</p>
          <h2 class="section-title">Rate today&apos;s skin response</h2>
        </div>
        <div class="stack-sm">
          ${SYMPTOM_FIELDS.map(([id, label]) => renderSymptomField(id, label, draft.symptoms[id])).join('')}
        </div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Notes</p>
          <h2 class="section-title">Anything worth flagging?</h2>
        </div>
        <label class="stack-xs">
          <span class="meta-text">Keep it short. This goes into the check-in summary.</span>
          <textarea
            class="note-input"
            rows="5"
            maxlength="1200"
            placeholder="Warm after cleansing, hands feel tighter than face, skipped SPF reapply..."
            data-note-input="true"
          >${escapeHtml(draft.note)}</textarea>
        </label>
      </section>

      <section class="panel stack-md">
        <div class="section-row">
          <div class="stack-xxs">
            <p class="section-label">Upload</p>
            <h2 class="section-title">Prepare check-in</h2>
          </div>
          <button
            class="primary-button"
            type="button"
            data-action="prepare-checkin"
            ${prepareState.disabled ? 'disabled' : ''}
          >
            ${prepareState.label}
          </button>
        </div>
        <p class="body-copy">Uploads summary.md, manifest.json, three JPGs, and complete.json after the required photos are ready.</p>
      </section>
    </section>
  `;
}
