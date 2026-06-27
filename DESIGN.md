# Halo Post-Care App — Design & Architecture (for review)

**Status:** Proposed, pre-implementation. **Author:** Claude (Opus 4.8). **Date:** 2026-06-27.
**Purpose of this doc:** A self-contained spec a reviewer (e.g. Codex) can validate *before any code is written.* It states the goal, the decisions already made by the user, the architecture, the data model, the phone→repo→Claude loop, security trade-offs, and the open questions where I most want a second opinion. Please read the **"Questions for the reviewer"** section at the end — those are the load-bearing assumptions.

---

## 1. Goal

A personal, phone-first app to **look up** and **track** recovery after a Halo + BBL (BroadBand Light) laser resurfacing procedure on **face, neck, and hands**, with **BENE V exosomes** added. Procedure date: **Fri Jun 26, 2026** (EDINA Skin Artisans). The app must:

1. Show, at a glance, *what recovery day it is, what's happening to the skin, and what to do today* (AM/PM routine + medications).
2. Let the user **track** daily adherence (routine steps, acyclovir doses, sunscreen reapplication, supplements).
3. Let the user keep a **photo + symptom log** by treated area, and **hand each check-in to Claude for assessment** — the user wants Claude to look at the photos and say whether recovery is on-track, whether anything warrants calling the clinic, and when it's safe to reintroduce active ingredients.

This is a **time-limited** tool (~3 months of meaningful use, tapering as recovery completes). Simplicity and low friction matter more than extensibility.

## 2. Non-goals (YAGNI)

- No multi-user / accounts / auth system.
- No general skincare-routine engine — this is *recovery-specific*, sourced from one schedule.
- No push notifications/reminders in v1 (iOS PWA notification support is unreliable; revisit only if requested).
- No analytics dashboards, no charts. A simple adherence indicator is the ceiling.
- No native app. Web/PWA only.

## 3. Decisions already made by the user (do not relitigate; validate instead)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where it lives | **Standalone** app in `~/Git/halo-post-care` (not folded into the user's existing `pt-tracker` app) |
| D2 | Tracking depth | Routine + meds **checklist** *and* an **interactive photo log** that supports Claude check-ins |
| D3 | Log fields | Progress **photos by area** (face/neck/hands), **symptom ratings 1–5**, **free-text note**; recovery **stage is auto-derived** (not user-entered) |
| D4 | Photo→Claude handoff | **Commit to a git repo**, which the user pulls on their Mac and asks Claude to review ("Option 1: direct GitHub write from the app") |
| D5 | Storage of *tracking* data | On-device (localStorage / IndexedDB). Photos additionally travel to a **private** GitHub repo per D4. The user accepted that photos leave the device *via GitHub* as the cost of the git-based check-in loop. |

## 4. The core problem this architecture solves

The app runs in **mobile Safari on an iPhone**. The git repo and Claude live on a **Mac**. These are separate machines, and a sandboxed browser app **cannot write to the Mac's filesystem**. Any phone→repo transfer must go through a server or the cloud. The user explicitly chose to bridge that gap by having the app **commit straight to GitHub via the GitHub REST Contents API** using a token — no custom backend/Worker. (For reference, the user's `pt-tracker` solves the same problem with a Cloudflare Worker that hides a token; we are deliberately *not* doing that here — a single-user recovery app can store a narrowly-scoped token client-side.)

## 5. Repository & hosting layout (plan-agnostic)

