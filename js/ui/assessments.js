import { escapeHtml, renderAssessmentDetails } from './components.js';

function sortAssessmentsNewestFirst(assessments) {
  return [...assessments].sort((a, b) => {
    const dateCompare = `${b?.assessmentDate || ''}`.localeCompare(`${a?.assessmentDate || ''}`);
    if (dateCompare !== 0) return dateCompare;
    return `${b?.checkinPath || ''}`.localeCompare(`${a?.checkinPath || ''}`);
  });
}

export function renderAssessments(root, context) {
  const history = Array.isArray(context?.assessmentHistory)
    ? sortAssessmentsNewestFirst(context.assessmentHistory)
    : [];

  if (history.length === 0) {
    root.innerHTML = `
      <div class="stack-lg">
        <section class="panel stack-md">
          <div class="stack-xs">
            <p class="section-label">Codex photo reads</p>
            <h2 class="section-title">Assessment history</h2>
          </div>
          <p class="body-copy">No Codex assessments are cached on this device yet. Sync from Settings after a check-in has an assessment.</p>
        </section>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="stack-lg">
      <section class="hero-panel stack-sm">
        <div class="stack-xs">
          <p class="eyebrow">Codex photo reads</p>
          <h2>Assessment history</h2>
        </div>
        <p class="body-copy">${escapeHtml(history.length)} assessment${history.length === 1 ? '' : 's'} cached on this device, newest first.</p>
      </section>
      ${history.map((assessment, index) => renderAssessmentDetails(assessment, {
        headingId: `assessment-history-${index}`,
        label: index === 0 ? 'Latest assessment' : 'Past assessment',
        title: assessment.assessmentDate || 'Assessment'
      })).join('')}
    </div>
  `;
}
