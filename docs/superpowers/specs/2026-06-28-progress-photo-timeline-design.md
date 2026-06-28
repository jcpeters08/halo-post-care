# Progress Photo Timeline Design

Date: 2026-06-28
Status: Approved for implementation planning

## Purpose

Add a dedicated `Progress` tab to Halo Post-Care so Jonathan can compare recovery photos side by side over time. The view should make visual progression easy to scan on iPhone without mixing photo comparison into the written Codex assessment history.

This feature is for private recovery review only. It must never copy personal photos into the public app repo, docs, screenshots, or committed fixtures.

## Approved Direction

Use the `Area timeline` layout selected during visual review.

- The bottom navigation gains a `Progress` tab.
- `Assess` remains the place for written Codex photo assessments.
- `Progress` is visual-first and organized by treated area.
- The primary control is a segmented selector: `Face`, `Neck`, `Hands`.
- The selected area shows a horizontal timeline of same-area photos across completed check-ins.
- The screen also shows a compact `Latest vs baseline` comparison for the selected area.

## User Goals

- See whether redness, swelling, bronzing, peeling, and texture are trending better or worse.
- Compare the same body area across days without mentally matching it inside separate check-ins.
- Keep enough date/context visible to know which recovery day each photo represents.
- Use the view comfortably on iPhone.

## Data Source

Photos already live in the private `halo-post-care-data` repo under completed check-in folders:

```text
checkins/YYYY-MM-DD/HHMM/
  manifest.json
  face.jpg
  neck.jpg
  hands.jpg
  complete.json
  assessment.json
  assessment.md
```

The app should use the existing GitHub token and Contents API client to:

1. List completed check-in folders.
2. Ignore folders without `complete.json`.
3. Load `manifest.json` for date, recovery day, stage, and photo filename metadata.
4. Load `face.jpg`, `neck.jpg`, and `hands.jpg` as base64 file content only when needed for display.

No new backend, build step, runtime dependency, or private-data repo schema migration is required.

## Data Shape

The app can normalize completed photo entries into an internal structure like:

```js
{
  checkinPath: 'checkins/2026-06-28/0840',
  date: '2026-06-28',
  time: '0840',
  recoveryDay: 2,
  stageAuto: 'mends_bronzing',
  photos: {
    face: { src: 'data:image/jpeg;base64,...', fileName: 'face.jpg' },
    neck: { src: 'data:image/jpeg;base64,...', fileName: 'neck.jpg' },
    hands: { src: 'data:image/jpeg;base64,...', fileName: 'hands.jpg' }
  }
}
```

Entries should sort newest first in the timeline. Baseline is the oldest available entry for the selected area. Latest is the newest available entry for that area.

## UI

### Route And Navigation

- Add route id: `progress`.
- Add bottom-nav label: `Progress`.
- Screen title: `Progress`.
- Keep touch targets consistent with the existing tab bar.

Six tabs are acceptable for this personal mobile app because `Progress` has a distinct job from `Assess`.

### Progress Screen

When data is loaded, render:

1. Hero panel:
   - label: `Photo progress`
   - title: `Compare recovery over time`
   - summary of how many completed check-ins are available.
2. Area selector:
   - three segmented buttons: `Face`, `Neck`, `Hands`
   - selected area stored in lightweight app UI state, default `face`
3. Timeline:
   - horizontal card strip, newest first
   - each card shows the selected-area photo
   - card metadata includes recovery day, date, and check-in time
4. Latest vs baseline:
   - two cards side by side where space allows, stacked on narrow screens if needed
   - latest photo on the left, baseline photo on the right
   - use clear labels: `Latest` and `Baseline`

### Visual Style

Follow the existing quiet, clinical recovery-console style.

- Use current panel, card, status-pill, and photo-slot design language.
- Keep photos large enough to inspect; avoid tiny thumbnails as the primary comparison surface.
- Use horizontal scrolling for the area timeline rather than dense grids.
- Do not add decorative imagery, charts, or marketing copy.
- Images should use stable aspect ratios and `object-fit: cover` so cards do not jump as photos load.

## Loading And Empty States

The `Progress` tab needs explicit states:

- Missing GitHub settings or token: show a panel directing the user to Settings.
- Loading: show a neutral loading panel.
- No completed check-ins: show a panel explaining that progress appears after uploaded check-ins exist.
- Completed check-ins but missing photos for the selected area: show the timeline with placeholders for missing photos and keep the rest usable.
- GitHub/API error: show a non-alarming warning panel with the error message and a `Retry` button.

## Privacy And Security

- Do not write photo data to the public app repo.
- Do not add photo fixtures to tests.
- Do not include real photos in docs, screenshots, or Obsidian notes.
- Photo data may be held in memory for rendering and may be cached in browser app state only if later explicitly designed. The v1 implementation should prefer session/runtime state over persistent local photo caching.
- The only network target remains `https://api.github.com`.

## Implementation Notes

The current app already has:

- route-based rendering in `js/app.js`;
- GitHub Contents API access in `js/github.js`;
- photo area constants in `js/photos.js`;
- reusable HTML escaping and panel/card styles in `js/ui/components.js`;
- assessment history rendering in `js/ui/assessments.js`.

The likely implementation shape is:

- extend `js/github.js` with helpers to list completed check-in folders and read raw/base64 photo file content;
- add a small progress data normalizer module or app-level helper;
- add `js/ui/progress.js` for rendering the Progress tab;
- add route/nav/service-worker entries;
- add tests for route presence, GitHub photo loading, progress normalization, empty states, and rendered area timeline.

## Testing Requirements

Automated tests should cover:

- `index.html` exposes the `progress` route.
- service worker precaches the new UI module.
- GitHub client can load base64 file content from a photo path without JSON parsing.
- completed check-in folder discovery ignores incomplete folders.
- progress entries sort newest first.
- `renderProgress` renders the area selector, selected-area timeline, and latest-vs-baseline comparison.
- empty and error states render useful copy.

Manual verification should cover:

- mobile viewport shows `Progress` in the bottom nav without text overlap;
- `Face`, `Neck`, and `Hands` selector changes the visible timeline;
- horizontal timeline scrolls comfortably on iPhone-sized viewport;
- published app refreshes after service worker cache bump.

## Out Of Scope For V1

- Drawing annotations on photos.
- Pinch/zoom photo viewer.
- Persistent local cache of all historical photo images.
- AI-generated visual difference scoring.
- Editing, deleting, or re-uploading historical check-in photos.
- Changing the `assessment.json` schema.