GitHub Pages serves a public site for free on **any** plan, but Pages on a *private* repo requires a paid plan (the user's plan could not be confirmed — `gh api user` returned `plan: null`). To keep recovery **photos private regardless of plan**, the app code and the photo data are split:

```
halo-post-care            (PUBLIC)   app code only — HTML/CSS/JS/manifest/service worker.
                                       Deployed to GitHub Pages → the PWA URL.
                                       Contains ZERO personal data.
halo-post-care-data       (PRIVATE)  check-in payloads: compressed photos + per-day markdown.
                                       Written by the app via the Contents API.
                                       Pulled to the Mac; Claude reads + assesses.
```

- The existing local folder `~/Git/halo-post-care` becomes the **public code repo**.
- A separate **private data repo** holds check-ins. Locally cloned (e.g. `~/Git/halo-post-care-data`) so "sync from here" = `git -C ~/Git/halo-post-care-data pull`.
- **Alternative if the user has GitHub Pro:** collapse to a single *private* repo (code + data together) with private-repo Pages. Cleaner (one local folder) but plan-dependent. The two-repo split is the safe default.

## 6. Tech stack

- **Plain static web app.** HTML + vanilla ES modules + CSS. No framework, no build step (keeps it forkable, reviewable, and dependency-free for a 3-month tool). This mirrors `pt-tracker`'s philosophy.
- **PWA:** `manifest.webmanifest` + a small **service worker** that precaches the app shell so it opens offline on the home screen.
- **Local storage:**
  - `localStorage` — checklist state, symptom ratings, settings (procedure date, token, units), last-synced metadata. Small JSON.
  - **IndexedDB** — captured photos (binary blobs are too large for localStorage), so the log is viewable offline even before/after a commit.
- **Photo handling:** capture via `<input type="file" accept="image/*" capture="environment">`; downscale to ~1280px longest edge and re-encode JPEG ~0.7 on a `<canvas>` before storing/uploading (target a few hundred KB each).
- **GitHub write:** `fetch` to `PUT /repos/{owner}/halo-post-care-data/contents/{path}` with the fine-grained token, base64 file content. One commit per file (photos + the markdown summary) or batched via the Git Data API if multi-file atomicity is wanted (see open question Q4).

## 7. Source content → data model

All reference + checklist content derives from the user's **"Halo + BBL Recovery Schedule"** (personal plan reconciling EDINA's aftercare sheet with provider-approved additions — Alastin Day 1, BENE V exosomes; generated 2026-06-26). Encoded as static JS data:

**Core daily sequence (Day 1+):** Gentle cleanse → HOCl spray (air-dry 30–60s) → Alastin Skin Nectar (thin) → Cicalfate+ (occlusive) → Physical SPF (AM).

**Day-by-day timeline:**
- **Day 0 (Fri, PM):** Heat peaks ~2h; swelling begins. Avène thermal water; no washing tonight; Cicalfate+ to keep moist; let exosomes sit; **take acyclovir**; sleep head-elevated; no actives/sweat.
- **Day 1 (Sat):** Red, warm, tight. Full sequence AM & PM. HOCl 2–3×/day. Cicalfate+ 2–4×/day. SPF = EltaMD UV Skin Recovery. Oral Heliocare. Cold compresses; sleep elevated.
- **Days 2–3 (Sun–Mon):** MENDs appear (bronzing + sandpaper texture); swelling resolving. Same routine. **No picking/rubbing.** HOCl through end of Day 3 then as needed. Thermal water anytime.
- **Days 4–7 (Tue–Fri):** Flaking & peeling; skin calming. Continue cleanse + Alastin + Cicalfate + SPF. Let flakes shed — no exfoliating. Switch SPF to ISDIN tinted once peeling completes. Makeup only after peeling done.
- **Week 2+:** Peeled, fresh, brighter. Reintroduce actives slowly *only if calm*: azelaic 15% first (~D7–10, 1×/day) → vitamin C (~D10) → tretinoin 0.05% (~D10–14, 2 nights/wk) → acids/BHA last (2+ wks). Resume sauna/cold plunge/gym ~D5–7+ only if no redness/heat.

**By treated area:**
- **Face** — full sequence; tinted SPF once healed for PIE/PIH defense.
- **Neck** — same kit; bland mineral SPF (UV Skin Recovery, then ISDIN/AOX); thin skin, extra gentle.
- **Hands** — most diligence (pigment & stay red longest); Cicalfate+ after every wash, lukewarm water, pat dry, no picking; SPF + gloves/sun avoidance.

**Standing rules:**
- **Acyclovir** — finish the entire prescription even if nothing flares (prevents scarring HSV outbreak).
- **Sunscreen** — physical SPF 30–50 daily for **3 months**; reapply with exposure.
- **Hat/clothing** — wide-brim hat + protective clothing **2 months**; avoid sun 10:00–14:30.
- **Don'ts** — no picking MENDs/flakes, no scrubbing/exfoliating, no sweat/sauna/gym until healed, no actives until peeled & calm.

