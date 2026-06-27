import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { getDefaultGuidance } from '../js/assessment.js';
import { buildDailyTargets, getStageForDay, getTimelineForDay } from '../js/day.js';
import {
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

  it('defines the four primary routes in the app shell', async () => {
    const html = await readFile('index.html', 'utf8');
    for (const route of ['today', 'log', 'guide', 'settings']) {
      assert.match(html, new RegExp(`data-route="${route}"`));
    }
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
        am: { cleanse: true, thermal_water: false, alastin: false, cicalfate: false, spf: false },
        pm: { cleanse: false, hocl: true, alastin: false, cicalfate: false, spf: false },
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

    assert.match(guideRoot.innerHTML, /Day-by-day guide/);
    assert.match(guideRoot.innerHTML, /Reintroduction ladder/);
    assert.match(guideRoot.innerHTML, /Call clinic if/);
    assert.match(guideRoot.innerHTML, /href="tel:952-767-3163"/);
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
          am: { cleanse: true, thermal_water: 'yes' },
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
    assert.equal(state.am.thermal_water, false);
    assert.equal(state.pm.hocl, false);
    assert.equal(state.counters.hocl, 3);
    assert.equal(state.counters.cicalfate, 0);
    assert.equal(state.flags.elevated, true);
    assert.equal(state.flags.coldCompress, true);
  });
});
