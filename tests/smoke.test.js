import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { getDefaultGuidance } from '../js/assessment.js';
import { buildDailyTargets, getStageForDay, getTimelineForDay } from '../js/day.js';
import {
  buildBlockedReservationDraft,
  findCompletedCheckinPathForDate,
  loadAppliedAssessment,
  loadDailyState,
  reserveCheckinDay
} from '../js/app.js';
import { getPrepareCheckinState, renderLog } from '../js/ui/log.js';

const requiredFiles = [
  'index.html',
  'css/styles.css',
  'manifest.webmanifest',
  'sw.js',
  'icons/app-icon.svg',
  'js/app.js'
];

describe('project shell', () => {
  it('has all static app shell files', async () => {
    for (const file of requiredFiles) {
      const info = await stat(file);
      assert.equal(info.isFile(), true, `${file} should be a file`);
    }
  });

  it('does not add runtime dependencies', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });

  it('sets a CSP that limits network calls to GitHub API', async () => {
    const html = await readFile('index.html', 'utf8');
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /connect-src https:\/\/api\.github\.com/);
  });

  it('defines the primary routes in the app shell', async () => {
    const html = await readFile('index.html', 'utf8');
    for (const route of ['today', 'log', 'assessments', 'guide', 'settings']) {
      assert.match(html, new RegExp(`data-route="${route}"`));
    }
  });

  it('pre-caches the core app shell in the service worker', async () => {
    const sw = await readFile('sw.js', 'utf8');
    for (const path of ['index.html', 'css/styles.css', 'js/app.js', 'manifest.webmanifest']) {
      assert.match(sw, new RegExp(path.replace('.', '\\.')));
    }
  });

  it('awaits runtime cache writes before returning same-origin GET responses', async () => {
    const sw = await readFile('sw.js', 'utf8');
    assert.match(sw, /await cache\.put\(event\.request,\s*response\.clone\(\)\)/);
  });

  it('renders the Today and Guide views with recovery content', async () => {
    const [{ renderToday }, { renderGuide }] = await Promise.all([
      import('../js/ui/today.js'),
      import('../js/ui/guide.js')
    ]);

    const todayRoot = { innerHTML: '' };
    const guideRoot = { innerHTML: '' };
    const targets = buildDailyTargets(1, 2);
    const context = {
      todayIso: '2026-06-27',
      recoveryDay: 1,
      stage: getStageForDay(1),
      timeline: getTimelineForDay(1),
      targets,
      state: {
        am: { cleanse: true, hocl: false, alastin: false, cicalfate: false, spf: false },
        pm: { cleanse: false, hocl: true, alastin: false, cicalfate: false },
        counters: { hocl: 1, cicalfate: 2, spf: 0, acyclovir: 1, heliocare: 0 },
        flags: { elevated: true, coldCompress: false }
      },
      guidance: getDefaultGuidance(),
      provenance: 'Default guidance',
      assessment: null
    };

    renderToday(todayRoot, context);
    renderGuide(guideRoot, context);

    assert.match(todayRoot.innerHTML, /Recovery day 1/);
    assert.match(todayRoot.innerHTML, /data-action="toggle-step"/);
    assert.match(todayRoot.innerHTML, /aria-pressed="true"/);
    assert.match(todayRoot.innerHTML, /data-action="counter-inc"/);
    assert.match(todayRoot.innerHTML, /data-action="set-flag"/);
    assert.match(todayRoot.innerHTML, /Call clinic/);
    assert.match(todayRoot.innerHTML, /Default guidance/);
    assert.match(todayRoot.innerHTML, /Red light mask/);
    assert.match(todayRoot.innerHTML, /Wait on red light mask/);

    assert.match(guideRoot.innerHTML, /Day-by-day guide/);
    assert.match(guideRoot.innerHTML, /Reintroduction ladder/);
    assert.match(guideRoot.innerHTML, /Restart red light mask/);
    assert.match(guideRoot.innerHTML, /Day 7/);
    assert.match(guideRoot.innerHTML, /Call clinic if/);
    assert.match(guideRoot.innerHTML, /href="tel:952-767-3163"/);
  });

  it('renders limited red light mask guidance on day 7', async () => {
    const { renderToday } = await import('../js/ui/today.js');
    const root = { innerHTML: '' };
    const targets = buildDailyTargets(7, 2);

    renderToday(root, {
      todayIso: '2026-07-03',
      recoveryDay: 7,
      stage: getStageForDay(7),
      timeline: getTimelineForDay(7),
      targets,
      state: {
        am: { cleanse: false, hocl: false, alastin: false, cicalfate: false, spf: false },
        pm: { cleanse: false, hocl: false, alastin: false, cicalfate: false },
        counters: { hocl: 0, cicalfate: 0, spf: 0, acyclovir: 0, heliocare: 0 },
        flags: { elevated: false, coldCompress: false }
      },
      guidance: getDefaultGuidance(),
      provenance: 'Default guidance',
      assessment: null
    });

    assert.match(root.innerHTML, /Recovery tools/);
    assert.match(root.innerHTML, /Restart at 5 minutes/);
    assert.match(root.innerHTML, /clean mask/);
  });

  it('disables preparing a second same-day check-in after upload success', () => {
    const draft = {
      symptoms: { redness: 1, swelling: 1, flaking: 1, itch: 1, tightness: 1 },
      note: '',
      syncStatus: 'uploaded',
      uploadedCheckinPath: 'checkins/2026-06-27/2030',
      errorMessage: ''
    };
    const prepareState = getPrepareCheckinState({
      draft,
      todayIso: '2026-06-27',
      hasAllPhotos: true
    });

    assert.equal(prepareState.disabled, true);
    assert.equal(prepareState.reason, 'already_uploaded');

    const root = { innerHTML: '' };
    renderLog(root, {
      todayIso: '2026-06-27',
      recoveryDay: 1,
      stage: getStageForDay(1)
    }, {
      draft,
      photoDraftsByArea: { face: {}, neck: {}, hands: {} },
      previewUrls: {},
      photoError: ''
    });

    assert.match(root.innerHTML, /Today's check-in already uploaded\./);
    assert.match(root.innerHTML, /Today's check-in uploaded/);
    assert.match(root.innerHTML, /disabled/);
  });

  it('keeps retry available after an upload failure', () => {
    const prepareState = getPrepareCheckinState({
      draft: {
        symptoms: { redness: 1, swelling: 1, flaking: 1, itch: 1, tightness: 1 },
        note: '',
        syncStatus: 'upload_failed',
        uploadedCheckinPath: '',
        errorMessage: 'Upload failed before complete.json.'
      },
      todayIso: '2026-06-27',
      hasAllPhotos: true
    });

    assert.equal(prepareState.disabled, false);
    assert.equal(prepareState.reason, 'ready');
  });

  it('renders Codex assessment copy in settings', async () => {
    const { renderSettings } = await import('../js/ui/settings.js');
    const root = { innerHTML: '' };

    renderSettings(root, {
      settings: {
        procedureDate: '2026-06-27',
        acyclovirPerDay: 2,
        githubOwner: 'jcpeters08',
        dataRepo: 'halo-post-care-data',
        token: '',
        lastAssessmentPath: 'checkins/2026-06-27/2030/assessment.json'
      },
      appliedAssessment: {
        assessmentDate: '2026-06-27'
      }
    });

    assert.match(root.innerHTML, /Sync Codex assessments/);
    assert.match(root.innerHTML, /Applied Codex assessment date: 2026-06-27/);
    assert.match(root.innerHTML, /Last Codex assessment file: checkins\/2026-06-27\/2030\/assessment\.json/);
  });

  it('renders urgent Codex safety assessment before ordinary guidance on Today', async () => {
    const { renderToday } = await import('../js/ui/today.js');
    const root = { innerHTML: '' };
    const targets = buildDailyTargets(1, 2);

    renderToday(root, {
      todayIso: '2026-06-27',
      recoveryDay: 1,
      stage: getStageForDay(1),
      timeline: getTimelineForDay(1),
      targets,
      state: {
        am: { cleanse: false, hocl: false, alastin: false, cicalfate: false, spf: false },
        pm: { cleanse: false, hocl: false, alastin: false, cicalfate: false },
        counters: { hocl: 0, cicalfate: 0, spf: 0, acyclovir: 0, heliocare: 0 },
        flags: { elevated: false, coldCompress: false }
      },
      guidance: getDefaultGuidance(),
      provenance: 'Codex assessment from 2026-06-27',
      assessment: {
        safety: {
          callClinic: true,
          urgency: 'urgent',
          reasons: ['Increasing heat and swelling', 'Pain spreading beyond treated area']
        }
      }
    });

    assert.match(root.innerHTML, /Codex safety alert/);
    assert.match(root.innerHTML, /Urgent/);
    assert.match(root.innerHTML, /Increasing heat and swelling/);
    assert.match(root.innerHTML, /Pain spreading beyond treated area/);
    assert.ok(root.innerHTML.indexOf('Codex safety alert') < root.innerHTML.indexOf('Codex guidance'));
  });

  it('renders the latest Codex photo assessment details on Today', async () => {
    const { renderToday } = await import('../js/ui/today.js');
    const root = { innerHTML: '' };
    const targets = buildDailyTargets(1, 2);

    renderToday(root, {
      todayIso: '2026-06-27',
      recoveryDay: 1,
      stage: getStageForDay(1),
      timeline: getTimelineForDay(1),
      targets,
      state: {
        am: { cleanse: false, hocl: false, alastin: false, cicalfate: false, spf: false },
        pm: { cleanse: false, hocl: false, alastin: false, cicalfate: false },
        counters: { hocl: 0, cicalfate: 0, spf: 0, acyclovir: 0, heliocare: 0 },
        flags: { elevated: false, coldCompress: false }
      },
      guidance: getDefaultGuidance(),
      provenance: 'Codex assessment from 2026-06-27',
      assessment: {
        assessmentDate: '2026-06-27',
        checkinPath: 'checkins/2026-06-27/1702',
        overall: {
          status: 'on_track',
          confidence: 'medium',
          summary: 'Recovery day 1 photos look consistent with the expected red, warm, tight phase.'
        },
        observations: [
          { area: 'face', severity: 'expected', note: 'Diffuse redness across the face.' },
          { area: 'neck', severity: 'watch', note: 'Central neck redness should trend calmer.' }
        ],
        safety: { callClinic: false, urgency: 'routine', reasons: [] },
        nextActions: ['Upload another check-in tomorrow.']
      }
    });

    assert.match(root.innerHTML, /Photo assessment/);
    assert.match(root.innerHTML, /Recovery day 1 photos look consistent/);
    assert.match(root.innerHTML, /Face/);
    assert.match(root.innerHTML, /Diffuse redness across the face/);
    assert.match(root.innerHTML, /Neck/);
    assert.match(root.innerHTML, /Central neck redness should trend calmer/);
    assert.match(root.innerHTML, /Upload another check-in tomorrow/);
  });

  it('renders historical Codex photo assessments newest first', async () => {
    const { renderAssessments } = await import('../js/ui/assessments.js');
    const root = { innerHTML: '' };

    renderAssessments(root, {
      assessmentHistory: [
        {
          assessmentDate: '2026-06-27',
          checkinPath: 'checkins/2026-06-27/1702',
          overall: {
            status: 'watch',
            confidence: 'medium',
            summary: 'Day 1 had expected redness.'
          },
          observations: [
            { area: 'face', severity: 'expected', note: 'Diffuse redness.' }
          ],
          safety: { callClinic: false, urgency: 'routine', reasons: [] },
          nextActions: ['Keep barrier routine.']
        },
        {
          assessmentDate: '2026-06-28',
          checkinPath: 'checkins/2026-06-28/0840',
          overall: {
            status: 'on_track',
            confidence: 'high',
            summary: 'Redness is settling.'
          },
          observations: [
            { area: 'face', severity: 'expected', note: 'Less diffuse redness.' }
          ],
          safety: { callClinic: false, urgency: 'routine', reasons: [] },
          nextActions: ['Continue SPF.']
        }
      ]
    });

    assert.match(root.innerHTML, /Assessment history/);
    assert.match(root.innerHTML, /Redness is settling/);
    assert.match(root.innerHTML, /Day 1 had expected redness/);
    assert.ok(root.innerHTML.indexOf('Redness is settling') < root.innerHTML.indexOf('Day 1 had expected redness'));
  });

  it('renders progress photos by selected area with latest baseline comparison', async () => {
    const { renderProgress } = await import('../js/ui/progress.js');
    const root = { innerHTML: '' };
    const entries = [
      {
        checkinPath: 'checkins/2026-06-28/0840',
        date: '2026-06-28',
        time: '0840',
        recoveryDay: 2,
        stageAuto: 'mends_bronzing',
        photos: {
          face: { src: 'data:image/jpeg;base64,ZmFjZTI=', fileName: 'face.jpg' },
          neck: null,
          hands: null
        }
      },
      {
        checkinPath: 'checkins/2026-06-27/2030',
        date: '2026-06-27',
        time: '2030',
        recoveryDay: 1,
        stageAuto: 'red_warm_tight',
        photos: {
          face: { src: 'data:image/jpeg;base64,ZmFjZTE=', fileName: 'face.jpg' },
          neck: null,
          hands: null
        }
      }
    ];

    renderProgress(root, {
      status: 'ready',
      selectedArea: 'face',
      entries
    });

    assert.match(root.innerHTML, /Photo progress/);
    assert.match(root.innerHTML, /Compare recovery over time/);
    assert.match(root.innerHTML, /data-action="set-progress-area"/);
    assert.match(root.innerHTML, /aria-pressed="true"[\s\S]*Face/);
    assert.match(root.innerHTML, /Face timeline/);
    assert.match(root.innerHTML, /Recovery day 2/);
    assert.match(root.innerHTML, /Recovery day 1/);
    assert.match(root.innerHTML, /Latest vs baseline/);
    assert.match(root.innerHTML, /Latest/);
    assert.match(root.innerHTML, /Baseline/);
    assert.ok(root.innerHTML.indexOf('Recovery day 2') < root.innerHTML.indexOf('Recovery day 1'));
  });

  it('renders progress loading empty error and settings states', async () => {
    const { renderProgress } = await import('../js/ui/progress.js');
    const root = { innerHTML: '' };

    renderProgress(root, { status: 'loading', selectedArea: 'face', entries: [] });
    assert.match(root.innerHTML, /Loading progress photos/);

    renderProgress(root, { status: 'missing_settings', selectedArea: 'face', entries: [] });
    assert.match(root.innerHTML, /Connect GitHub in Settings/);

    renderProgress(root, { status: 'ready', selectedArea: 'face', entries: [] });
    assert.match(root.innerHTML, /Progress appears after completed check-ins/);

    renderProgress(root, {
      status: 'error',
      selectedArea: 'face',
      entries: [],
      errorMessage: '401: Bad credentials'
    });
    assert.match(root.innerHTML, /Could not load progress photos/);
    assert.match(root.innerHTML, /401: Bad credentials/);
    assert.match(root.innerHTML, /data-action="retry-progress"/);
  });

  it('disables all settings actions while a settings operation is in flight', async () => {
    const { renderSettings } = await import('../js/ui/settings.js');
    const root = { innerHTML: '' };

    renderSettings(root, {
      settings: {
        procedureDate: '',
        acyclovirPerDay: 2,
        githubOwner: 'jcpeters08',
        dataRepo: 'halo-post-care-data',
        token: '',
        lastAssessmentPath: ''
      },
      busyAction: 'sync-assessment',
      resetConfirming: true
    });

    assert.match(root.innerHTML, /data-action="save-settings"[\s\S]*disabled/);
    assert.match(root.innerHTML, /data-action="test-connection"[\s\S]*disabled/);
    assert.match(root.innerHTML, /data-action="sync-assessment"[\s\S]*disabled/);
    assert.match(root.innerHTML, /data-action="export-data"[\s\S]*disabled/);
    assert.match(root.innerHTML, /data-action="reset-data"[\s\S]*disabled/);
  });

  it('keeps the save button label accurate during unrelated settings operations', async () => {
    const { renderSettings } = await import('../js/ui/settings.js');
    const root = { innerHTML: '' };

    renderSettings(root, {
      settings: {
        procedureDate: '',
        acyclovirPerDay: 2,
        githubOwner: 'jcpeters08',
        dataRepo: 'halo-post-care-data',
        token: '',
        lastAssessmentPath: ''
      },
      busyAction: 'sync-assessment'
    });

    assert.match(root.innerHTML, /data-action="save-settings"[\s\S]*Save settings/);
    assert.doesNotMatch(root.innerHTML, /Saving\.\.\./);
  });
});

