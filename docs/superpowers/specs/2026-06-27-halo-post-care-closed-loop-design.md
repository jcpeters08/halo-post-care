# Halo Post-Care Closed-Loop Design

Date: 2026-06-27
Status: Approved for implementation planning

## Purpose

Build a mobile-first static PWA for tracking recovery after the user's Halo + BBL procedure with BENE V exosomes. The app is primarily for the first three months of recovery. It should make the morning and evening routine easy to follow, capture a daily photo and symptom check-in, send that check-in to a private GitHub data repo, and then apply Codex-authored recovery assessments back into the app.

The app is not a general skincare platform. It is a personal recovery console for one procedure, one user, and one defined care plan.

## Decisions

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

## Product Shape

The first screen is the app itself, not a landing page. The primary view is `Today`, optimized for iPhone Safari and home-screen PWA use.

The main tabs are:

- `Today`: recovery day, current stage, daily routine checklist, counters, clinic-call affordance, and latest applied Codex guidance.
- `Log`: required face, neck, and hands photo capture, symptom ratings, free-text note, and prepare-check-in flow.
- `Guide`: day-by-day schedule, treated-area notes, standing rules, reintroduction ladder, and clinic-call triggers.
- `Settings`: procedure date, acyclovir frequency, GitHub owner/repo/token, test connection, sync latest assessment, export, and reset.

Desktop should remain readable, but v1 design effort targets mobile only.

## UI Direction

The app should feel quiet, practical, and recovery-focused. It should work well when the user is tired, swollen, or checking it quickly at 7am.

- Use a calm neutral background, high-contrast text, and restrained color accents.
- Keep warning actions visually distinct and always easy to reach.
- Use large touch targets for checklist rows.
- Use steppers for counters.
- Use sliders or segmented 1-5 controls for symptom ratings.
- Use three fixed photo slots: Face, Neck, Hands.
- Use grouped guidance cards for Exercise, Heat/Cold, Actives, and Cosmetics/Coverage.
- Avoid charts, decorative dashboards, and marketing copy.

## App Guidance Model

The baseline schedule comes from the existing `DESIGN.md` recovery plan. The app derives recovery day and default stage from the configured procedure date.

Codex assessments can adjust the practical guidance shown in the app. The assessment should not be hidden or silently blended into the baseline. The UI must show provenance, such as "Applied from Codex assessment for Day 4."

The grouped guidance domains are:

- `exercise`: walking, gym, lifting intensity, and return-to-training progression.
- `heatColdExposure`: sauna, hot yoga, cold plunge, and other strong temperature stressors.
- `actives`: azelaic acid, vitamin C, tretinoin, acids/BHA, and related reintroduction.
- `cosmeticsCoverage`: makeup, tinted SPF, coverage products, and similar cosmetic reintroduction.

Hard safety triggers override normal guidance. If symptoms or Codex assessment indicate pus/drainage, increasing warmth or spreading redness, fever, extreme itching, blistering, oozing, sharply demarcated burn-like areas, or severe/asymmetric eye swelling, the app surfaces the clinic-call action prominently.

The clinic numbers are fixed in the app:

- EDINA Skin Artisans: 952-767-3163
- On-call physician: 952-925-1165

## Data Repos

The public repo contains only app code and documentation. It must not receive personal photos, symptom logs, or check-in content.

The private data repo stores check-ins and Codex assessments. The app writes to this repo using the configured GitHub token. Codex reviews this repo from the Mac, writes assessments, commits, and pushes them.

## Check-In Folder Contract

Although the user expects one check-in per day, folders include a time component to prevent collisions and allow retries.

Example path:

```text
checkins/2026-06-27/2030/
  summary.md
  manifest.json
  face.jpg
  neck.jpg
  hands.jpg
  complete.json
  assessment.json
  assessment.md
```

The app writes `complete.json` last. A folder without `complete.json` is incomplete and must not be treated as ready for assessment or sync.

Required app-created files:

