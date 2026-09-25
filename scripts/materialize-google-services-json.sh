#!/usr/bin/env bash
# Place google-services.json next to app.config.js — same layout as build-local-apk.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/google-services.json"

if [[ -n "${GOOGLE_SERVICES_JSON_CONTENT:-}" ]]; then
  printf '%s' "$GOOGLE_SERVICES_JSON_CONTENT" > "$TARGET"
elif [[ -f "$TARGET" ]]; then
  :
elif [[ -n "${GOOGLE_SERVICES_JSON:-}" && -f "${GOOGLE_SERVICES_JSON}" ]]; then
  cp "${GOOGLE_SERVICES_JSON}" "$TARGET"
else
  ENV_FILE="$(mktemp)"
  trap 'rm -f "$ENV_FILE"' EXIT
  eas env:pull preview --non-interactive --path "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  if [[ -z "${GOOGLE_SERVICES_JSON:-}" || ! -f "${GOOGLE_SERVICES_JSON}" ]]; then
    echo "GOOGLE_SERVICES_JSON not resolved after eas env:pull preview" >&2
    echo "Add GitHub secret GOOGLE_SERVICES_JSON (file body) or keep EAS preview file var." >&2
    exit 1
  fi
  cp "${GOOGLE_SERVICES_JSON}" "$TARGET"
fi

export GOOGLE_SERVICES_JSON="$TARGET"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "GOOGLE_SERVICES_JSON=$TARGET" >> "$GITHUB_ENV"
fi
