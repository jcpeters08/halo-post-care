# Halo Post-Care Agent Guide

This file is the operational briefing for Claude/Codex agents working in this repo.

## Current State

- Public app repo: `jcpeters08/halo-post-care`
- Private data repo: `jcpeters08/halo-post-care-data`
- Published app: `https://jcpeters08.github.io/halo-post-care/`
- Local app repo: `/Users/jonathanpeters/Git/halo-post-care`
- Local data repo: `/Users/jonathanpeters/Git/halo-post-care-data`
- App stack: static HTML, CSS, and vanilla ES modules. No build step.
- Runtime dependencies: none.
- Test command: `npm test`
- Local server: `npm run serve` -> `http://localhost:4173`
- Latest app update on 2026-06-27: visible Codex photo assessments are now in the app. Today shows the latest assessment, and the `Assess` tab shows assessment history newest-first.
- Routine content fix on 2026-06-27: AM core sequence now leads with HOCl spray (was Thermal water; thermal water is as-needed comfort, not a fixed step), and SPF is AM-only (removed from the PM/evening routine, which is now 4 steps). Matches the provider schedule's core daily sequence. Service worker cache bumped to `halo-post-care-v4`.

The app is working and published. The private data repo exists, is private, and has a `checkins/` folder. The in-app GitHub token connection test has passed.

## Hard Boundaries

- Never commit photos, symptom logs, completed check-ins, Codex assessments, or GitHub tokens to this public app repo.
- Personal recovery data belongs only in `halo-post-care-data`.
- The app's only allowed network target is `https://api.github.com`.
- The persistent GitHub token is stored only in the user's browser `localStorage`; it must not be printed, copied into files, or committed.
- Provider and clinic instructions are safety guardrails. Codex may adjust practical guidance, but must stay within those guardrails.

## Repos And Responsibilities

### `halo-post-care`

Public static PWA code, docs, tests, service worker, and contracts.

Important files:

- `index.html`: static shell, CSP, app root, nav.
- `css/styles.css`: mobile-first UI.
- `js/app.js`: boot, routing, global event handlers, state orchestration.
- `js/data.js`: recovery schedule, safety triggers, clinic numbers, guidance groups.
- `js/day.js`: recovery day/stage/date math.
- `js/checklist.js`: routine/counter/flag state.
- `js/checkins.js`: check-in manifest, summary, and path contracts.
- `js/assessment.js`: assessment schema validation and latest valid selection.
- `js/github.js`: GitHub Contents API client.
- `js/photos.js`: IndexedDB photo drafts and compression.
- `js/ui/components.js`: shared UI helpers, guidance cards, safety panel, and reusable assessment detail renderer.
- `js/ui/today.js`: Today renderer, including latest photo assessment card.
- `js/ui/assessments.js`: historical assessment screen, newest-first.
- `js/ui/log.js`: check-in/photo upload renderer.
- `js/ui/guide.js`: recovery reference renderer.
- `js/ui/settings.js`: settings, GitHub connection, assessment sync, export/reset renderer.
- `sw.js`: service worker app-shell/offline cache.
- `manifest.webmanifest`: PWA metadata.
- `README.md`: user-facing setup/deployment workflow.
- `docs/superpowers/specs/2026-06-27-halo-post-care-closed-loop-design.md`: canonical product/design spec.
- `docs/superpowers/plans/2026-06-27-halo-post-care-implementation.md`: implementation plan and task history.

### `halo-post-care-data`

Private repo for daily recovery data and Codex assessments.

Expected structure:

```text
checkins/
  YYYY-MM-DD/
    HHMM/
      summary.md
      manifest.json
      face.jpg
      neck.jpg
      hands.jpg
      complete.json
      assessment.json
      assessment.md
```

The app writes `complete.json` last. A folder without `complete.json` is incomplete and must not be assessed or synced.

## Daily User Workflow

1. User opens the published PWA on iPhone.
2. User completes the `Log` check-in with face, neck, and hands photos.
3. User taps prepare/upload check-in.
4. App writes check-in files to the private data repo and writes `complete.json` last.
5. User tells Claude/Codex there is a new check-in.
6. Claude/Codex reviews the latest completed folder in `/Users/jonathanpeters/Git/halo-post-care-data`.
7. Claude/Codex writes `assessment.json` and `assessment.md` into that same folder.
8. Claude/Codex commits and pushes the private data repo.
9. The app syncs all valid Codex assessments, applies the newest valid one to Today guidance, shows the latest photo read on Today, and shows historical reads in the `Assess` tab. Settings has a manual `Sync Codex assessments` refresh.

## Claude/Codex Assessment Workflow

When the user says there is a new Halo check-in:

