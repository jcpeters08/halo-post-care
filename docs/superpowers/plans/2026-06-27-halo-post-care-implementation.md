# Halo Post-Care Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved mobile-first closed-loop Halo post-care PWA that captures daily face, neck, and hands check-ins, writes them to a private GitHub data repo, and applies Codex-authored recovery assessments back into the app.

**Architecture:** Static HTML, CSS, and vanilla ES modules. Pure data/contract modules are tested with Node's built-in test runner; browser-bound modules are verified with local-server manual checks. The public app repo stores only code and docs, while private recovery check-ins and Codex assessments live in `halo-post-care-data`.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node `node:test`, localStorage, IndexedDB, Canvas image compression, Service Worker, GitHub REST Contents API.

## Global Constraints

- The public app repo is `halo-post-care`.
- The private data repo is `halo-post-care-data`.
- The app is static HTML, CSS, and vanilla ES modules with no build step.
- The app stores a persistent fine-grained GitHub token in localStorage.
- The token is scoped only to `halo-post-care-data`, has Contents read/write access, and expires around the recovery window.
- Check-ins happen once per day.
- Every check-in requires face, neck, and hands photos.
- Codex is the primary reviewer for photo-based recovery assessments.
- Codex writes both `assessment.json` and `assessment.md` into the relevant check-in folder.
- The app automatically applies the newest valid Codex assessment.
- The app names assessments as Codex assessments throughout the UI.
- Provider and clinic instructions remain safety guardrails, but Codex may adjust practical guidance over time based on photos and symptoms.
- No third-party scripts, fonts, analytics, CDNs, or image hosts.
- Network calls are limited to `https://api.github.com`.
- Personal photos, symptom logs, check-ins, and assessments must not be written to the public app repo.

---

## File Structure

Create or modify these files:

- `package.json`: Node test scripts; no runtime dependencies.
- `.gitignore`: local server logs, OS files, coverage folders.
- `README.md`: setup, deployment, token, data repo, and daily Codex workflow.
- `index.html`: PWA shell, CSP meta, app root, mobile nav, no external assets.
- `css/styles.css`: mobile-first layout, touch targets, status colors, responsive guardrails.
- `manifest.webmanifest`: PWA metadata and icon references.
- `sw.js`: app-shell precache and offline fallback for local assets.
- `icons/app-icon.svg`: local visual asset for the PWA icon.
- `js/app.js`: boot, routing, global event delegation, state refresh.
- `js/data.js`: recovery schedule, safety triggers, clinic numbers, guidance groups.
- `js/day.js`: date math, stage derivation, daily targets.
- `js/storage.js`: localStorage helpers, export, reset, persistent-storage request.
- `js/checklist.js`: daily checklist and counter state operations.
- `js/checkins.js`: check-in path, manifest, Markdown summary, completion marker.
- `js/assessment.js`: assessment schema validation and latest-assessment selection.
- `js/github.js`: GitHub Contents API client for repo tests, upload, listing, and reads.
- `js/photos.js`: IndexedDB photo draft storage and Canvas compression.
- `js/ui/components.js`: shared DOM helpers and small render helpers.
- `js/ui/today.js`: Today tab renderer.
- `js/ui/log.js`: Log tab renderer and check-in workflow controller.
- `js/ui/guide.js`: Guide tab renderer.
- `js/ui/settings.js`: Settings tab renderer and GitHub/sync actions.
- `tests/day.test.js`: recovery day, stages, targets.
- `tests/checklist.test.js`: checklist and counter operations.
- `tests/checkins.test.js`: check-in folder contract, manifest, summary.
- `tests/assessment.test.js`: assessment schema and latest selection.
- `tests/github.test.js`: mocked GitHub request construction and base64 behavior.
- `tests/storage.test.js`: storage JSON round-trips with a fake storage object.
- `tests/photos.test.js`: photo area completeness helpers and draft metadata helpers.
- `tests/smoke.test.js`: required file presence and no runtime dependency guard.

Boundaries:

- Pure modules must not import DOM APIs: `data.js`, `day.js`, `checklist.js`, `checkins.js`, `assessment.js`, and most of `github.js`.
- Browser modules may import pure modules: `app.js`, `photos.js`, and `js/ui/*.js`.
- `github.js` accepts a `fetchImpl` argument for tests.
- `storage.js` accepts a `storage` argument for tests where practical.
- UI modules render into passed DOM nodes and call public APIs from pure/browser modules.

---

