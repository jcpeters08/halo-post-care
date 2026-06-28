# Progress Photo Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `Progress` tab that loads completed check-in photos from the private GitHub data repo and compares face, neck, or hands photos across time.

**Architecture:** Extend the existing GitHub client with read-only photo/check-in discovery helpers, normalize progress entries in a small pure module, render the visual timeline in a new `js/ui/progress.js`, and wire the async route through `js/app.js`. No private photos are committed or persisted into this public repo.

**Tech Stack:** Static HTML, CSS, vanilla ES modules, browser `fetch`, GitHub Contents API, Node built-in test runner.

## Global Constraints

- Public repo must not receive personal photos, symptom logs, completed check-ins, assessments, or tokens.
- No new backend, build step, runtime dependency, or private data repo schema migration.
- The only network target remains `https://api.github.com`.
- `Progress` is a dedicated bottom-nav tab; `Assess` remains written Codex assessment history.
- The selected area control is `Face`, `Neck`, `Hands`, defaulting to `face`.
- Timeline sorts newest first; baseline is the oldest available photo for the selected area.
- v1 stores loaded photo data only in runtime app state.
- Use TDD: write and run failing tests before implementation code.
- Bump the service worker cache when app shell files change.

---

## File Structure

- Modify `js/github.js`: expose read-only helpers `getFileBase64(path)` and `findCompletedCheckins()`.
- Create `js/progress.js`: pure progress normalization and area selection helpers.
- Create `js/ui/progress.js`: Progress tab renderer and states.
- Modify `js/app.js`: add `progress` route, async photo loading, selected-area state, and retry/area actions.
- Modify `index.html`: add `Progress` tab button.
- Modify `css/styles.css`: add segmented controls and progress photo timeline styles.
- Modify `sw.js`: pre-cache `js/progress.js`, `js/ui/progress.js`, and bump cache name.
- Modify `tests/github.test.js`: GitHub helper coverage.
- Create `tests/progress.test.js`: pure normalization coverage.
- Modify `tests/smoke.test.js`: route, service worker, and renderer smoke coverage.
- Modify `CLAUDE.md` and Obsidian project notes after implementation is verified.

---

### Task 1: GitHub Photo Discovery Helpers

**Files:**
- Modify: `js/github.js`
- Test: `tests/github.test.js`

**Interfaces:**
- Consumes: existing private helpers `request`, `buildContentsUrl`, `listDirectory`, `isDirectory`, `isFile`, `getEntryPath`, `getEntryName`, `stripBase64Whitespace`.
- Produces:
  - `client.getFileBase64(path: string): Promise<string>`
  - `client.findCompletedCheckins(): Promise<string[]>`

- [ ] **Step 1: Write failing tests**

Append these tests before the closing `});` of `describe('GitHub client', () => {` in `tests/github.test.js`:

```js
  it('loads raw base64 file content without JSON parsing', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ content: ' aW1hZ2UtYnl0ZXM=\\n' })
      };
    };
    const client = createGitHubClient(settings, fetchImpl);

    const content = await client.getFileBase64('checkins/2026-06-28/0840/face.jpg');

    assert.equal(content, 'aW1hZ2UtYnl0ZXM=');
    assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data/contents/checkins%2F2026-06-28%2F0840%2Fface.jpg');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  });

  it('finds completed check-in folders and ignores incomplete folders', async () => {
    const directoryPayloads = new Map([
      ['checkins', [
        { type: 'dir', name: '2026-06-27', path: 'checkins/2026-06-27' },
        { type: 'dir', name: '2026-06-28', path: 'checkins/2026-06-28' },
        { type: 'file', name: 'README.md', path: 'checkins/README.md' }
      ]],
      ['checkins/2026-06-27', [
        { type: 'dir', name: '2030', path: 'checkins/2026-06-27/2030' }
      ]],
      ['checkins/2026-06-28', [
        { type: 'dir', name: '0840', path: 'checkins/2026-06-28/0840' },
        { type: 'dir', name: '0915', path: 'checkins/2026-06-28/0915' }
      ]],
      ['checkins/2026-06-27/2030', [
        { type: 'file', name: 'complete.json', path: 'checkins/2026-06-27/2030/complete.json' },
        { type: 'file', name: 'manifest.json', path: 'checkins/2026-06-27/2030/manifest.json' }
      ]],
      ['checkins/2026-06-28/0840', [
        { type: 'file', name: 'complete.json', path: 'checkins/2026-06-28/0840/complete.json' },
        { type: 'file', name: 'face.jpg', path: 'checkins/2026-06-28/0840/face.jpg' }
      ]],
      ['checkins/2026-06-28/0915', [
        { type: 'file', name: 'manifest.json', path: 'checkins/2026-06-28/0915/manifest.json' }
      ]]
    ]);
    const fetchImpl = async (url) => {
      const path = decodeURIComponent(url.split('/contents/')[1]);
      return {
        ok: true,
        json: async () => directoryPayloads.get(path)
      };
    };
    const client = createGitHubClient(settings, fetchImpl);

    const paths = await client.findCompletedCheckins();

    assert.deepEqual(paths, [
      'checkins/2026-06-27/2030',
      'checkins/2026-06-28/0840'
    ]);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test tests/github.test.js
```

