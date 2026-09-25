# GitHub Actions — vector-elegans-driver

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `ci.yml` | push/PR `main` | Jest + TypeScript |
| `eas-update-preview.yml` | after CI succeeds on `main` push | `scripts/eas-update-preview.sh` (local APK fingerprint) |

## Required secret

Add **`EXPO_TOKEN`** in GitHub → repo **Settings → Secrets and variables → Actions**.

Add **`GOOGLE_SERVICES_JSON`** as a secret on the GitHub Environment **`GOOGLE_SERVICES_JSON`** (the OTA job sets `environment:` to that name). Paste the exact contents of local `google-services.json`. Without it, the job falls back to `eas update --environment preview` (cloud runtime only). Leave required reviewers and the wait timer off unless you want every OTA to pause.

Create token: https://expo.dev/accounts/jawjaww/settings/access-tokens (scope: at least **read/write** for EAS Update).

Without this secret, CI passes but OTA job fails with `An Expo user account is required to proceed`.

## Manual OTA (fallback)

```bash
./scripts/eas-update-preview.sh "$(git rev-parse HEAD)"
```

Uses the same `google-services.json` layout as `build-local-apk.sh` (not for routine use — merge to `main` instead).
