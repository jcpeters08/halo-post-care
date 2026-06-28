import { PHOTO_AREAS } from '../photos.js';
import { getProgressAreaView, PHOTO_AREA_LABELS } from '../progress.js';
import { escapeHtml } from './components.js';

function renderStatePanel({ label, title, details, action }) {
  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">${escapeHtml(label)}</p>
        <h2 class="section-title">${escapeHtml(title)}</h2>
      </div>
      <p class="body-copy">${escapeHtml(details)}</p>
      ${action || ''}
    </section>
  `;
}

function renderAreaSelector(selectedArea) {
  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">Area</p>
        <h2 class="section-title">Choose a photo set</h2>
      </div>
      <div class="segmented-control" role="group" aria-label="Progress photo area">
        ${PHOTO_AREAS.map((area) => {
          const selected = area === selectedArea;
          return `
            <button
              class="segmented-button${selected ? ' is-active' : ''}"
              type="button"
              data-action="set-progress-area"
              data-progress-area="${escapeHtml(area)}"
              aria-pressed="${selected ? 'true' : 'false'}"
            >${escapeHtml(PHOTO_AREA_LABELS[area])}</button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function formatRecoveryDay(entry) {
  return Number.isFinite(entry?.recoveryDay)
    ? `Recovery day ${entry.recoveryDay}`
    : 'Recovery day unknown';
}

function formatCheckinMeta(entry) {
  const date = entry?.date || 'Unknown date';
  const time = entry?.time ? ` - ${entry.time}` : '';
  return `${date}${time}`;
}

function renderPhotoFrame(entry, area, labelText = '') {
  const photo = entry?.photos?.[area];
  if (!photo?.src) {
    return `
      <div class="progress-photo-frame">
        <div class="progress-photo-placeholder">No ${escapeHtml(PHOTO_AREA_LABELS[area].toLowerCase())} photo</div>
      </div>
    `;
  }

  return `
    <div class="progress-photo-frame">
      <img
        class="progress-photo-image"
        src="${escapeHtml(photo.src)}"
        alt="${escapeHtml(`${labelText ? `${labelText} ` : ''}${PHOTO_AREA_LABELS[area]} photo ${formatCheckinMeta(entry)}`)}"
      >
    </div>
  `;
}

function renderTimelineCard(entry, area) {
  return `
    <article class="progress-photo-card">
      ${renderPhotoFrame(entry, area)}
      <div class="stack-xxs">
        <h3>${escapeHtml(formatRecoveryDay(entry))}</h3>
        <p class="meta-text">${escapeHtml(formatCheckinMeta(entry))}</p>
        <p class="meta-text">${escapeHtml(entry.checkinPath || '')}</p>
      </div>
    </article>
  `;
}

function renderTimeline(areaView) {
  if (areaView.timeline.length === 0) {
    return renderStatePanel({
      label: 'No photos for this area',
      title: `${areaView.label} timeline`,
      details: `No ${areaView.label.toLowerCase()} photos are available in completed check-ins yet.`
    });
  }

  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">${escapeHtml(areaView.label)} timeline</p>
        <h2 class="section-title">Newest to oldest</h2>
      </div>
      <div class="progress-photo-strip" aria-label="${escapeHtml(areaView.label)} photos over time">
        ${areaView.timeline.map((entry) => renderTimelineCard(entry, areaView.selectedArea)).join('')}
      </div>
    </section>
  `;
}

function renderComparisonCard(entry, area, label) {
  if (!entry) {
    return '';
  }

  return `
    <article class="progress-photo-card">
      <p class="status-pill">${escapeHtml(label)}</p>
      ${renderPhotoFrame(entry, area, label)}
      <div class="stack-xxs">
        <h3>${escapeHtml(formatRecoveryDay(entry))}</h3>
        <p class="meta-text">${escapeHtml(formatCheckinMeta(entry))}</p>
      </div>
    </article>
  `;
}

function renderLatestBaseline(areaView) {
  if (!areaView.latest || !areaView.baseline) {
    return '';
  }

  return `
    <section class="panel stack-md">
      <div class="stack-xs">
        <p class="section-label">Latest vs baseline</p>
        <h2 class="section-title">${escapeHtml(areaView.label)} comparison</h2>
      </div>
      <div class="progress-compare-grid">
        ${renderComparisonCard(areaView.latest, areaView.selectedArea, 'Latest')}
        ${renderComparisonCard(areaView.baseline, areaView.selectedArea, 'Baseline')}
      </div>
    </section>
  `;
}

export function renderProgress(root, viewModel = {}) {
  const status = viewModel.status || 'loading';
  const selectedArea = PHOTO_AREAS.includes(viewModel.selectedArea) ? viewModel.selectedArea : 'face';
  const entries = Array.isArray(viewModel.entries) ? viewModel.entries : [];

  if (status === 'missing_settings') {
    root.innerHTML = `
      <div class="stack-lg">
        ${renderStatePanel({
          label: 'Photo progress',
          title: 'Connect GitHub in Settings',
          details: 'Progress photos load from the private recovery data repo after GitHub settings are saved.'
        })}
      </div>
    `;
    return;
  }

  if (status === 'loading') {
    root.innerHTML = `
      <div class="stack-lg">
        ${renderStatePanel({
          label: 'Photo progress',
          title: 'Loading progress photos',
          details: 'Reading completed check-ins from the private recovery data repo.'
        })}
      </div>
    `;
    return;
  }

  if (status === 'error') {
    root.innerHTML = `
      <div class="stack-lg">
        ${renderStatePanel({
          label: 'Photo progress',
          title: 'Could not load progress photos',
          details: viewModel.errorMessage || 'GitHub photo sync failed.',
          action: '<button class="primary-button" type="button" data-action="retry-progress">Retry</button>'
        })}
      </div>
    `;
    return;
  }

  if (entries.length === 0) {
    root.innerHTML = `
      <div class="stack-lg">
        ${renderStatePanel({
          label: 'Photo progress',
          title: 'Progress appears after completed check-ins',
          details: 'Upload daily face, neck, and hands photos from Log, then return here to compare changes over time.'
        })}
      </div>
    `;
    return;
  }

  const areaView = getProgressAreaView(entries, selectedArea);

  root.innerHTML = `
    <div class="stack-lg">
      <section class="hero-panel stack-sm">
        <div class="stack-xs">
          <p class="eyebrow">Photo progress</p>
          <h2>Compare recovery over time</h2>
        </div>
        <p class="body-copy">${escapeHtml(entries.length)} completed check-in${entries.length === 1 ? '' : 's'} loaded from the private data repo.</p>
      </section>
      ${renderAreaSelector(areaView.selectedArea)}
      ${renderTimeline(areaView)}
      ${renderLatestBaseline(areaView)}
    </div>
  `;
}
