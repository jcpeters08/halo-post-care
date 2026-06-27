import { CLINIC_CONTACTS, SAFETY_TRIGGERS } from '../data.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function statusClass(status) {
  return {
    on_track: 'is-ok',
    ok: 'is-ok',
    expected: 'is-ok',
    routine: 'is-ok',
    limited: 'is-limited',
    monitor: 'is-watch',
    watch: 'is-watch',
    wait: 'is-wait',
    avoid: 'is-call',
    ask_provider: 'is-call',
    concern: 'is-call',
    urgent: 'is-call',
    call_clinic: 'is-call'
  }[status] ?? 'is-watch';
}

function formatLabel(value) {
  return `${value ?? ''}`
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderAssessmentObservations(observations) {
  const rows = Array.isArray(observations)
    ? observations.filter((entry) => entry && typeof entry === 'object')
    : [];

  if (rows.length === 0) {
    return '<p class="meta-text">No area-specific observations were included.</p>';
  }

  return `
    <div class="assessment-observation-grid">
      ${rows.map((entry) => `
        <article class="assessment-observation">
          <div class="assessment-observation__header">
            <h3>${escapeHtml(formatLabel(entry.area || 'overall'))}</h3>
            <p class="status-pill ${statusClass(entry.severity)}">${escapeHtml(formatLabel(entry.severity || 'watch'))}</p>
          </div>
          <p>${escapeHtml(entry.note || 'No note provided.')}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderAssessmentActions(actions) {
  const rows = Array.isArray(actions)
    ? actions.filter((action) => typeof action === 'string' && action.trim())
    : [];

  if (rows.length === 0) {
    return '';
  }

  return `
    <div class="stack-xs">
      <h3 class="assessment-subtitle">Next actions</h3>
      <ul class="bullet-list">${rows.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>
    </div>
  `;
}

export function renderAssessmentDetails(assessment, options = {}) {
  if (!assessment || typeof assessment !== 'object') {
    return '';
  }

  const headingId = options.headingId || 'photo-assessment-title';
  const label = options.label || 'Codex photo read';
  const title = options.title || 'Photo assessment';
  const overall = assessment.overall && typeof assessment.overall === 'object'
    ? assessment.overall
    : {};
  const safety = assessment.safety && typeof assessment.safety === 'object'
    ? assessment.safety
    : {};
  const status = overall.status || 'watch';
  const confidence = overall.confidence || 'medium';
  const urgency = safety.urgency || 'routine';
  const sectionClass = options.sectionClass || 'panel stack-md codex-assessment';

  return `
    <section class="${sectionClass}" aria-labelledby="${escapeHtml(headingId)}">
      <div class="section-row">
        <div class="stack-xs">
          <p class="section-label">${escapeHtml(label)}</p>
          <h2 id="${escapeHtml(headingId)}" class="section-title">${escapeHtml(title)}</h2>
        </div>
        <div class="assessment-status-row">
          <p class="status-pill ${statusClass(status)}">${escapeHtml(formatLabel(status))}</p>
          <p class="status-pill ${statusClass(urgency)}">${escapeHtml(formatLabel(urgency))}</p>
        </div>
      </div>
      ${overall.summary ? `<p class="body-copy assessment-summary">${escapeHtml(overall.summary)}</p>` : ''}
      <div class="assessment-meta-grid">
        <p><span>Date</span>${escapeHtml(assessment.assessmentDate || 'Unknown')}</p>
        <p><span>Confidence</span>${escapeHtml(formatLabel(confidence))}</p>
        <p><span>Check-in</span>${escapeHtml(assessment.checkinPath || 'Unknown')}</p>
      </div>
      ${renderAssessmentObservations(assessment.observations)}
      ${renderAssessmentActions(assessment.nextActions)}
    </section>
  `;
}

export function renderGuidanceCards(guidance, provenance) {
  const cards = Object.values(guidance)
    .map(
      (entry) => `
        <article class="guidance-card ${statusClass(entry.status)}">
          <div class="guidance-card__header">
            <p class="status-pill ${statusClass(entry.status)}">${escapeHtml(entry.status.replaceAll('_', ' '))}</p>
            <h3>${escapeHtml(entry.title)}</h3>
          </div>
          <p>${escapeHtml(entry.details)}</p>
          <p class="meta-text">Review: ${escapeHtml(entry.reviewAfter.replaceAll('_', ' '))}</p>
        </article>
      `
    )
    .join('');

  return `
    <section class="panel stack-md" aria-labelledby="guidance-title">
      <div class="stack-xs">
        <p class="section-label">Codex guidance</p>
        <h2 id="guidance-title" class="section-title">What to hold steady today</h2>
      </div>
      <div class="guidance-grid">${cards}</div>
      <p class="meta-text">Provenance: ${escapeHtml(provenance)}</p>
    </section>
  `;
}

export function renderSafetyPanel() {
  const contacts = CLINIC_CONTACTS.map((contact) => {
    const phoneLabel = contact.phone.replaceAll('-', '.');
    const note = contact.note ? ` <span class="meta-text">${escapeHtml(contact.note)}</span>` : '';
    return `
      <li class="contact-list__item">
        <div class="stack-xxs">
          <strong>${escapeHtml(contact.label)}</strong>
          <span class="meta-text">${escapeHtml(contact.availability ?? '')}</span>
        </div>
        <a class="call-link call-link--inline" href="tel:${contact.phone.replaceAll('-', '')}">${escapeHtml(phoneLabel)}</a>${note}
      </li>
    `;
  }).join('');

  const triggers = SAFETY_TRIGGERS.map((trigger) => `<li>${escapeHtml(trigger)}</li>`).join('');

  return `
    <section class="panel stack-md" aria-labelledby="safety-title">
      <div class="stack-xs">
        <p class="section-label">Call clinic if</p>
        <h2 id="safety-title" class="section-title">Do not wait on these changes</h2>
      </div>
      <ul class="bullet-list">${triggers}</ul>
      <ul class="contact-list">${contacts}</ul>
    </section>
  `;
}
