#!/usr/bin/env bash
# Runs inside `eas env:exec preview` so EXPO_PUBLIC_* match the preview environment.
# Copies the Firebase file to the repo root and points GOOGLE_SERVICES_JSON at it — same
# layout as ./scripts/build-local-apk.sh, so the Android fingerprint matches local APKs.
set -euo pipefail

SHA="${1:?commit sha for OTA message}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${GOOGLE_SERVICES_JSON:-}" || ! -f "${GOOGLE_SERVICES_JSON}" ]]; then
  echo "GOOGLE_SERVICES_JSON is missing inside eas env:exec preview" >&2
  exit 1
fi

cp "$GOOGLE_SERVICES_JSON" "$ROOT/google-services.json"
export GOOGLE_SERVICES_JSON="$ROOT/google-services.json"

eas update \
  --channel preview \
  --non-interactive \
  --message "OTA from ${SHA}"