**Call the clinic if:** pus/drainage; increasing warmth or spreading redness; fever; extreme itching; blistering/oozing/sharply-demarcated burn-like areas; severe or asymmetric eye swelling.
- **EDINA Skin Artisans:** 952-767-3163 (weekday & weekend).
- **On-call physician:** 952-925-1165 (if no reply within 30 min).

### Derived state

- **`recoveryDay = floor((today − procedureDate) / 1 day)`** (procedure date = Day 0). Editable in Settings.
- **`stage`** auto-mapped from `recoveryDay`: `0` → *heat & swelling*; `1` → *red, warm, tight*; `2–3` → *MENDs / bronzing*; `4–7` → *flaking & peeling*; `≥8` → *peeled & calm / reintroduction*. (Claude confirms/corrects the stage from photos at check-in — the app's value is a default, not ground truth.)

### Trackable items (per day)

Checklist toggles + small counters, seeded from the active day's guidance:
- AM routine steps; PM routine steps (the core sequence).
- Counters with daily targets: **HOCl** (2–3×, D1–3), **Cicalfate+** (2–4×), **SPF reapply**, **Acyclovir** (default 2×/day — *follow the actual Rx label*; frequency is user-adjustable), **oral Heliocare** (1×).
- Booleans: slept head-elevated, cold compress done.
- State resets at local midnight; a lightweight adherence indicator (e.g. "5/7 done").

## 8. Local data schema (sketch)

```jsonc
// localStorage["halo_settings_v1"]
{ "procedureDate": "2026-06-26", "acyclovirPerDay": 2, "units": "n/a",
  "githubOwner": "jcpeters08", "dataRepo": "halo-post-care-data", "token": "<fine-grained PAT>" }

// localStorage["halo_daily_v1"]  — keyed by ISO date
{ "2026-06-27": { "am": {"cleanse":true,"hocl":true,...}, "pm": {...},
                  "counters": {"hocl":2,"cicalfate":3,"spf":1,"acyclovir":2,"heliocare":1},
                  "flags": {"elevated":true,"coldCompress":false} } }

// localStorage["halo_symptoms_v1"] — keyed by ISO date
{ "2026-06-27": { "redness":4,"swelling":3,"flaking":1,"itch":2,"tightness":4,"note":"..." } }

// IndexedDB "halo-photos" — { id, date, area:"face|neck|hands", blob, committedSha|null }
```

## 9. Screens / UX

1. **Today** (home) — Day N + stage banner + "what's happening" line; AM/PM checklist; counters; quick link to log a photo.
2. **Day-by-day** — full timeline incl. the actives-reintroduction ladder.
3. **By area** — Face / Neck / Hands cards.
4. **Standing rules** — acyclovir / SPF / hat / Don'ts.
5. **⚠️ Call clinic** — warning list + tap-to-call buttons (`tel:` links).
6. **Log** — capture photos by area, set symptom sliders, free-text note; list of past entries; **"Prepare check-in"** → compresses photos, builds the markdown, commits to the private data repo, shows success/failure.
7. **Settings** — procedure date, acyclovir frequency, GitHub owner/repo + token (with a "test connection" button), export-all, reset.

Persistent footer disclaimer: *"Clinic instructions and your provider override this app."*

## 10. Check-in payload (what Claude pulls)

On "Prepare check-in", commit to the private data repo under a dated folder:

```
checkins/2026-06-27/
  summary.md          # day, stage, symptom ratings, checklist adherence, free-text note
  face.jpg            # compressed
  neck.jpg
  hands.jpg
```

`summary.md` example:
```markdown
# Check-in — Day 1 (2026-06-27)
Stage (auto): Red, warm, tight
Symptoms (1–5): redness 4 · swelling 3 · flaking 1 · itch 2 · tightness 4
Adherence: AM 5/5 · PM 4/5 · HOCl 2/3 · Cicalfate+ 3 · SPF 1 · Acyclovir 2/2
Note: "Hands feel tightest. Mild stinging after cleanse."
Photos: face.jpg, neck.jpg, hands.jpg
```

**The loop:** tap Save (phone) → commit to private repo → user runs `git pull` on the Mac and tells Claude "new check-in" → Claude reads `summary.md` + the JPGs and returns an assessment.

## 11. Security & privacy

- **Token:** a **fine-grained PAT**, scoped to **only `halo-post-care-data`**, permission **Contents: Read & Write**, with an **expiration** (e.g. 90 days, matching the recovery window). Stored in `localStorage` on the user's personal phone. The user mints it (Claude cannot); the app provides exact steps + a "test connection" check.
- **Threat model:** the risk is a malicious script on the same origin or physical phone access reading the token. Mitigated by: dedicated single-repo fine-grained scope (blast radius = this one private repo), expiry, no third-party scripts on the page (no CDNs — everything vendored/inline), and the user can revoke instantly in GitHub settings.
- **Photos** live only in: the phone (IndexedDB), the **private** GitHub repo, and the user's Mac clone. The public code repo never receives data.
- **No third-party network calls** other than `api.github.com`.

## 12. Repo file structure (public code repo)

```
halo-post-care/
  index.html                 # app shell + tab nav
  css/styles.css
  js/
    app.js                   # boot, routing, render
    data.js                  # the recovery schedule (section 7) as structured data
    day.js                   # recoveryDay + stage derivation
    checklist.js             # daily tracking state
    photos.js                # capture, compress, IndexedDB
    github.js                # Contents API client (commit check-in)
    storage.js               # localStorage helpers, export/reset
  manifest.webmanifest
  sw.js                      # service worker (precache shell)
  icons/                     # PWA icons
  DESIGN.md                  # this doc
  README.md                  # deploy + token setup steps
```

## 13. Build / deploy steps (for reference)

1. Build the static app in `~/Git/halo-post-care`.
2. `gh repo create halo-post-care --public --source . --push`; enable Pages (branch `main`, root).
3. `gh repo create halo-post-care-data --private`; clone to `~/Git/halo-post-care-data` with a `checkins/` dir + README.
4. User mints the fine-grained PAT (scoped to the data repo), pastes into Settings, runs "test connection".
5. Open the Pages URL on iPhone → Share → Add to Home Screen.

## 14. Testing approach

- **Unit (vitest, optional):** `day.js` stage/day math across boundaries; `storage.js` round-trips; `github.js` path/base64 building (mocked fetch).
- **Manual on-device:** offline launch; photo capture + compression size check; a real check-in commit; verify the dated folder appears in the private repo and pulls cleanly to the Mac.

## 15. Risks / open questions for the reviewer

- **Q1 — Repo split.** Is the public-code / private-data two-repo split the right call vs. a single private repo (requires Pro)? Any simpler privacy-preserving layout?
- **Q2 — Token in localStorage.** Acceptable for a single-user personal recovery app? Better client-side option that avoids a backend? (We rejected the pt-tracker Worker pattern as overkill — agree?)
- **Q3 — GitHub API limits.** Contents API is fine for small files; should multi-file check-ins use the Git Data API (blobs+tree+commit) for atomicity, or is file-by-file `PUT` acceptable? Any rate-limit concern at ~1 check-in/day?
- **Q4 — Photo privacy.** Anything beyond "private repo + scoped token" worth doing for medical-adjacent face photos? (e.g. should photos *not* go to GitHub at all and instead use the iCloud-inbox fallback?)
- **Q5 — Day/stage model.** Is deriving stage purely from day-count too rigid given recovery varies per person? (We let Claude override from photos — sufficient?)
- **Q6 — Scope.** Is anything in §1–§10 over-built for a 3-month tool, or missing something a recovering user would actually want at 7am on Day 3?
- **Q7 — Medical safety.** Is the "Call the clinic" surfacing prominent enough? Should any symptom-rating threshold (e.g. redness 5 + spreading) trigger an in-app "consider calling the clinic" nudge?

## 16. Medical disclaimer

This app reproduces the user's personal recovery schedule for convenience. **Clinic instructions and the treating provider override everything here.** It is not medical advice and does not replace professional care. The "Call the clinic" triggers and phone numbers are reproduced from the schedule and must remain accurate.