describe('Task 8 repo-backed duplicate detection', () => {
  it('returns the completed check-in path for a day when complete.json exists', async () => {
    const calls = [];
    const client = {
      async listDirectory(path) {
        calls.push(path);

        if (path === 'checkins/2026-06-27') {
          return [
            { type: 'dir', name: '0915', path: 'checkins/2026-06-27/0915' },
            { type: 'dir', name: '2030', path: 'checkins/2026-06-27/2030' }
          ];
        }

        if (path === 'checkins/2026-06-27/0915') {
          return [{ type: 'file', name: 'manifest.json', path: `${path}/manifest.json` }];
        }

        if (path === 'checkins/2026-06-27/2030') {
          return [{ type: 'file', name: 'complete.json', path: `${path}/complete.json` }];
        }

        throw new Error(`Unexpected path: ${path}`);
      }
    };

    const result = await findCompletedCheckinPathForDate(client, '2026-06-27');

    assert.equal(result, 'checkins/2026-06-27/2030');
    assert.deepEqual(calls, [
      'checkins/2026-06-27',
      'checkins/2026-06-27/0915',
      'checkins/2026-06-27/2030'
    ]);
  });

  it('treats a missing date directory as no existing completed check-in', async () => {
    const error = new Error('404: Not Found');
    error.status = 404;
    const client = {
      async listDirectory() {
        throw error;
      }
    };

    const result = await findCompletedCheckinPathForDate(client, '2026-06-27');

    assert.equal(result, null);
  });

  it('rethrows non-404 GitHub errors during duplicate detection', async () => {
    const error = new Error('503: Service Unavailable');
    error.status = 503;
    const client = {
      async listDirectory() {
        throw error;
      }
    };

    await assert.rejects(
      () => findCompletedCheckinPathForDate(client, '2026-06-27'),
      /503: Service Unavailable/
    );
  });

  it('creates a day claim before upload and returns the claimed path', async () => {
    const calls = [];
    const client = {
      async getJson() {
        const error = new Error('404: Not Found');
        error.status = 404;
        throw error;
      },
      async putFile(path, content, message) {
        calls.push({ path, content: JSON.parse(content), message });
      },
      async listDirectory() {
        const error = new Error('404: Not Found');
        error.status = 404;
        throw error;
      }
    };

    const result = await reserveCheckinDay({
      client,
      todayIso: '2026-06-27',
      proposedCheckinPath: 'checkins/2026-06-27/2030',
      claimedAt: '2026-06-27T20:30:00-05:00',
      syncStatus: 'ready',
      claimedCheckinPath: ''
    });

    assert.deepEqual(result, {
      status: 'reserved',
      checkinPath: 'checkins/2026-06-27/2030',
      claimedCheckinPath: 'checkins/2026-06-27/2030'
    });
    assert.deepEqual(calls, [{
      path: 'checkins/2026-06-27/daily-claim.json',
      content: {
        schemaVersion: 1,
        date: '2026-06-27',
        checkinPath: 'checkins/2026-06-27/2030',
        claimedAt: '2026-06-27T20:30:00-05:00'
      },
      message: 'Claim daily check-in'
    }]);
  });

  it('blocks upload when the claim already exists and resolves the existing path', async () => {
    const conflict = new Error('422: already exists');
    conflict.status = 422;
    const client = {
      async getJson(path) {
        assert.equal(path, 'checkins/2026-06-27/daily-claim.json');
        return {
          schemaVersion: 1,
          date: '2026-06-27',
          checkinPath: 'checkins/2026-06-27/0915',
          claimedAt: '2026-06-27T09:15:00-05:00'
        };
      },
      async putFile() {
        throw conflict;
      },
      async listDirectory() {
        const error = new Error('404: Not Found');
        error.status = 404;
        throw error;
      }
    };

    const result = await reserveCheckinDay({
      client,
      todayIso: '2026-06-27',
      proposedCheckinPath: 'checkins/2026-06-27/2030',
      claimedAt: '2026-06-27T20:30:00-05:00',
      syncStatus: 'ready',
      claimedCheckinPath: ''
    });

    assert.deepEqual(result, {
      status: 'blocked',
      checkinPath: 'checkins/2026-06-27/0915',
      claimedCheckinPath: 'checkins/2026-06-27/0915',
      reason: 'claimed'
    });
  });

  it('treats a claimed path with complete.json as a completed upload', async () => {
    const client = {
      async getJson(path) {
        assert.equal(path, 'checkins/2026-06-27/daily-claim.json');
        return {
          schemaVersion: 1,
          date: '2026-06-27',
          checkinPath: 'checkins/2026-06-27/0915',
          claimedAt: '2026-06-27T09:15:00-05:00'
        };
      },
      async putFile() {
        throw new Error('putFile should not be called when a claim already exists');
      },
      async listDirectory(path) {
        assert.equal(path, 'checkins/2026-06-27/0915');
        return [{ type: 'file', name: 'complete.json', path: `${path}/complete.json` }];
      }
    };

    const result = await reserveCheckinDay({
      client,
      todayIso: '2026-06-27',
      proposedCheckinPath: 'checkins/2026-06-27/2030',
      claimedAt: '2026-06-27T20:30:00-05:00',
      syncStatus: 'ready',
      claimedCheckinPath: ''
    });

    assert.deepEqual(result, {
      status: 'blocked',
      checkinPath: 'checkins/2026-06-27/0915',
      claimedCheckinPath: 'checkins/2026-06-27/0915',
      reason: 'completed'
    });
  });

  it('reuses the same claimed path after upload_failed without re-claiming', async () => {
    let putAttempts = 0;
    const client = {
      async getJson(path) {
        assert.equal(path, 'checkins/2026-06-27/daily-claim.json');
        return {
          schemaVersion: 1,
          date: '2026-06-27',
          checkinPath: 'checkins/2026-06-27/2030',
          claimedAt: '2026-06-27T20:30:00-05:00'
        };
      },
      async putFile() {
        putAttempts += 1;
      },
      async listDirectory() {
        const error = new Error('404: Not Found');
        error.status = 404;
        throw error;
      }
    };

    const result = await reserveCheckinDay({
      client,
      todayIso: '2026-06-27',
      proposedCheckinPath: 'checkins/2026-06-27/2110',
      claimedAt: '2026-06-27T21:10:00-05:00',
      syncStatus: 'upload_failed',
      claimedCheckinPath: 'checkins/2026-06-27/2030'
    });

    assert.deepEqual(result, {
      status: 'reserved',
      checkinPath: 'checkins/2026-06-27/2030',
      claimedCheckinPath: 'checkins/2026-06-27/2030'
    });
    assert.equal(putAttempts, 0);
  });

  it('maps a claimed-only conflict to a retryable local draft state', () => {
    const result = buildBlockedReservationDraft({
      symptoms: { redness: 1, swelling: 1, flaking: 1, itch: 1, tightness: 1 },
      note: 'keep this draft',
      syncStatus: 'ready',
      claimedCheckinPath: '',
      uploadedCheckinPath: '',
      errorMessage: ''
    }, {
      status: 'blocked',
      checkinPath: 'checkins/2026-06-27/0915',
      claimedCheckinPath: 'checkins/2026-06-27/0915',
      reason: 'claimed'
    });

    assert.equal(result.syncStatus, 'upload_failed');
    assert.equal(result.claimedCheckinPath, '');
    assert.equal(result.uploadedCheckinPath, '');
    assert.match(result.errorMessage, /Another device is preparing today's check-in/);
    assert.equal(result.note, 'keep this draft');
  });

  it('maps a claimed-and-complete conflict to an uploaded local draft state', () => {
    const result = buildBlockedReservationDraft({
      symptoms: { redness: 1, swelling: 1, flaking: 1, itch: 1, tightness: 1 },
      note: 'keep this draft',
      syncStatus: 'ready',
      claimedCheckinPath: '',
      uploadedCheckinPath: '',
      errorMessage: ''
    }, {
      status: 'blocked',
      checkinPath: 'checkins/2026-06-27/0915',
      claimedCheckinPath: 'checkins/2026-06-27/0915',
      reason: 'completed'
    });

    assert.equal(result.syncStatus, 'uploaded');
    assert.equal(result.claimedCheckinPath, 'checkins/2026-06-27/0915');
    assert.equal(result.uploadedCheckinPath, 'checkins/2026-06-27/0915');
    assert.equal(result.errorMessage, '');
  });
});

describe('Task 7 storage hardening', () => {
  function createStorage(initial = {}) {
    const map = new Map(
      Object.entries(initial).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      ])
    );

    return {
      getItem(key) {
        return map.has(key) ? map.get(key) : null;
      },
      setItem(key, value) {
        map.set(key, String(value));
      },
      removeItem(key) {
        map.delete(key);
      },
      key(index) {
        return Array.from(map.keys())[index] ?? null;
      },
      get length() {
        return map.size;
      }
    };
  }

  it('selects the newest valid cached assessment from history entries', () => {
    const storage = createStorage({
      halo_applied_assessment_v1: {
        history: [
          { assessmentDate: 'broken' },
          {
            schemaVersion: 1,
            assessmentDate: '2026-06-27',
            checkinPath: 'checkins/2026-06-27',
            overall: { status: 'watch', confidence: 'medium', summary: 'Monitor.' },
            guidance: getDefaultGuidance(),
            safety: { callClinic: false, urgency: 'monitor' },
            nextActions: []
          },
          {
            schemaVersion: 1,
            assessmentDate: '2026-06-29',
            checkinPath: 'checkins/2026-06-29',
            overall: { status: 'on_track', confidence: 'high', summary: 'Improving.' },
            guidance: getDefaultGuidance(),
            safety: { callClinic: false, urgency: 'routine' },
            nextActions: []
          }
        ]
      }
    });

    const assessment = loadAppliedAssessment(storage);

    assert.equal(assessment?.assessmentDate, '2026-06-29');
  });

  it('loads valid cached assessment history newest first', async () => {
    const { loadAssessmentHistory } = await import('../js/app.js');
    const storage = createStorage({
      halo_applied_assessment_v1: {
        assessments: [
          {
            schemaVersion: 1,
            assessmentDate: '2026-06-27',
            checkinPath: 'checkins/2026-06-27',
            overall: { status: 'watch', confidence: 'medium', summary: 'Monitor.' },
            guidance: getDefaultGuidance(),
            safety: { callClinic: false, urgency: 'monitor' },
            nextActions: []
          },
          { foo: 'bar' },
          {
            schemaVersion: 1,
            assessmentDate: '2026-06-29',
            checkinPath: 'checkins/2026-06-29',
            overall: { status: 'on_track', confidence: 'high', summary: 'Improving.' },
            guidance: getDefaultGuidance(),
            safety: { callClinic: false, urgency: 'routine' },
            nextActions: []
          }
        ]
      }
    });

    const history = loadAssessmentHistory(storage);

    assert.deepEqual(history.map((entry) => entry.assessmentDate), ['2026-06-29', '2026-06-27']);
  });

  it('ignores malformed cached assessments and falls back to null', () => {
    const storage = createStorage({
      halo_applied_assessment_v1: {
        assessments: [{ foo: 'bar' }, null, []]
      }
    });

    assert.equal(loadAppliedAssessment(storage), null);
  });

  it('backfills malformed daily state into the current target shape', () => {
    const targets = buildDailyTargets(1, 2);
    const storage = createStorage({
      halo_daily_v1: {
        '2026-06-27': {
          am: { cleanse: true, hocl: 'yes' },
          pm: { hocl: 1 },
          counters: { hocl: '3.9', cicalfate: -2, ghost: 8 },
          flags: { elevated: 1 }
        }
      }
    });

    const state = loadDailyState(storage, '2026-06-27', targets);

    assert.deepEqual(Object.keys(state.am), targets.am.map((item) => item.id));
    assert.deepEqual(Object.keys(state.pm), targets.pm.map((item) => item.id));
    assert.deepEqual(Object.keys(state.counters), Object.keys(targets.counters));
    assert.deepEqual(Object.keys(state.flags), Object.keys(targets.flags));
    assert.equal(state.am.cleanse, true);
    assert.equal(state.am.hocl, false);
    assert.equal(state.pm.hocl, false);
    assert.equal(state.counters.hocl, 3);
    assert.equal(state.counters.cicalfate, 0);
    assert.equal(state.flags.elevated, true);
    assert.equal(state.flags.coldCompress, true);
  });
});
