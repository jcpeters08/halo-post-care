import { CLINIC_CONTACTS, RECOVERY_CONTENT, SAFETY_TRIGGERS } from '../data.js';
import { escapeHtml } from './components.js';

const REINTRODUCTION_LADDER = [
  'Stay with cleanser, barrier support, and mineral SPF until skin is peeled and calm.',
  'Patch test one familiar active on a small area for one night.',
  'If calm after 48 hours, resume that active every third night.',
  'Add the next active only after the first one stays quiet for several uses.'
];

function renderTimeline() {
  return RECOVERY_CONTENT.timeline
    .map((entry) => `
      <article class="timeline-card">
        <div class="stack-xxs">
          <p class="section-label">${escapeHtml(entry.title)}</p>
          <h3>${escapeHtml(RECOVERY_CONTENT.stages[entry.stageId].title)}</h3>
        </div>
        <p>${escapeHtml(entry.keyTakeaway)}</p>
      </article>
    `)
    .join('');
}

function renderTreatedAreas() {
  return RECOVERY_CONTENT.treatedAreas
    .map((area) => `
      <article class="mini-card">
        <h3>${escapeHtml(area.title)}</h3>
        <p>Use the same gentle routine and watch for uneven swelling, burning, or delayed peeling here.</p>
      </article>
    `)
    .join('');
}

function renderStandingRules() {
  return Object.values(RECOVERY_CONTENT.standingRules)
    .map((rule) => `
      <article class="rule-row">
        <h3>${escapeHtml(rule.title)}</h3>
        <p>${escapeHtml(rule.details)}</p>
      </article>
    `)
    .join('');
}

function renderReintroductionLadder() {
  return REINTRODUCTION_LADDER.map(
    (step, index) => `
      <li class="ladder-step">
        <span class="ladder-step__index">${index + 1}</span>
        <span>${escapeHtml(step)}</span>
      </li>
    `
  ).join('');
}

function renderContacts() {
  return CLINIC_CONTACTS.map(
    (contact) => `
      <li>
        <strong>${escapeHtml(contact.label)}</strong>: ${escapeHtml(contact.phone)}
      </li>
    `
  ).join('');
}

export function renderGuide(root, context) {
  void context;
  root.innerHTML = `
    <div class="stack-lg">
      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Day-by-day guide</p>
          <h2 class="section-title">What changes as recovery moves forward</h2>
        </div>
        <div class="timeline-grid">${renderTimeline()}</div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Treated areas</p>
          <h2 class="section-title">Face, neck, and hands</h2>
        </div>
        <div class="mini-grid">${renderTreatedAreas()}</div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Standing rules</p>
          <h2 class="section-title">Keep these constant</h2>
        </div>
        <div class="stack-sm">${renderStandingRules()}</div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Reintroduction ladder</p>
          <h2 class="section-title">Bring actives back in slowly</h2>
        </div>
        <ol class="ladder-list">${renderReintroductionLadder()}</ol>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Call clinic if</p>
          <h2 class="section-title">Escalate without waiting</h2>
        </div>
        <ul class="bullet-list">${SAFETY_TRIGGERS.map((trigger) => `<li>${escapeHtml(trigger)}</li>`).join('')}</ul>
        <ul class="bullet-list">${renderContacts()}</ul>
      </section>
    </div>
  `;
}