1. Work in the private data repo:

   ```bash
   cd /Users/jonathanpeters/Git/halo-post-care-data
   git pull
   find checkins -name complete.json | sort
   ```

2. Identify the newest folder with `complete.json` and no assessment yet, or the folder the user names.
3. Read `manifest.json` and `summary.md`.
4. Inspect `face.jpg`, `neck.jpg`, and `hands.jpg` visually.
5. Write both:
   - `assessment.json`
   - `assessment.md`
6. Validate that `assessment.json.checkinPath` exactly matches the folder path.
7. Commit and push the private data repo.

Do not edit the public app repo while doing a routine assessment unless the user explicitly asks for an app change.

## Assessment JSON Contract

The app applies only valid `assessment.json` files whose internal `checkinPath` matches the containing folder.

Required top-level fields:

- `schemaVersion`: `1`
- `assessmentDate`: ISO date string
- `checkinPath`: e.g. `checkins/YYYY-MM-DD/HHMM`
- `overall`: object
- `guidance`: object with every required guidance group
- `safety`: object
- `nextActions`: array

Allowed values:

- `overall.status`: `on_track`, `watch`, `concern`, `call_clinic`
- `overall.confidence`: `low`, `medium`, `high`
- `observations[].area`: `face`, `neck`, `hands`, `overall`
- `observations[].severity`: `expected`, `watch`, `concern`
- `guidance.*.status`: `wait`, `limited`, `ready`, `avoid`, `ask_provider`
- `safety.urgency`: `routine`, `monitor`, `call_clinic`, `urgent`

Required guidance groups:

- `exercise`
- `heatColdExposure`
- `actives`
- `cosmeticsCoverage`

If `safety.callClinic` is `true`, or urgency is `call_clinic`/`urgent`, the Today screen shows a prominent Codex safety alert ahead of ordinary guidance.

The app now surfaces the assessment itself, not only derived guidance:

- Today renders the newest assessment as a `Photo assessment` card with overall status, safety urgency, confidence, check-in path, observations, and next actions.
- `Assess` renders cached valid assessments newest-first for historical review.
- Settings sync stores all valid assessments in `halo_applied_assessment_v1.assessments`; `loadAppliedAssessment` still selects the newest valid assessment for guidance.

## Safety And Guidance Model

Baseline instructions come from the provider schedule encoded in the app. Codex assessments can adjust practical guidance for:

- lifting, gym, and return-to-training progression;
- sauna, hot yoga, cold plunge, and heat/cold exposure;
- vitamin C, tretinoin, acids/BHA, azelaic acid, and other actives;
- makeup, tinted SPF, and coverage products.

Codex should be conservative. If photos/symptoms suggest worsening warmth, spreading redness, fever, pus/drainage, blistering, oozing, severe/asymmetric eye swelling, burn-like demarcation, or any unusual escalation, set safety to call clinic and explain why in `assessment.md`.

Fixed clinic numbers in the app:

- EDINA Skin Artisans: `952-767-3163`
- On-call physician: `952-925-1165`

## Development Workflow

Before claiming app changes are complete:

```bash
npm test
```

The test suite covers:

- recovery day/date math;
- checklist and counters;
- check-in contracts;
- assessment validation and path applicability;
- GitHub Contents API construction and retry update semantics;
- IndexedDB photo draft behavior and persistent storage request;
- rendered Today/Guide/Log/Settings smoke checks;
- rendered `Assess` history and latest Today photo assessment smoke checks;
- service worker cache coverage.

If changing PWA/offline behavior, also manually check the published or local app in mobile viewport.

## Publishing

The public app is published with GitHub Pages:

- Source: `main` branch
- Path: `/`
- HTTPS enforced
- URL: `https://jcpeters08.github.io/halo-post-care/`

After committing app changes:

```bash
git push origin main
```

Then confirm:

```bash
gh api repos/jcpeters08/halo-post-care/pages --jq '{status, html_url, https_enforced, source}'
curl -I https://jcpeters08.github.io/halo-post-care/
```

## Known Gotchas

- GitHub Contents API updates require a file `sha`. The upload flow intentionally fetches existing SHAs for payload files so partial upload retries can overwrite `summary.md`, `manifest.json`, photos, or `complete.json`.
- `daily-claim.json` stays create-only so same-day duplicate claims are not accidentally overwritten.
- The app repo ignores `.superpowers/`; those are local SDD scratch files and must not be tracked.
- If the Pages URL appears stale right after a push, wait for Pages status to become `built` and retry with a cache-busting query string.
- If the iPhone PWA still shows the old nav after a pushed app update, close/reopen or reload once so the bumped service worker cache can activate.