### Task 1: Project Foundation And App Shell

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `css/styles.css`
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `icons/app-icon.svg`
- Create: `js/app.js`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Produces: `npm test` script running `node --test tests`.
- Produces: DOM anchors `#app`, `[data-route]`, and `#sync-status` for later UI tasks.
- Produces: service worker cache name `halo-post-care-v1`.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/smoke.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/smoke.test.js`

Expected: FAIL because `index.html` and `package.json` do not exist yet.

- [ ] **Step 3: Create the static shell files**

Create `package.json`:

```json
{
  "name": "halo-post-care",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests",
    "serve": "python3 -m http.server 4173"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `.gitignore`:

```gitignore
.DS_Store
coverage/
.nyc_output/
*.log
```

Create `index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'none'">
    <meta name="theme-color" content="#f7f4ef">
    <title>Halo Post-Care</title>
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="icons/app-icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="icons/app-icon.svg">
    <link rel="stylesheet" href="css/styles.css">
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Halo Post-Care</p>
          <h1 id="screen-title">Today</h1>
        </div>
        <a class="call-link" href="tel:9527673163">Call clinic</a>
      </header>
      <main id="app" class="app-main" tabindex="-1"></main>
      <p id="sync-status" class="sync-status" aria-live="polite">Ready</p>
      <nav class="tab-nav" aria-label="Primary">
        <button class="tab-button is-active" type="button" data-route="today">Today</button>
        <button class="tab-button" type="button" data-route="log">Log</button>
        <button class="tab-button" type="button" data-route="guide">Guide</button>
        <button class="tab-button" type="button" data-route="settings">Settings</button>
      </nav>
    </div>
    <script type="module" src="js/app.js"></script>
  </body>
</html>
```

Create `css/styles.css`:

```css
:root {
  color-scheme: light;
  --bg: #f7f4ef;
  --surface: #ffffff;
  --text: #1f2523;
  --muted: #64706b;
  --line: #d9ded9;
  --accent: #2f6f73;
  --warning: #a33d2d;
  --ok: #2f6f49;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

button,
input,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: max(16px, env(safe-area-inset-top)) 16px calc(88px + env(safe-area-inset-bottom));
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 auto 18px;
  max-width: 720px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 1.8rem;
  line-height: 1.1;
  letter-spacing: 0;
}

.call-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--warning);
  color: white;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.app-main {
  max-width: 720px;
  margin: 0 auto;
}

.sync-status {
  max-width: 720px;
  margin: 18px auto 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.tab-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  padding: 8px 10px max(8px, env(safe-area-inset-bottom));
  background: rgba(247, 244, 239, 0.96);
  border-top: 1px solid var(--line);
}

.tab-button {
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
}

.tab-button.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--line);
}

.panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 16px;
}

@media (min-width: 760px) {
  .app-shell {
    padding-left: 24px;
    padding-right: 24px;
  }
}
```

Create `manifest.webmanifest`:

```json
{
  "name": "Halo Post-Care",
  "short_name": "Halo Care",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#f7f4ef",
  "theme_color": "#f7f4ef",
  "icons": [
    {
      "src": "icons/app-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

Create `sw.js`:

```js
const CACHE_NAME = 'halo-post-care-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/app-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
```

Create `icons/app-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Halo Post-Care">
  <rect width="512" height="512" rx="96" fill="#f7f4ef"/>
  <circle cx="256" cy="236" r="134" fill="none" stroke="#2f6f73" stroke-width="34"/>
  <path d="M158 334c54 46 142 46 196 0" fill="none" stroke="#a33d2d" stroke-width="26" stroke-linecap="round"/>
  <circle cx="210" cy="224" r="16" fill="#1f2523"/>
  <circle cx="302" cy="224" r="16" fill="#1f2523"/>
</svg>
```

Create `js/app.js`:

```js
const routes = ['today', 'log', 'guide', 'settings'];

function getRoute() {
  const hash = window.location.hash.replace('#', '');
  return routes.includes(hash) ? hash : 'today';
}

function render(route = getRoute()) {
  const root = document.querySelector('#app');
  const title = document.querySelector('#screen-title');
  const labels = { today: 'Today', log: 'Log', guide: 'Guide', settings: 'Settings' };
  title.textContent = labels[route];
  root.innerHTML = `<section class="panel"><h2>${labels[route]}</h2><p>This view is ready for implementation.</p></section>`;
  for (const button of document.querySelectorAll('[data-route]')) {
    button.classList.toggle('is-active', button.dataset.route === route);
  }
}

document.addEventListener('click', (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (!routeButton) return;
  window.location.hash = routeButton.dataset.route;
});

window.addEventListener('hashchange', () => render());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

render();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS for `tests/smoke.test.js`.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore index.html css/styles.css manifest.webmanifest sw.js icons/app-icon.svg js/app.js tests/smoke.test.js
git commit -m "Build static PWA shell"
```

---

### Task 2: Recovery Data, Day Math, And Daily Targets

**Files:**
- Create: `js/data.js`
- Create: `js/day.js`
- Test: `tests/day.test.js`

**Interfaces:**
- Produces: `RECOVERY_CONTENT`, `SAFETY_TRIGGERS`, `CLINIC_CONTACTS`, `GUIDANCE_GROUPS` from `js/data.js`.
- Produces: `parseLocalIsoDate(isoDate)`, `formatLocalIsoDate(date)`, `computeRecoveryDay(todayIso, procedureDateIso)`, `getStageForDay(recoveryDay)`, `getTimelineForDay(recoveryDay)`, `buildDailyTargets(recoveryDay, acyclovirPerDay)` from `js/day.js`.
- Consumed by: checklist initialization, Today UI, Guide UI, check-in manifest building.

- [ ] **Step 1: Write the failing day tests**

Create `tests/day.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyTargets,
  computeRecoveryDay,
  getStageForDay,
  getTimelineForDay
} from '../js/day.js';

