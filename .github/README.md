# GitHub Actions — vector-elegans-driver

## Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `ci.yml` | push/PR `main` | Jest + TypeScript |
| `eas-update-preview.yml` | after CI succeeds on `main` push | `eas update --channel preview` |

## Required secret

Add **`EXPO_TOKEN`** in GitHub → repo **Settings → Secrets and variables → Actions**.

Create token: https://expo.dev/accounts/jawjaww/settings/access-tokens (scope: at least **read/write** for EAS Update).

Without this secret, CI passes but OTA job fails with `An Expo user account is required to proceed`.

## Manual OTA (fallback)

```bash
npm run update:preview -- "your message"
```
