import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { getDefaultGuidance } from '../js/assessment.js';
import { buildDailyTargets, getStageForDay, getTimelineForDay } from '../js/day.js';

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
    assert.match(todayRoot.innerHTML, /data-action="counter-inc"/);
    assert.match(todayRoot.innerHTML, /data-action="set-flag"/);
    assert.match(todayRoot.innerHTML, /Call clinic/);
    assert.match(todayRoot.innerHTML, /Default guidance/);

    assert.match(guideRoot.innerHTML, /Day-by-day guide/);
    assert.match(guideRoot.innerHTML, /Reintroduction ladder/);
    assert.match(guideRoot.innerHTML, /Call clinic if/);
  });
});
