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
    ok: 'is-ok',
    limited: 'is-limited',
    watch: 'is-watch',
    wait: 'is-wait',
    call_clinic: 'is-call'
  }[status] ?? 'is-watch';
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
