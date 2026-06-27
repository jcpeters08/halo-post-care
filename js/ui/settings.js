import { escapeHtml } from './components.js';

function renderStatusNote(message, tone = 'neutral') {
  if (!message) {
    return '';
  }

  return `<p class="status-note is-${escapeHtml(tone)}" role="status">${escapeHtml(message)}</p>`;
}

export function renderSettings(root, viewModel) {
  const {
    settings,
    connectionMessage = '',
    connectionTone = 'neutral',
    syncMessage = '',
    syncTone = 'neutral',
    dataMessage = '',
    dataTone = 'neutral',
    resetConfirming = false,
    busyAction = '',
    appliedAssessment = null
  } = viewModel;

  const isBusy = Boolean(busyAction);
  const disableSave = isBusy;
  const disableConnection = isBusy;
  const disableSync = isBusy;
  const disableExport = isBusy;
  const disableReset = isBusy;
  const assessmentDate = typeof appliedAssessment?.assessmentDate === 'string'
    ? appliedAssessment.assessmentDate
    : 'None synced';
  const assessmentPath = typeof settings?.lastAssessmentPath === 'string' && settings.lastAssessmentPath
    ? settings.lastAssessmentPath
    : 'No Codex assessment file applied yet.';

  root.innerHTML = `
    <div class="stack-lg">
      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Settings</p>
          <h2 class="section-title">Care plan and data repo</h2>
        </div>
        <form class="settings-form stack-md" data-settings-form>
          <div class="form-grid">
            <label class="field stack-xxs">
              <span class="field-label">Procedure date</span>
              <input
                class="text-input"
                type="date"
                name="procedureDate"
                value="${escapeHtml(settings.procedureDate ?? '')}"
                data-settings-field
              >
            </label>
            <label class="field stack-xxs">
              <span class="field-label">Acyclovir doses/day</span>
              <input
                class="text-input"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                name="acyclovirPerDay"
                value="${escapeHtml(String(settings.acyclovirPerDay ?? ''))}"
                data-settings-field
              >
            </label>
            <label class="field stack-xxs">
              <span class="field-label">GitHub owner</span>
              <input
                class="text-input"
                type="text"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                name="githubOwner"
                value="${escapeHtml(settings.githubOwner ?? '')}"
                data-settings-field
              >
            </label>
            <label class="field stack-xxs">
              <span class="field-label">Data repo</span>
              <input
                class="text-input"
                type="text"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                name="dataRepo"
                value="${escapeHtml(settings.dataRepo ?? '')}"
                data-settings-field
              >
            </label>
            <label class="field stack-xxs field--full">
              <span class="field-label">GitHub token</span>
              <input
                class="text-input"
                type="password"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                name="token"
                value="${escapeHtml(settings.token ?? '')}"
                data-settings-field
              >
            </label>
          </div>
          <div class="action-row">
            <button
              class="button-primary"
              type="button"
              data-action="save-settings"
              ${disableSave ? 'disabled' : ''}
            >${busyAction === 'save-settings' ? 'Saving...' : 'Save settings'}</button>
          </div>
        </form>
      </section>

      <section class="panel stack-md">
        <div class="section-row">
          <div class="stack-xs">
            <p class="section-label">Connection</p>
            <h2 class="section-title">Repository access</h2>
          </div>
          <p class="meta-text">Owner defaults to <strong>jcpeters08</strong></p>
        </div>
        <div class="action-row">
          <button
            class="button-secondary"
            type="button"
            data-action="test-connection"
            ${disableConnection ? 'disabled' : ''}
          >${busyAction === 'test-connection' ? 'Testing...' : 'Test connection'}</button>
          <button
            class="button-secondary"
            type="button"
            data-action="sync-assessment"
            ${disableSync ? 'disabled' : ''}
          >${busyAction === 'sync-assessment' ? 'Syncing Codex assessments...' : 'Sync Codex assessments'}</button>
        </div>
        ${renderStatusNote(connectionMessage, connectionTone)}
        ${renderStatusNote(syncMessage, syncTone)}
        <div class="stack-xxs">
          <p class="meta-text">Applied Codex assessment date: ${escapeHtml(assessmentDate)}</p>
          <p class="meta-text">Last Codex assessment file: ${escapeHtml(assessmentPath)}</p>
        </div>
      </section>

      <section class="panel stack-md">
        <div class="stack-xs">
          <p class="section-label">Data</p>
          <h2 class="section-title">Export or clear local state</h2>
        </div>
        <div class="action-row">
          <button
            class="button-secondary"
            type="button"
            data-action="export-data"
            ${disableExport ? 'disabled' : ''}
          >${busyAction === 'export-data' ? 'Exporting...' : 'Export data'}</button>
          <button
            class="button-danger"
            type="button"
            data-action="reset-data"
            ${disableReset ? 'disabled' : ''}
          >${busyAction === 'reset-data' ? 'Resetting...' : resetConfirming ? 'Tap again to confirm reset' : 'Reset data'}</button>
        </div>
        ${renderStatusNote(dataMessage, dataTone)}
      </section>
    </div>
  `;
}
