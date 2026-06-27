# Halo Post-Care

Halo Post-Care is a static, mobile-first PWA for the first months after a Halo + BBL procedure with BENE V exosomes. The public repo contains only app code, docs, and contracts. Personal photos, check-in payloads, and Codex assessments belong in the private `halo-post-care-data` repo.

## Repos and Responsibilities

- `halo-post-care` (public): static HTML, CSS, vanilla ES modules, tests, service worker, and documentation.
- `halo-post-care-data` (private): dated check-in folders with `manifest.json`, `summary.md`, `complete.json`, the required `face.jpg` / `neck.jpg` / `hands.jpg` uploads, plus Codex-written `assessment.json` and `assessment.md`.

Do not commit personal photos, symptom notes, or completed check-in data to the public repo.

## Deploy to GitHub Pages

1. Push the public app repo to GitHub.
2. In GitHub, open `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `Deploy from a branch`.
4. Select the branch to publish and choose `/ (root)` as the folder.
5. Save, wait for the Pages deployment to finish, then open the published URL on the phone.
6. Install the app to the home screen from mobile Safari so the manifest and service worker can provide the app shell offline.

## Create the Private Data Repo

1. Create `halo-post-care-data` as a private GitHub repository.
2. Add a top-level `checkins/` directory.
3. Clone that private repo locally on the Mac so Codex can review new folders and write assessments there.
4. In app Settings, leave the public repo untouched and point the data fields at the private repo owner and `halo-post-care-data`.

## Create the GitHub Token

The app stores a fine-grained personal access token in `localStorage`, so keep the scope narrow and set an expiration that matches the recovery window.

1. In GitHub, open `Settings` -> `Developer settings` -> `Personal access tokens` -> `Fine-grained tokens`.
2. Choose `Generate new token`.
3. Set the resource owner to the account that owns `halo-post-care-data`.
4. Restrict repository access to `Only select repositories`, then select `halo-post-care-data`.
5. Set an expiration date.
6. Under repository permissions, grant `Contents` -> `Read and write`.
7. Leave other repository, account, and organization permissions unset unless GitHub requires otherwise.
8. Generate the token, copy it once, and paste it into the app's Settings screen.
9. Use `Test connection` in the app to confirm the token can reach `https://api.github.com`.

## Daily Codex Workflow

1. On the phone, open the app and complete the daily check-in with face, neck, and hands photos.
2. Prepare the check-in so the app uploads the folder to `halo-post-care-data`.
3. On the Mac, tell Codex there is a new check-in in `halo-post-care-data`.
4. Codex reviews the latest completed check-in folder and writes both `assessment.json` and `assessment.md` into that same folder.
5. Codex commits and pushes the private repo changes.
6. After Codex pushes `assessment.json` and `assessment.md`, the app checks for the latest Codex assessment and automatically applies the newest valid `assessment.json`.
7. If the latest assessment does not appear right away, use `Sync latest Codex assessment` in Settings as a manual refresh.

## Warnings and Boundaries

- The public repo must contain only code, docs, and contracts.
- Never commit photos, raw symptom logs, or uploaded check-in folders to the public repo.
- Network calls must stay limited to `https://api.github.com`.
- Provider instructions and clinic guidance remain the safety guardrails for this recovery plan.
- Codex may adjust practical day-to-day guidance over time based on the latest photos and symptoms, but it must stay within those provider and clinic guardrails.

## Revoke the Token

If the phone is lost, the recovery window ends, or the token may be exposed:

1. Go to GitHub `Settings` -> `Developer settings` -> `Personal access tokens` -> `Fine-grained tokens`.
2. Find the token created for `halo-post-care-data`.
3. Revoke or delete it.
4. Remove the token from the app's Settings screen and save.
5. Create a replacement token only if the app still needs to upload or sync.

## Local Development

```bash
npm test
npm run serve
```

- `npm test` runs the Node smoke and contract checks.
- `npm run serve` starts a local static server at `http://localhost:4173`.
