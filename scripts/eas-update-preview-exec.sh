#!/usr/bin/env bash
set -euo pipefail

SHA="${1:?commit sha for OTA message}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if "$ROOT/scripts/materialize-google-services-json.sh"; then
  ENV_FILE="$(mktemp)"
  trap 'rm -f "$ENV_FILE"' EXIT
  eas env:pull preview --non-interactive --path "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  export GOOGLE_SERVICES_JSON="$ROOT/google-services.json"

  eas update \
    --channel preview \
    --non-interactive \
    --message "OTA from ${SHA}"
else
  echo "WARN: google-services.json not materialized — publishing with EAS preview env only (cloud runtime)." >&2
  echo "WARN: For local APK OTAs, add GitHub secret GOOGLE_SERVICES_JSON (file body)." >&2
  eas update \
    --channel preview \
    --environment preview \
    --non-interactive \
    --message "OTA from ${SHA}"
fi