Expected: FAIL because `client.getFileBase64` and `client.findCompletedCheckins` are not defined.

- [ ] **Step 3: Implement helpers in `js/github.js`**

Add this function after `getJson(path)`:

```js
  async function getFileBase64(path) {
    const payload = await request(fetchImpl, {
      url: buildContentsUrl(githubOwner, dataRepo, path),
      options: { headers }
    });
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Expected file payload for ${path}`);
    }
    if (typeof payload.content !== 'string') {
      throw new Error(`GitHub API did not return file content for ${path}`);
    }

    return stripBase64Whitespace(payload.content);
  }
```

Add this function after `findAssessmentFiles()`:

```js
  async function findCompletedCheckins() {
    const checkins = await listDirectory('checkins');
    const completedPaths = [];

    for (const dateEntry of checkins.filter(isDirectory)) {
      const datePath = getEntryPath(dateEntry, `checkins/${getEntryName(dateEntry)}`);
      const dateEntries = await listDirectory(datePath);

      for (const timeEntry of dateEntries.filter(isDirectory)) {
        const timePath = getEntryPath(timeEntry, `${datePath}/${getEntryName(timeEntry)}`);
        const checkinEntries = await listDirectory(timePath);
        if (checkinEntries.some((entry) => isFile(entry, 'complete.json'))) {
          completedPaths.push(timePath);
        }
      }
    }

    return completedPaths;
  }
```

Expose both helpers in the returned object:

```js
  return {
    testConnection,
    putFile,
    getJson,
    getFileBase64,
    listDirectory,
    uploadCheckin,
    findAssessmentFiles,
    findCompletedCheckins
  };
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
node --test tests/github.test.js
```

Expected: PASS for all GitHub client tests.

- [ ] **Step 5: Commit**

```bash
git add js/github.js tests/github.test.js
git commit -m "Add GitHub completed check-in photo helpers"
```

---

### Task 2: Progress Entry Normalization

**Files:**
- Create: `js/progress.js`
- Create: `tests/progress.test.js`

**Interfaces:**
- Consumes: `PHOTO_AREAS` from `js/photos.js`.
- Produces:
  - `PHOTO_AREA_LABELS: { face: string, neck: string, hands: string }`
  - `buildProgressEntry(input: { checkinPath: string, manifest?: object, photoBase64ByArea?: object }): object`
  - `normalizeProgressEntries(entries: object[]): object[]`
  - `getProgressAreaView(entries: object[], selectedArea: string): { selectedArea: string, label: string, timeline: object[], latest: object | null, baseline: object | null }`

- [ ] **Step 1: Write failing tests**

Create `tests/progress.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProgressEntry,
  getProgressAreaView,
  normalizeProgressEntries,
  PHOTO_AREA_LABELS
} from '../js/progress.js';