describe('recovery day math', () => {
  it('treats procedure date as day 0', () => {
    assert.equal(computeRecoveryDay('2026-06-26', '2026-06-26'), 0);
    assert.equal(computeRecoveryDay('2026-06-27', '2026-06-26'), 1);
    assert.equal(computeRecoveryDay('2026-07-04', '2026-06-26'), 8);
  });

  it('maps day ranges to stages', () => {
    assert.equal(getStageForDay(0).id, 'heat_swelling');
    assert.equal(getStageForDay(1).id, 'red_warm_tight');
    assert.equal(getStageForDay(2).id, 'mends_bronzing');
    assert.equal(getStageForDay(3).id, 'mends_bronzing');
    assert.equal(getStageForDay(4).id, 'flaking_peeling');
    assert.equal(getStageForDay(7).id, 'flaking_peeling');
    assert.equal(getStageForDay(8).id, 'peeled_calm_reintroduction');
  });

  it('returns the correct timeline bucket', () => {
    assert.equal(getTimelineForDay(0).title, 'Day 0');
    assert.equal(getTimelineForDay(1).title, 'Day 1');
    assert.equal(getTimelineForDay(3).title, 'Days 2-3');
    assert.equal(getTimelineForDay(6).title, 'Days 4-7');
    assert.equal(getTimelineForDay(14).title, 'Week 2+');
  });

  it('builds daily targets from the active recovery day', () => {
    assert.deepEqual(buildDailyTargets(1, 2).counters.acyclovir, { target: 2, label: 'Acyclovir' });
    assert.equal(buildDailyTargets(1, 2).counters.hocl.target, 3);
    assert.equal(buildDailyTargets(4, 2).counters.hocl.target, 0);
    assert.equal(buildDailyTargets(4, 2).flags.coldCompress.default, false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/day.test.js`

Expected: FAIL with module-not-found for `../js/day.js`.

- [ ] **Step 3: Implement recovery data and day utilities**

Create `js/data.js` with exact structured entries for:

- Procedure default: `2026-06-26`.
- Timeline buckets: Day 0, Day 1, Days 2-3, Days 4-7, Week 2+.
- Treated areas: Face, Neck, Hands.
- Standing rules: acyclovir, sunscreen, hat/clothing, don'ts.
- Safety triggers and clinic contacts from the approved spec.
- Guidance groups: `exercise`, `heatColdExposure`, `actives`, `cosmeticsCoverage`.

Create `js/day.js` using local date construction, not UTC string subtraction:

```js
import { RECOVERY_CONTENT } from './data.js';

export function parseLocalIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeRecoveryDay(todayIso, procedureDateIso) {
  const today = parseLocalIsoDate(todayIso);
  const procedure = parseLocalIsoDate(procedureDateIso);
  return Math.floor((today.getTime() - procedure.getTime()) / 86400000);
}

export function getStageForDay(recoveryDay) {
  if (recoveryDay <= 0) return RECOVERY_CONTENT.stages.heat_swelling;
  if (recoveryDay === 1) return RECOVERY_CONTENT.stages.red_warm_tight;
  if (recoveryDay <= 3) return RECOVERY_CONTENT.stages.mends_bronzing;
  if (recoveryDay <= 7) return RECOVERY_CONTENT.stages.flaking_peeling;
  return RECOVERY_CONTENT.stages.peeled_calm_reintroduction;
}

export function getTimelineForDay(recoveryDay) {
  return RECOVERY_CONTENT.timeline.find((entry) => recoveryDay >= entry.fromDay && recoveryDay <= entry.toDay)
    ?? RECOVERY_CONTENT.timeline.at(-1);
}

export function buildDailyTargets(recoveryDay, acyclovirPerDay = 2) {
  return {
    am: RECOVERY_CONTENT.routine.am,
    pm: RECOVERY_CONTENT.routine.pm,
    counters: {
      hocl: { label: 'HOCl spray', target: recoveryDay >= 1 && recoveryDay <= 3 ? 3 : 0 },
      cicalfate: { label: 'Cicalfate+', target: recoveryDay >= 1 ? 4 : 1 },
      spf: { label: 'SPF reapply', target: recoveryDay >= 1 ? 1 : 0 },
      acyclovir: { label: 'Acyclovir', target: acyclovirPerDay },
      heliocare: { label: 'Oral Heliocare', target: recoveryDay >= 1 ? 1 : 0 }
    },
    flags: {
      elevated: { label: 'Slept head-elevated', default: recoveryDay <= 3 },
      coldCompress: { label: 'Cold compress', default: recoveryDay === 1 }
    }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for smoke and day tests.

- [ ] **Step 5: Commit**

```bash
git add js/data.js js/day.js tests/day.test.js
git commit -m "Add recovery schedule data and day math"
```

---

### Task 3: Checklist State And Local Storage

**Files:**
- Create: `js/storage.js`
- Create: `js/checklist.js`
- Test: `tests/storage.test.js`
- Test: `tests/checklist.test.js`

**Interfaces:**
- Produces from `storage.js`: `DEFAULT_SETTINGS`, `loadJson(storage, key, fallback)`, `saveJson(storage, key, value)`, `loadSettings(storage)`, `saveSettings(storage, settings)`, `exportAll(storage)`, `resetAll(storage)`, `requestPersistentStorage()`.
- Produces from `checklist.js`: `createDailyState(targets)`, `toggleRoutineStep(state, period, stepId)`, `setCounterValue(state, counterId, value)`, `setFlagValue(state, flagId, value)`, `getCompletionSummary(state, targets)`.
- Consumed by: Today UI, Log manifest builder, Settings export/reset.

- [ ] **Step 1: Write failing storage and checklist tests**

Create `tests/storage.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, exportAll, loadSettings, resetAll, saveSettings } from '../js/storage.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; }
  };
}

describe('storage helpers', () => {
  it('loads default settings', () => {
    assert.deepEqual(loadSettings(fakeStorage()), DEFAULT_SETTINGS);
  });

  it('round-trips settings JSON', () => {
    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, githubOwner: 'jcpeters08', token: 'secret' });
    assert.equal(loadSettings(storage).githubOwner, 'jcpeters08');
    assert.equal(loadSettings(storage).token, 'secret');
  });

  it('exports and resets app-owned keys', () => {
    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, token: 'secret' });
    assert.equal(exportAll(storage).halo_settings_v1.token, 'secret');
    resetAll(storage);
    assert.equal(loadSettings(storage).token, '');
  });
});
```

Create `tests/checklist.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyTargets } from '../js/day.js';
import {
  createDailyState,
  getCompletionSummary,
  setCounterValue,
  setFlagValue,
  toggleRoutineStep
} from '../js/checklist.js';

describe('checklist state', () => {
  it('creates all routine, counter, and flag keys from targets', () => {
    const targets = buildDailyTargets(1, 2);
    const state = createDailyState(targets);
    assert.equal(Object.keys(state.am).length, targets.am.length);
    assert.equal(state.counters.acyclovir, 0);
    assert.equal(state.flags.elevated, false);
  });

  it('toggles steps and clamps counters at zero', () => {
    const targets = buildDailyTargets(1, 2);
    let state = createDailyState(targets);
    state = toggleRoutineStep(state, 'am', targets.am[0].id);
    state = setCounterValue(state, 'acyclovir', -4);
    state = setFlagValue(state, 'elevated', true);
    assert.equal(state.am[targets.am[0].id], true);
    assert.equal(state.counters.acyclovir, 0);
    assert.equal(state.flags.elevated, true);
  });

  it('computes completion counts with target-bearing counters only', () => {
    const targets = buildDailyTargets(1, 2);
    let state = createDailyState(targets);
    for (const step of targets.am) state = toggleRoutineStep(state, 'am', step.id);
    state = setCounterValue(state, 'acyclovir', 2);
    const summary = getCompletionSummary(state, targets);
    assert.equal(summary.am.completed, targets.am.length);
    assert.equal(summary.counters.acyclovir.completed, 2);
    assert.equal(summary.counters.acyclovir.total, 2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/storage.test.js tests/checklist.test.js`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement storage and checklist modules**

`DEFAULT_SETTINGS` must be:

```js
export const DEFAULT_SETTINGS = {
  procedureDate: '2026-06-26',
  acyclovirPerDay: 2,
  githubOwner: 'jcpeters08',
  dataRepo: 'halo-post-care-data',
  token: '',
  lastAssessmentPath: ''
};
```

`checklist.js` must keep state immutable by returning cloned objects from each setter. Counter values must be non-negative integers. Unknown step, counter, and flag IDs must leave state unchanged.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for smoke, day, storage, and checklist tests.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js js/checklist.js tests/storage.test.js tests/checklist.test.js
git commit -m "Add local settings and checklist state"
```

---

### Task 4: Check-In And Assessment Contracts

**Files:**
- Create: `js/checkins.js`
- Create: `js/assessment.js`
- Test: `tests/checkins.test.js`
- Test: `tests/assessment.test.js`

**Interfaces:**
- Produces from `checkins.js`: `REQUIRED_AREAS`, `hasRequiredPhotoAreas(photos)`, `buildCheckinPath(date, time)`, `buildManifest(input)`, `buildSummaryMarkdown(manifest)`, `buildCompleteMarker(manifest)`.
- Produces from `assessment.js`: `GUIDANCE_KEYS`, `validateAssessment(value)`, `isAssessmentApplicable(assessment, checkinPath)`, `selectLatestValidAssessment(entries)`, `getDefaultGuidance()`.
- Consumed by: Log upload workflow, Settings sync, Today guidance.

- [ ] **Step 1: Write failing contract tests**

Create `tests/checkins.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckinPath,
  buildCompleteMarker,
  buildManifest,
  buildSummaryMarkdown,
  hasRequiredPhotoAreas
} from '../js/checkins.js';

describe('check-in contract', () => {
  it('requires face, neck, and hands photos', () => {
    assert.equal(hasRequiredPhotoAreas({ face: {}, neck: {}, hands: {} }), true);
    assert.equal(hasRequiredPhotoAreas({ face: {}, hands: {} }), false);
  });

  it('uses dated time folders to prevent collisions', () => {
    assert.equal(buildCheckinPath('2026-06-27', '20:30'), 'checkins/2026-06-27/2030');
  });

  it('builds manifest, summary, and completion marker', () => {
    const manifest = buildManifest({
      checkinPath: 'checkins/2026-06-27/2030',
      createdAt: '2026-06-27T20:30:00-05:00',
      procedureDate: '2026-06-26',
      recoveryDay: 1,
      stageAuto: 'red_warm_tight',
      symptoms: { redness: 4, swelling: 3, flaking: 1, itch: 2, tightness: 4 },
      adherence: { am: { completed: 5, total: 5 }, pm: { completed: 4, total: 5 }, counters: {} },
      note: 'Hands feel tightest.'
    });
    assert.equal(manifest.photos.face, 'face.jpg');
    assert.match(buildSummaryMarkdown(manifest), /# Check-in - Day 1/);
    assert.equal(buildCompleteMarker(manifest).checkinPath, manifest.checkinPath);
  });
});
```

Create `tests/assessment.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultGuidance,
  isAssessmentApplicable,
  selectLatestValidAssessment,
  validateAssessment
} from '../js/assessment.js';

const validAssessment = {
  schemaVersion: 1,
  assessmentDate: '2026-06-27',
  checkinPath: 'checkins/2026-06-27/2030',
  overall: { status: 'on_track', summary: 'Looks consistent.', confidence: 'medium' },
  observations: [{ area: 'face', severity: 'expected', note: 'Diffuse redness.' }],
  guidance: {
    exercise: { status: 'wait', title: 'Keep activity light', details: 'Walk only.', reviewAfter: 'next_checkin' },
    heatColdExposure: { status: 'wait', title: 'Avoid sauna', details: 'No heat stress.', reviewAfter: 'next_checkin' },
    actives: { status: 'wait', title: 'Do not restart actives', details: 'Barrier is reactive.', reviewAfter: 'next_checkin' },
    cosmeticsCoverage: { status: 'limited', title: 'Tinted SPF only', details: 'Avoid makeup.', reviewAfter: 'next_checkin' }
  },
  safety: { callClinic: false, reasons: [], urgency: 'routine' },
  nextActions: ['Continue routine.']
};

describe('assessment contract', () => {
  it('accepts valid assessment JSON', () => {
    assert.equal(validateAssessment(validAssessment).valid, true);
  });

  it('rejects missing guidance groups', () => {
    const invalid = structuredClone(validAssessment);
    delete invalid.guidance.actives;
    assert.equal(validateAssessment(invalid).valid, false);
  });

  it('checks path applicability', () => {
    assert.equal(isAssessmentApplicable(validAssessment, 'checkins/2026-06-27/2030'), true);
    assert.equal(isAssessmentApplicable(validAssessment, 'checkins/2026-06-28/2030'), false);
  });

  it('selects the newest valid assessment by assessmentDate', () => {
    const older = { ...validAssessment, assessmentDate: '2026-06-26' };
    const newer = { ...validAssessment, assessmentDate: '2026-06-28' };
    assert.equal(selectLatestValidAssessment([older, newer]).assessmentDate, '2026-06-28');
  });

  it('provides all default guidance groups', () => {
    assert.deepEqual(Object.keys(getDefaultGuidance()), ['exercise', 'heatColdExposure', 'actives', 'cosmeticsCoverage']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/checkins.test.js tests/assessment.test.js`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement contract modules**

Implement the exported functions exactly. Validation must require these fields:

- `schemaVersion === 1`
- string `assessmentDate`
- string `checkinPath`
- `overall.status` in `on_track`, `watch`, `concern`, `call_clinic`
- `overall.confidence` in `low`, `medium`, `high`
- all four guidance groups present
- each guidance group has `status`, `title`, `details`, and `reviewAfter`
- `safety.callClinic` boolean
- `safety.urgency` in `routine`, `monitor`, `call_clinic`, `urgent`
- `nextActions` array

`buildSummaryMarkdown()` must use ASCII punctuation and include day, date, stage, symptoms, adherence, note, and photo filenames.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for all current tests.

- [ ] **Step 5: Commit**

```bash
git add js/checkins.js js/assessment.js tests/checkins.test.js tests/assessment.test.js
git commit -m "Add check-in and assessment contracts"
```

---

### Task 5: GitHub Contents API Client

**Files:**
- Create: `js/github.js`
- Test: `tests/github.test.js`

**Interfaces:**
- Produces: `encodeBase64(content)`, `createGitHubClient(settings, fetchImpl)`.
- Client methods: `testConnection()`, `putFile(path, content, message)`, `getJson(path)`, `listDirectory(path)`, `uploadCheckin({ path, files, manifest, summary, complete })`, `findAssessmentFiles()`.
- Consumes: `settings.githubOwner`, `settings.dataRepo`, `settings.token`.
- Consumed by: Log upload workflow, Settings connection test, Settings sync latest assessment.

- [ ] **Step 1: Write failing GitHub client tests**

Create `tests/github.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, encodeBase64 } from '../js/github.js';

const settings = {
  githubOwner: 'jcpeters08',
  dataRepo: 'halo-post-care-data',
  token: 'token'
};

describe('GitHub client', () => {
  it('encodes unicode content as base64', () => {
    assert.equal(Buffer.from(encodeBase64('hello'), 'base64').toString('utf8'), 'hello');
    assert.equal(Buffer.from(encodeBase64('redness 4'), 'base64').toString('utf8'), 'redness 4');
  });

  it('tests repo connection with authorization header', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ full_name: 'jcpeters08/halo-post-care-data' }) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    const result = await client.testConnection();
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  });

  it('puts file content through the Contents API', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ content: { path: 'checkins/x/summary.md' } }) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    await client.putFile('checkins/x/summary.md', '# Summary', 'Add summary');
    assert.equal(calls[0].url, 'https://api.github.com/repos/jcpeters08/halo-post-care-data/contents/checkins%2Fx%2Fsummary.md');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.message, 'Add summary');
    assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '# Summary');
  });

  it('writes complete marker last during uploadCheckin', async () => {
    const paths = [];
    const fetchImpl = async (url, options) => {
      paths.push(decodeURIComponent(url.split('/contents/')[1]));
      return { ok: true, json: async () => ({}) };
    };
    const client = createGitHubClient(settings, fetchImpl);
    await client.uploadCheckin({
      path: 'checkins/2026-06-27/2030',
      files: { 'face.jpg': 'base64-photo' },
      manifest: { checkinPath: 'checkins/2026-06-27/2030' },
      summary: '# Summary',
      complete: { checkinPath: 'checkins/2026-06-27/2030', completedAt: '2026-06-27T20:31:00-05:00' }
    });
    assert.equal(paths.at(-1), 'checkins/2026-06-27/2030/complete.json');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/github.test.js`

Expected: FAIL with module-not-found for `../js/github.js`.

- [ ] **Step 3: Implement GitHub client**

Implementation requirements:

- Throw `GitHubSettingsError` when owner, repo, or token is missing.
- Use headers `Accept: application/vnd.github+json`, `Authorization: Bearer ${token}`, and `X-GitHub-Api-Version: 2022-11-28`.
- Use `PUT /repos/{owner}/{repo}/contents/{encodedPath}` for writes.
- For JSON reads, use `GET /repos/{owner}/{repo}/contents/{encodedPath}`, base64-decode `content`, then parse JSON.
- For directory listing, use `GET /repos/{owner}/{repo}/contents/{encodedPath}` and require an array response.
- Convert non-OK responses into errors containing status and GitHub message text when present.
- In `uploadCheckin`, write summary, manifest, photo files, then `complete.json` last.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for all current tests.

- [ ] **Step 5: Commit**

```bash
git add js/github.js tests/github.test.js
git commit -m "Add GitHub data repo client"
```

---

### Task 6: Photo Draft Storage And Compression

**Files:**
- Create: `js/photos.js`
- Test: `tests/photos.test.js`

**Interfaces:**
- Produces: `PHOTO_AREAS`, `buildPhotoDraftId(date, area)`, `draftsByArea(drafts)`, `hasAllPhotoDrafts(drafts)`, `openPhotoDb()`, `savePhotoDraft(draft)`, `getPhotoDrafts(date)`, `deletePhotoDraft(id)`, `compressImageFile(file, options)`.
- Consumed by: Log UI and check-in upload workflow.

- [ ] **Step 1: Write failing photo helper tests**

Create `tests/photos.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhotoDraftId, draftsByArea, hasAllPhotoDrafts, PHOTO_AREAS } from '../js/photos.js';

describe('photo draft helpers', () => {
  it('declares the required photo areas', () => {
    assert.deepEqual(PHOTO_AREAS, ['face', 'neck', 'hands']);
  });

  it('builds stable draft IDs', () => {
    assert.equal(buildPhotoDraftId('2026-06-27', 'face'), '2026-06-27:face');
  });

  it('maps drafts by area and detects completeness', () => {
    const drafts = [
      { id: '2026-06-27:face', area: 'face' },
      { id: '2026-06-27:neck', area: 'neck' },
      { id: '2026-06-27:hands', area: 'hands' }
    ];
    assert.equal(draftsByArea(drafts).hands.id, '2026-06-27:hands');
    assert.equal(hasAllPhotoDrafts(drafts), true);
    assert.equal(hasAllPhotoDrafts(drafts.slice(0, 2)), false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/photos.test.js`

Expected: FAIL with module-not-found for `../js/photos.js`.

- [ ] **Step 3: Implement photo helpers and browser storage**

Implementation requirements:

- IndexedDB database name: `halo-post-care-db`.
- Object store name: `photoDrafts`.
- Draft shape: `{ id, date, area, blob, filename, size, updatedAt }`.
- `compressImageFile(file, { maxEdge = 1280, quality = 0.7 } = {})` draws the image into a canvas, scales the longest edge to `maxEdge`, returns a JPEG `Blob`, and strips EXIF by using canvas output.
- Reject compression with `new Error('Photo compression failed')` if image decoding or canvas conversion fails.
- Browser-only functions must throw `new Error('IndexedDB is not available')` when `indexedDB` is missing.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for all current tests.

- [ ] **Step 5: Commit**

```bash
git add js/photos.js tests/photos.test.js
git commit -m "Add photo draft storage helpers"
```

---

### Task 7: Today And Guide UI

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Create: `js/ui/components.js`
- Create: `js/ui/today.js`
- Create: `js/ui/guide.js`

**Interfaces:**
- Consumes: `loadSettings`, `buildDailyTargets`, `computeRecoveryDay`, `getStageForDay`, `getTimelineForDay`, checklist functions, `getDefaultGuidance`.
- Produces: render functions `renderToday(root, context)` and `renderGuide(root, context)`.
- Produces: UI events with `data-action` values `toggle-step`, `counter-dec`, `counter-inc`, `set-flag`, and `route`.

- [ ] **Step 1: Add a render smoke check to existing tests**

Extend `tests/smoke.test.js` with this assertion:

```js
it('defines the four primary routes in the app shell', async () => {
  const html = await readFile('index.html', 'utf8');
  for (const route of ['today', 'log', 'guide', 'settings']) {
    assert.match(html, new RegExp(`data-route="${route}"`));
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS before UI changes, proving the route shell remains intact.

- [ ] **Step 3: Implement Today and Guide renderers**

Implementation requirements:

- `Today` shows recovery day, stage label, timeline summary, AM checklist, PM checklist, counters, flags, safety call link, grouped Codex guidance, and provenance.
- If no valid assessment is applied, use default grouped guidance from `getDefaultGuidance()`.
- `Guide` shows timeline sections, treated areas, standing rules, reintroduction ladder, and clinic-call triggers.
- Buttons and checklist rows must be at least 44px tall.
- Do not show onboarding or marketing copy as the first screen.
- Keep all text inside parent containers at mobile width.

Use `js/ui/components.js` for:

```js
export function escapeHtml(value) {}
export function statusClass(status) {}
export function renderGuidanceCards(guidance, provenance) {}
export function renderSafetyPanel() {}
```

- [ ] **Step 4: Run automated tests and manual browser check**

Run: `npm test`

Expected: PASS.

Run: `npm run serve`

Open: `http://localhost:4173`

Manual expected result at mobile width:

- Today is the first screen.
- Bottom nav switches between Today and Guide.
- Checklist rows are tappable.
- Counter controls do not shift layout.
- Clinic call link is visible without opening Settings.

- [ ] **Step 5: Commit**

```bash
git add index.html css/styles.css js/app.js js/ui/components.js js/ui/today.js js/ui/guide.js tests/smoke.test.js
git commit -m "Build Today and Guide views"
```

---

### Task 8: Log UI, Check-In Preparation, And Upload

**Files:**
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Create: `js/ui/log.js`

**Interfaces:**
- Consumes: photo APIs, checklist state, storage state, check-in contract functions, GitHub client.
- Produces: required photo slot UI and `prepare-checkin` action.
- Produces: local sync state values `draft`, `ready`, `uploading`, `uploaded`, `upload_failed`.

- [ ] **Step 1: Add upload contract coverage**

Extend `tests/checkins.test.js` with:

```js
it('includes required photo filenames in the summary', () => {
  const manifest = buildManifest({
    checkinPath: 'checkins/2026-06-27/2030',
    createdAt: '2026-06-27T20:30:00-05:00',
    procedureDate: '2026-06-26',
    recoveryDay: 1,
    stageAuto: 'red_warm_tight',
    symptoms: { redness: 4, swelling: 3, flaking: 1, itch: 2, tightness: 4 },
    adherence: { am: { completed: 5, total: 5 }, pm: { completed: 4, total: 5 }, counters: {} },
    note: ''
  });
  const markdown = buildSummaryMarkdown(manifest);
  assert.match(markdown, /face\.jpg/);
  assert.match(markdown, /neck\.jpg/);
  assert.match(markdown, /hands\.jpg/);
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS after existing implementation already supports the filenames.

- [ ] **Step 3: Implement Log view and upload workflow**

Implementation requirements:

- Show three fixed slots: Face, Neck, Hands.
- Each slot uses `<input type="file" accept="image/*" capture="environment">`.
- Saving a selected file compresses it, stores it in IndexedDB, and shows a local object URL preview.
- Symptoms are 1-5 controls for redness, swelling, flaking, itch, and tightness.
- Note is a textarea.
- `Prepare check-in` is disabled until all three photo areas exist.
- The upload workflow builds path `checkins/YYYY-MM-DD/HHMM`, `manifest.json`, `summary.md`, three JPG files, and `complete.json`.
- Convert photo blobs to base64 before passing them to `uploadCheckin`.
- If upload fails before `complete.json`, show `upload_failed` and keep the local draft.
- After success, show `uploaded` and store the check-in path in localStorage for sync status.

- [ ] **Step 4: Run automated tests and manual browser check**

Run: `npm test`

Expected: PASS.

Run: `npm run serve`

Open: `http://localhost:4173/#log`

Manual expected result:

- Prepare button is disabled before all required photos exist.
- Selecting test images creates previews for all three areas.
- Symptom controls update visibly.
- With missing token, Prepare check-in shows a specific token/settings error and does not clear drafts.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css js/app.js js/ui/log.js tests/checkins.test.js
git commit -m "Build required photo check-in flow"
```

---

### Task 9: Settings, Connection Test, Assessment Sync, And Auto-Apply

**Files:**
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Create: `js/ui/settings.js`
- Modify: `js/storage.js`
- Modify: `js/assessment.js`

**Interfaces:**
- Consumes: GitHub client, assessment validation, storage helpers.
- Produces: Settings form actions `save-settings`, `test-connection`, `sync-assessment`, `export-data`, `reset-data`.
- Produces: localStorage key `halo_applied_assessment_v1`.

- [ ] **Step 1: Add assessment storage and validation tests**

Extend `tests/storage.test.js` with:

```js
it('stores exported applied assessment state with app-owned keys', () => {
  const storage = fakeStorage();
  storage.setItem('halo_applied_assessment_v1', JSON.stringify({ checkinPath: 'checkins/x', assessmentDate: '2026-06-27' }));
  assert.equal(exportAll(storage).halo_applied_assessment_v1.checkinPath, 'checkins/x');
});
```

Extend `tests/assessment.test.js` with:

```js
it('rejects invalid safety urgency values', () => {
  const invalid = structuredClone(validAssessment);
  invalid.safety.urgency = 'soon';
  assert.equal(validateAssessment(invalid).valid, false);
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS after storage export already includes all `halo_` keys and assessment validation rejects unknown urgency values.

- [ ] **Step 3: Implement Settings view and assessment sync**

Implementation requirements:

- Settings fields: procedure date, acyclovir doses per day, GitHub owner, data repo, token.
- Default owner is `jcpeters08`; default data repo is `halo-post-care-data`.
- Token input uses `type="password"` and does not echo token elsewhere in UI.
- Test connection calls `client.testConnection()` and reports success or exact failure message.
- Sync latest assessment lists complete check-in folders from GitHub, reads available `assessment.json` files, validates them, selects newest valid assessment, stores it under `halo_applied_assessment_v1`, and refreshes Today guidance.
- Export downloads a JSON file containing app-owned localStorage data and assessment state.
- Reset asks for one confirmation click, then clears app-owned localStorage keys and local draft photos.

- [ ] **Step 4: Run automated tests and manual browser check**

Run: `npm test`

Expected: PASS.

Run: `npm run serve`

Open: `http://localhost:4173/#settings`

Manual expected result:

- Settings persist after refresh.
- Token is masked.
- Test connection reports a missing-token error when token is blank.
- Export downloads JSON.
- Sync without token shows the same specific settings error.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css js/app.js js/ui/settings.js js/storage.js js/assessment.js tests/storage.test.js tests/assessment.test.js
git commit -m "Add settings and Codex assessment sync"
```

---

### Task 10: PWA Offline Behavior, README, And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `sw.js`
- Modify: `manifest.webmanifest`
- Modify: `css/styles.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: all implemented app files.
- Produces: final setup and daily workflow docs.
- Produces: verified offline shell with cached local assets.

- [ ] **Step 1: Extend smoke test for service worker cache coverage**

Extend `tests/smoke.test.js` with:

```js
it('pre-caches the core app shell in the service worker', async () => {
  const sw = await readFile('sw.js', 'utf8');
  for (const path of ['index.html', 'css/styles.css', 'js/app.js', 'manifest.webmanifest']) {
    assert.match(sw, new RegExp(path.replace('.', '\\.')));
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS if `sw.js` already precaches the core shell, FAIL if any core path is missing.

- [ ] **Step 3: Finish README and PWA polish**

`README.md` must include:

- Public app repo purpose.
- Private `halo-post-care-data` repo purpose.
- GitHub Pages deployment steps.
- Fine-grained PAT creation steps with repo scope and Contents read/write permission.
- Daily flow: phone check-in, tell Codex there is a new check-in, Codex writes `assessment.json` and `assessment.md`, app syncs.
- Warning that public repo must not receive photos or check-in data.
- Token revocation steps.
- Local development commands: `npm test` and `npm run serve`.

PWA polish requirements:

- `manifest.webmanifest` references `icons/app-icon.svg`.
- `sw.js` precaches local shell files and returns cached responses for same-origin requests.
- `index.html` keeps the CSP from Task 1.
- `css/styles.css` includes `@media (min-width: 760px)` only to keep the mobile layout readable on desktop, not to create a desktop dashboard.

- [ ] **Step 4: Run final automated and manual checks**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run serve`

Manual expected result:

- Today, Log, Guide, and Settings render.
- Mobile viewport has no overlapping text.
- Required photo slots remain fixed in size.
- Offline reload after first visit renders the shell.
- No network requests occur except to `api.github.com` when GitHub actions are used.

- [ ] **Step 5: Commit**

```bash
git add README.md sw.js manifest.webmanifest css/styles.css index.html tests/smoke.test.js
git commit -m "Document setup and verify PWA behavior"
```

---

## Final Review Gate

After Task 10:

- Run `git status --short --branch`; expected branch is clean and ahead of origin by implementation commits.
- Run `npm test`; expected all tests pass.
- Start the local server with `npm run serve`; verify the app at `http://localhost:4173`.
- Inspect the public repo with `git grep -n "assessment.json\\|face.jpg\\|neck.jpg\\|hands.jpg\\|halo-post-care-data"` and confirm no personal data is present. References to contract filenames and data repo name are allowed.
- Report the final local URL and any manual checks that could not be performed.