- `summary.md`: human-readable day, stage, symptoms, checklist adherence, and note.
- `manifest.json`: machine-readable check-in metadata.
- `face.jpg`: compressed face photo.
- `neck.jpg`: compressed neck photo.
- `hands.jpg`: compressed hands photo.
- `complete.json`: completion marker written only after all required files upload.

Codex-created files:

- `assessment.json`: machine-readable assessment consumed by the app.
- `assessment.md`: human-readable detailed assessment.

## Check-In Manifest

`manifest.json` should contain enough data for Codex and the app to validate the folder without parsing Markdown.

```json
{
  "schemaVersion": 1,
  "checkinPath": "checkins/2026-06-27/2030",
  "createdAt": "2026-06-27T20:30:00-05:00",
  "procedureDate": "2026-06-26",
  "recoveryDay": 1,
  "stageAuto": "red_warm_tight",
  "photos": {
    "face": "face.jpg",
    "neck": "neck.jpg",
    "hands": "hands.jpg"
  },
  "symptoms": {
    "redness": 4,
    "swelling": 3,
    "flaking": 1,
    "itch": 2,
    "tightness": 4
  },
  "adherence": {
    "am": { "completed": 5, "total": 5 },
    "pm": { "completed": 4, "total": 5 },
    "counters": {
      "hocl": 2,
      "cicalfate": 3,
      "spf": 1,
      "acyclovir": 2,
      "heliocare": 1
    }
  },
  "note": "Hands feel tightest. Mild stinging after cleanse."
}
```

## Assessment JSON Contract

The app applies only valid `assessment.json` files with a matching `checkinPath`.

```json
{
  "schemaVersion": 1,
  "assessmentDate": "2026-06-27",
  "checkinPath": "checkins/2026-06-27/2030",
  "overall": {
    "status": "on_track",
    "summary": "Healing appears consistent with the current recovery window.",
    "confidence": "medium"
  },
  "observations": [
    {
      "area": "face",
      "severity": "expected",
      "note": "Diffuse redness and texture look consistent with current stage."
    }
  ],
  "guidance": {
    "exercise": {
      "status": "wait",
      "title": "Keep activity light",
      "details": "Walking is okay; avoid lifting until redness and heat remain calm.",
      "reviewAfter": "next_checkin"
    },
    "heatColdExposure": {
      "status": "wait",
      "title": "Avoid sauna and cold plunge",
      "details": "Heat and cold stress can aggravate redness while the barrier is reactive.",
      "reviewAfter": "next_checkin"
    },
    "actives": {
      "status": "wait",
      "title": "Do not restart actives yet",
      "details": "Continue bland barrier support until peeling is done and skin is calm.",
      "reviewAfter": "next_checkin"
    },
    "cosmeticsCoverage": {
      "status": "limited",
      "title": "Tinted mineral SPF only",
      "details": "Avoid makeup until peeling has fully completed.",
      "reviewAfter": "next_checkin"
    }
  },
  "safety": {
    "callClinic": false,
    "reasons": [],
    "urgency": "routine"
  },
  "nextActions": [
    "Continue AM/PM routine.",
    "Take all prescribed acyclovir doses.",
    "Submit another full-area check-in tomorrow."
  ]
}
```

Allowed values:

- `overall.status`: `on_track`, `watch`, `concern`, `call_clinic`
- `overall.confidence`: `low`, `medium`, `high`
- `observations[].area`: `face`, `neck`, `hands`, `overall`
- `observations[].severity`: `expected`, `watch`, `concern`
- `guidance.*.status`: `wait`, `limited`, `ready`, `avoid`, `ask_provider`
- `safety.urgency`: `routine`, `monitor`, `call_clinic`, `urgent`

The app should tolerate extra fields for future versions, but required fields must be present.

## Daily Data Flow