describe('progress photo timeline helpers', () => {
  it('normalizes a completed check-in into area photo entries', () => {
    const entry = buildProgressEntry({
      checkinPath: 'checkins/2026-06-28/0840',
      manifest: {
        createdAt: '2026-06-28T08:40:00-05:00',
        recoveryDay: 2,
        stageAuto: 'mends_bronzing',
        photos: {
          face: 'face.jpg',
          neck: 'neck.jpg',
          hands: 'hands.jpg'
        }
      },
      photoBase64ByArea: {
        face: 'ZmFjZQ==',
        neck: 'bmVjaw==',
        hands: 'aGFuZHM='
      }
    });

    assert.equal(entry.checkinPath, 'checkins/2026-06-28/0840');
    assert.equal(entry.date, '2026-06-28');
    assert.equal(entry.time, '0840');
    assert.equal(entry.recoveryDay, 2);
    assert.equal(entry.stageAuto, 'mends_bronzing');
    assert.equal(entry.photos.face.fileName, 'face.jpg');
    assert.equal(entry.photos.face.src, 'data:image/jpeg;base64,ZmFjZQ==');
    assert.equal(entry.photos.neck.src, 'data:image/jpeg;base64,bmVjaw==');
    assert.equal(entry.photos.hands.src, 'data:image/jpeg;base64,aGFuZHM=');
  });

  it('falls back to path metadata and default photo filenames', () => {
    const entry = buildProgressEntry({
      checkinPath: 'checkins/2026-06-27/2030',
      manifest: {},
      photoBase64ByArea: {
        face: 'ZmFjZQ=='
      }
    });

    assert.equal(entry.date, '2026-06-27');
    assert.equal(entry.time, '2030');
    assert.equal(entry.recoveryDay, null);
    assert.equal(entry.photos.face.fileName, 'face.jpg');
    assert.equal(entry.photos.face.src, 'data:image/jpeg;base64,ZmFjZQ==');
    assert.equal(entry.photos.neck, null);
  });

  it('sorts progress entries newest first', () => {
    const older = buildProgressEntry({
      checkinPath: 'checkins/2026-06-27/2030',
      photoBase64ByArea: { face: 'b2xk' }
    });
    const newer = buildProgressEntry({
      checkinPath: 'checkins/2026-06-28/0840',
      photoBase64ByArea: { face: 'bmV3' }
    });

    assert.deepEqual(
      normalizeProgressEntries([older, newer]).map((entry) => entry.checkinPath),
      ['checkins/2026-06-28/0840', 'checkins/2026-06-27/2030']
    );
  });

  it('builds the selected-area timeline and latest baseline pair', () => {
    const entries = normalizeProgressEntries([
      buildProgressEntry({
        checkinPath: 'checkins/2026-06-27/2030',
        manifest: { recoveryDay: 1 },
        photoBase64ByArea: { face: 'ZGF5MQ==', neck: 'bmVjazE=' }
      }),
      buildProgressEntry({
        checkinPath: 'checkins/2026-06-28/0840',
        manifest: { recoveryDay: 2 },
        photoBase64ByArea: { face: 'ZGF5Mg==' }
      })
    ]);

    const faceView = getProgressAreaView(entries, 'face');
    assert.equal(faceView.selectedArea, 'face');
    assert.equal(faceView.label, PHOTO_AREA_LABELS.face);
    assert.equal(faceView.timeline.length, 2);
    assert.equal(faceView.latest.checkinPath, 'checkins/2026-06-28/0840');
    assert.equal(faceView.baseline.checkinPath, 'checkins/2026-06-27/2030');

    const neckView = getProgressAreaView(entries, 'neck');
    assert.equal(neckView.timeline.length, 1);
    assert.equal(neckView.latest.checkinPath, 'checkins/2026-06-27/2030');
    assert.equal(neckView.baseline.checkinPath, 'checkins/2026-06-27/2030');
  });

  it('defaults unknown selected areas to face', () => {
    const view = getProgressAreaView([], 'torso');

    assert.equal(view.selectedArea, 'face');
    assert.equal(view.label, 'Face');
    assert.deepEqual(view.timeline, []);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/progress.test.js
```

Expected: FAIL because `js/progress.js` does not exist.

- [ ] **Step 3: Create `js/progress.js`**

```js
import { PHOTO_AREAS } from './photos.js';

export const PHOTO_AREA_LABELS = {
  face: 'Face',
  neck: 'Neck',
  hands: 'Hands'
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPathPart(checkinPath, index) {
  return `${checkinPath ?? ''}`.split('/')[index] || '';
}

function getCreatedDate(manifest, checkinPath) {
  if (typeof manifest?.createdAt === 'string' && manifest.createdAt.length >= 10) {
    return manifest.createdAt.slice(0, 10);
  }

  return getPathPart(checkinPath, 1);
}

function normalizeRecoveryDay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildPhoto(area, manifest, photoBase64ByArea) {
  const base64 = typeof photoBase64ByArea?.[area] === 'string'
    ? photoBase64ByArea[area].replace(/\s+/g, '')
    : '';

  if (!base64) {
    return null;
  }

  const fileName = typeof manifest?.photos?.[area] === 'string' && manifest.photos[area]
    ? manifest.photos[area]
    : `${area}.jpg`;

  return {
    fileName,
    src: `data:image/jpeg;base64,${base64}`
  };
}

export function buildProgressEntry({ checkinPath, manifest = {}, photoBase64ByArea = {} }) {
  const safeManifest = isPlainObject(manifest) ? manifest : {};

  return {
    checkinPath: `${checkinPath ?? ''}`,
    date: getCreatedDate(safeManifest, checkinPath),
    time: getPathPart(checkinPath, 2),
    recoveryDay: normalizeRecoveryDay(safeManifest.recoveryDay),
    stageAuto: typeof safeManifest.stageAuto === 'string' ? safeManifest.stageAuto : '',
    photos: Object.fromEntries(
      PHOTO_AREAS.map((area) => [area, buildPhoto(area, safeManifest, photoBase64ByArea)])
    )
  };
}

export function normalizeProgressEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.checkinPath === 'string' && entry.checkinPath)
    .slice()
    .sort((a, b) => `${b.checkinPath}`.localeCompare(`${a.checkinPath}`));
}

function normalizeSelectedArea(selectedArea) {
  return PHOTO_AREAS.includes(selectedArea) ? selectedArea : 'face';
}

export function getProgressAreaView(entries, selectedArea) {
  const normalizedArea = normalizeSelectedArea(selectedArea);
  const timeline = normalizeProgressEntries(entries)
    .filter((entry) => Boolean(entry.photos?.[normalizedArea]?.src));

  return {
    selectedArea: normalizedArea,
    label: PHOTO_AREA_LABELS[normalizedArea],
    timeline,
    latest: timeline[0] ?? null,
    baseline: timeline.at(-1) ?? null
  };
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
node --test tests/progress.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/progress.js tests/progress.test.js
git commit -m "Add progress photo timeline helpers"
```

---

### Task 3: Progress Tab Renderer

**Files:**
- Create: `js/ui/progress.js`
- Modify: `tests/smoke.test.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/ui/components.js`, `PHOTO_AREAS` from `js/photos.js`, `PHOTO_AREA_LABELS` and `getProgressAreaView` from `js/progress.js`.
- Produces:
  - `renderProgress(root: { innerHTML: string }, viewModel: { status: string, selectedArea: string, entries?: object[], errorMessage?: string }): void`

- [ ] **Step 1: Write failing renderer tests**

Add this test after the existing assessment history smoke test in `tests/smoke.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test tests/smoke.test.js
```

Expected: FAIL because `js/ui/progress.js` does not exist.

- [ ] **Step 3: Create `js/ui/progress.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
node --test tests/progress.test.js tests/smoke.test.js
```

Expected: PASS for progress helper and smoke tests.

- [ ] **Step 5: Commit**

```bash
git add js/ui/progress.js tests/smoke.test.js
git commit -m "Add progress photo timeline renderer"
```

---

### Task 4: Route Wiring And Async Photo Loading

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `sw.js`
- Modify: `tests/smoke.test.js`

**Interfaces:**
- Consumes:
  - `createGitHubClient(settings)`
  - `buildProgressEntry`, `normalizeProgressEntries`
  - `renderProgress(root, viewModel)`
  - `PHOTO_AREAS`
- Produces:
  - route id `progress`
  - app action `set-progress-area`
  - app action `retry-progress`

- [ ] **Step 1: Write failing route and cache tests**

Update `tests/smoke.test.js` route test:

```js
    for (const route of ['today', 'log', 'assessments', 'progress', 'guide', 'settings']) {
      assert.match(html, new RegExp(`data-route="${route}"`));
    }
```

Update the service worker cache test:

```js
    for (const path of ['index.html', 'css/styles.css', 'js/app.js', 'js/progress.js', 'js/ui/progress.js', 'manifest.webmanifest']) {
      assert.match(sw, new RegExp(path.replace('.', '\\.')));
    }
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test tests/smoke.test.js
```

Expected: FAIL because `index.html` has no `progress` route and `sw.js` does not pre-cache the new progress modules.

- [ ] **Step 3: Modify `index.html` nav**

Replace the nav block with:

```html
      <nav class="tab-nav" aria-label="Primary">
        <button class="tab-button is-active" type="button" data-action="route" data-route="today">Today</button>
        <button class="tab-button" type="button" data-action="route" data-route="log">Log</button>
        <button class="tab-button" type="button" data-action="route" data-route="assessments">Assess</button>
        <button class="tab-button" type="button" data-action="route" data-route="progress">Progress</button>
        <button class="tab-button" type="button" data-action="route" data-route="guide">Guide</button>
        <button class="tab-button" type="button" data-action="route" data-route="settings">Settings</button>
      </nav>
```

- [ ] **Step 4: Modify `sw.js`**

Change:

```js
const CACHE_NAME = 'halo-post-care-v5';
```

to:

```js
const CACHE_NAME = 'halo-post-care-v6';
```

Add these entries to `APP_SHELL`:

```js
  './js/progress.js',
  './js/ui/progress.js',
```

Place `./js/progress.js` after `./js/photos.js`, and place `./js/ui/progress.js` after `./js/ui/log.js`.

- [ ] **Step 5: Modify `js/app.js` imports and state**

Add imports:

```js
import { buildProgressEntry, normalizeProgressEntries } from './progress.js';
import { renderProgress } from './ui/progress.js';
```

Change routes:

```js
const routes = ['today', 'log', 'assessments', 'progress', 'guide', 'settings'];
```

Add after log preview state:

```js
let activeProgressRenderToken = 0;
let progressUiState = {
  selectedArea: 'face',
  entries: [],
  status: 'idle',
  errorMessage: ''
};
```

- [ ] **Step 6: Add progress loading helpers in `js/app.js`**

Add these helpers after `renderSettingsRoute(root, context)`:

```js
function hasGitHubProgressSettings(settings) {
  return Boolean(settings?.githubOwner && settings?.dataRepo && settings?.token);
}

async function loadProgressEntries(settings) {
  const client = createGitHubClient(settings);
  const checkinPaths = await client.findCompletedCheckins();
  const entries = [];

  for (const checkinPath of checkinPaths) {
    let manifest = {};
    try {
      manifest = await client.getJson(`${checkinPath}/manifest.json`);
    } catch (error) {
      manifest = {};
    }

    const photoBase64ByArea = {};
    for (const area of PHOTO_AREAS) {
      const fileName = typeof manifest?.photos?.[area] === 'string' && manifest.photos[area]
        ? manifest.photos[area]
        : `${area}.jpg`;
      try {
        photoBase64ByArea[area] = await client.getFileBase64(`${checkinPath}/${fileName}`);
      } catch (error) {
        photoBase64ByArea[area] = '';
      }
    }

    entries.push(buildProgressEntry({ checkinPath, manifest, photoBase64ByArea }));
  }

  return normalizeProgressEntries(entries);
}

async function renderProgressRoute(root, context) {
  const renderToken = ++activeProgressRenderToken;

  if (!hasGitHubProgressSettings(context.settings)) {
    progressUiState = {
      ...progressUiState,
      status: 'missing_settings',
      errorMessage: ''
    };
    renderProgress(root, progressUiState);
    updateSyncStatusText('GitHub settings needed for progress photos.');
    return;
  }

  progressUiState = {
    ...progressUiState,
    status: 'loading',
    errorMessage: ''
  };
  renderProgress(root, progressUiState);
  updateSyncStatusText('Loading progress photos...');

  try {
    const entries = await loadProgressEntries(context.settings);
    if (renderToken !== activeProgressRenderToken || getRoute() !== 'progress') {
      return;
    }

    progressUiState = {
      ...progressUiState,
      entries,
      status: 'ready',
      errorMessage: ''
    };
    renderProgress(root, progressUiState);
    updateSyncStatusText(`Loaded ${entries.length} completed check-in${entries.length === 1 ? '' : 's'}.`);
  } catch (error) {
    if (renderToken !== activeProgressRenderToken || getRoute() !== 'progress') {
      return;
    }

    progressUiState = {
      ...progressUiState,
      status: 'error',
      errorMessage: error.message || 'Progress photo sync failed.'
    };
    renderProgress(root, progressUiState);
    updateSyncStatusText('Progress photo sync failed.');
  }
}
```

- [ ] **Step 7: Wire route rendering in `js/app.js`**

Update route labels:

```js
  const labels = {
    today: 'Today',
    log: 'Log',
    assessments: 'Assessments',
    progress: 'Progress',
    guide: 'Guide',
    settings: 'Settings'
  };
```

Add a progress branch after assessments:

```js
  } else if (route === 'progress') {
    revokeLogPreviewUrls();
    void renderProgressRoute(root, context);
  } else if (route === 'guide') {
```

In every non-progress route branch, invalidate stale progress loads by incrementing `activeProgressRenderToken` before rendering that route:

```js
    activeProgressRenderToken += 1;
```

Use it in `today`, `log`, `assessments`, `guide`, `settings`, and the final fallback branch that calls `renderPlaceholder(root, route)`.

- [ ] **Step 8: Wire progress actions in `js/app.js`**

Add these action handlers before `export-data`:

```js
    if (action === 'set-progress-area') {
      const area = actionTarget.dataset.progressArea;
      if (PHOTO_AREAS.includes(area)) {
        progressUiState = {
          ...progressUiState,
          selectedArea: area
        };
        const root = document.querySelector('#app');
        if (root && getRoute() === 'progress') {
          renderProgress(root, progressUiState);
        } else {
          render('progress');
        }
      }
      return;
    }

    if (action === 'retry-progress') {
      progressUiState = {
        ...progressUiState,
        status: 'idle',
        errorMessage: ''
      };
      render('progress');
      return;
    }
```

- [ ] **Step 9: Run tests to verify GREEN**

Run:

```bash
node --test tests/smoke.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add index.html js/app.js sw.js tests/smoke.test.js
git commit -m "Wire progress photo tab"
```

---

### Task 5: Progress Styles And Mobile Polish

**Files:**
- Modify: `css/styles.css`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Consumes class names from `js/ui/progress.js`.
- Produces responsive styles for:
  - `.segmented-control`
  - `.segmented-button`
  - `.progress-photo-strip`
  - `.progress-photo-card`
  - `.progress-photo-frame`
  - `.progress-photo-image`
  - `.progress-photo-placeholder`
  - `.progress-compare-grid`

- [ ] **Step 1: Write failing CSS presence test**

Add this smoke test after the service worker test:

```js
  it('defines Progress tab visual classes', async () => {
    const css = await readFile('css/styles.css', 'utf8');
    for (const className of [
      'segmented-control',
      'segmented-button',
      'progress-photo-strip',
      'progress-photo-card',
      'progress-photo-frame',
      'progress-photo-image',
      'progress-photo-placeholder',
      'progress-compare-grid'
    ]) {
      assert.match(css, new RegExp(`\\\\.${className}`));
    }
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --test tests/smoke.test.js
```

Expected: FAIL because the new classes are not defined.

- [ ] **Step 3: Add CSS**

Add this block after `.score-group` styles:

```css
.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.segmented-button {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-strong);
  color: var(--muted);
  font-weight: 700;
}

.segmented-button.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.progress-photo-strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(245px, 78%);
  gap: 12px;
  margin-left: -16px;
  margin-right: -16px;
  padding: 0 16px 4px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
}

.progress-photo-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  scroll-snap-align: start;
}

.progress-photo-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  margin-bottom: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-strong);
  overflow: hidden;
}

.progress-photo-image,
.progress-photo-placeholder {
  width: 100%;
  height: 100%;
}

.progress-photo-image {
  display: block;
  object-fit: cover;
}

.progress-photo-placeholder {
  display: grid;
  place-items: center;
  padding: 16px;
  color: var(--muted);
  text-align: center;
}

.progress-compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
```

Update focus styles by adding `.segmented-button:focus-visible`:

```css
.segmented-button:focus-visible,
```

Update `.tab-nav` grid to six columns:

```css
  grid-template-columns: repeat(6, 1fr);
```

In the `@media (max-width: 520px)` block, change `.tab-button` font size:

```css
  .tab-button {
    font-size: 0.72rem;
  }
```

Add this mobile comparison rule inside the same media block:

```css
  .progress-compare-grid {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
node --test tests/smoke.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css tests/smoke.test.js
git commit -m "Style progress photo timeline"
```

---

### Task 6: Documentation, Verification, And Publish

**Files:**
- Modify: `CLAUDE.md`
- Modify: `/Users/jonathanpeters/Documents/Jonathan's Vault/🎯 Projects/🧴 Halo Post-Care App/Overview.md`
- Modify: `/Users/jonathanpeters/Documents/Jonathan's Vault/🎯 Projects/🧴 Halo Post-Care App/Log.md`
- Modify: `/Users/jonathanpeters/Documents/Jonathan's Vault/memory/projects/halo-post-care.md`

**Interfaces:**
- Consumes verified implementation commit hash.
- Produces updated handoff notes for Codex/Claude and Obsidian.

- [ ] **Step 1: Run full automated tests**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run local app server**

Run:

```bash
npm run serve
```

If port `4173` is busy, run:

```bash
python3 -m http.server 4174
```

- [ ] **Step 3: Verify local mobile UI**

Use Chrome or Playwright at a 390px-wide mobile viewport:

1. Open local app.
2. Confirm bottom nav shows `Progress` without text overlap.
3. Click `Progress`.
4. With missing token or isolated test browser, confirm the Settings state renders.
5. If using a browser profile with valid settings, confirm loaded photos render in the timeline.
6. Confirm `Face`, `Neck`, `Hands` switch the selected area.

- [ ] **Step 4: Update `CLAUDE.md`**

Add a current-state bullet:

```md
- Latest app update on 2026-06-28: dedicated `Progress` tab shows private check-in photos by area over time. `Face`, `Neck`, and `Hands` timelines load from completed private data repo check-ins using the existing GitHub token. Service worker cache bumped to `halo-post-care-v6`.
```

Add important files:

```md
- `js/progress.js`: progress photo normalization and selected-area view helpers.
- `js/ui/progress.js`: Progress tab renderer for loading, empty, error, and photo timeline states.
```

Add handoff note:

```md
- 2026-06-28 (Codex): Added `Progress` tab for visual photo comparison over time. It reads completed private repo check-ins through GitHub Contents API, renders same-area timelines for Face/Neck/Hands, and keeps photo data out of the public repo. Do not add real photo fixtures or screenshots to this repo.
```

- [ ] **Step 5: Update Obsidian notes**

Update:

- `/Users/jonathanpeters/Documents/Jonathan's Vault/🎯 Projects/🧴 Halo Post-Care App/Overview.md`
- `/Users/jonathanpeters/Documents/Jonathan's Vault/🎯 Projects/🧴 Halo Post-Care App/Log.md`
- `/Users/jonathanpeters/Documents/Jonathan's Vault/memory/projects/halo-post-care.md`

Use this content:

```md
Progress tab added on 2026-06-28: private check-in photos can be compared by area over time. The view has Face, Neck, and Hands timelines plus Latest vs Baseline comparison. Photos stay in the private data repo and runtime app memory, not the public app repo.
```

For the project log, add the final commit hash after commit.

- [ ] **Step 6: Run final verification**

Run:

```bash
git diff --check
npm test
```

Expected: `git diff --check` exits 0 and all tests pass.

- [ ] **Step 7: Commit repo docs**

```bash
git add CLAUDE.md
git commit -m "Document progress photo timeline"
```

Obsidian notes are edited in place outside this repo and are not part of this git commit.

- [ ] **Step 8: Push and verify published app**

Run:

```bash
git push origin main
gh api repos/jcpeters08/halo-post-care/pages --jq '{status, html_url, https_enforced, source}'
COMMIT_SHA="$(git rev-parse --short HEAD)"
curl -L -s "https://jcpeters08.github.io/halo-post-care/sw.js?v=${COMMIT_SHA}" | head -1
curl -L -s "https://jcpeters08.github.io/halo-post-care/js/ui/progress.js?v=${COMMIT_SHA}" | rg 'renderProgress|progress-photo-strip'
```

Use the printed `COMMIT_SHA` value for the browser URL in the next step.

- [ ] **Step 9: Validate published UI in Chrome**

Open:

```text
COMMIT_SHA="$(git rev-parse --short HEAD)"
open "https://jcpeters08.github.io/halo-post-care/?v=${COMMIT_SHA}#progress"
```

Confirm:

- `Progress` tab is visible.
- the route loads without console errors.
- missing-settings, loading, or loaded state is visually coherent.
- bottom nav text does not overlap on mobile viewport.