1. The user completes routine checklist items and counters during the day.
2. In `Log`, the app requires face, neck, and hands photos before check-in can be prepared.
3. The user enters symptom ratings and an optional note.
4. `Prepare check-in` compresses photos, writes `summary.md`, `manifest.json`, and photos to GitHub, then writes `complete.json` last.
5. On the Mac, the user tells Codex there is a new check-in.
6. Codex pulls or reads the private data repo, reviews the three photos plus metadata, writes `assessment.json` and `assessment.md`, then commits and pushes.
7. The app syncs latest assessments from GitHub and automatically applies the newest valid assessment.

## Error Handling

- If any required upload fails, the app does not write `complete.json`.
- If a folder lacks `complete.json`, the app ignores it for assessment sync.
- If `assessment.json` is invalid or its `checkinPath` does not match the folder, the app does not apply it.
- If assessment sync fails, the app keeps the previous applied guidance and shows sync status.
- If the GitHub token is missing, expired, or lacks access, Settings shows a specific fix path.
- If photo compression fails, the app blocks check-in creation and explains what to retry.
- If offline, checklist and photo logging still work locally; GitHub upload waits until online.

## Storage

Use localStorage for small JSON state:

- settings
- procedure date
- acyclovir frequency
- GitHub owner and repo
- GitHub token
- daily checklist and counters
- symptom entries
- last-applied assessment metadata

Use IndexedDB for photo blobs and local check-in draft state. Photos should be compressed before local storage and upload. Strip EXIF metadata by drawing to canvas and re-encoding JPEG. Target roughly 1280px on the longest edge and JPEG quality around 0.7 unless visual quality is insufficient.

Request persistent storage with `navigator.storage.persist()` when available.

## Security

The app accepts the risk of persistent localStorage token storage for this personal, short-lived app. Mitigations:

- Use a fine-grained GitHub PAT scoped only to `halo-post-care-data`.
- Use Contents read/write permission only.
- Set a token expiration aligned to the recovery window.
- Use no third-party scripts, fonts, analytics, CDNs, or image hosts.
- Add a strict Content Security Policy.
- Limit network calls to GitHub API endpoints.
- Provide revocation instructions in Settings and README.
- Keep all personal data out of the public app repo.

Recommended CSP intent:

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' blob: data:;
connect-src https://api.github.com;
object-src 'none';
base-uri 'self';
form-action 'none'
```

## Implementation Scope

In scope:

- Static PWA shell with app manifest and service worker.
- Mobile-first Today, Log, Guide, and Settings tabs.
- Recovery day and baseline stage derivation.
- Checklist, counters, symptoms, and local persistence.
- Required face, neck, and hands photo capture.
- Photo compression and IndexedDB storage.
- GitHub Contents API client for check-in upload.
- GitHub assessment sync and schema validation.
- Automatic application of latest valid Codex guidance.
- Export/reset settings.
- README instructions for deployment, token creation, data repo setup, and Codex assessment workflow.

Out of scope for v1:

- Push notifications.
- Charts and analytics.
- Multi-user accounts or auth.
- Cloudflare Worker or backend.
- Desktop dashboard.
- Automatic diagnosis language.
- Uploading personal data to the public app repo.

## Verification Plan

Automated tests should cover:

- Recovery-day and stage math.
- Check-in path and manifest building.
- Assessment schema validation.
- Storage helper round-trips.
- GitHub request construction with mocked fetch.

Manual verification should cover:

- Mobile viewport Today, Log, Guide, and Settings usability.
- Required three-photo check-in validation.
- Photo compression output size and visible quality.
- Offline app shell launch.
- Offline local logging.
- Settings test connection against GitHub.
- End-to-end dry run with non-sensitive test photos.
- Assessment sync using a sample `assessment.json`.

## Open Implementation Notes

- The app should prefer simple, explicit modules over framework-style abstraction.
- The UI should show sync state clearly: draft, uploaded, waiting for Codex assessment, applied, or sync failed.
- The README should describe the daily loop in concrete terms so Codex can reliably find the newest complete check-in and write assessments back to the correct folder.
