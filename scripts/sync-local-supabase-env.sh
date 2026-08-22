#!/usr/bin/env bash
# Sync vector-elegans/.env with LAN IP + keys from `supabase status -o env`.
# Expo Go on a physical device cannot reach localhost — use the Mac Wi-Fi IP.
#
# Usage (from vector-elegans):
#   ./scripts/sync-local-supabase-env.sh
# Then restart Metro with cache clear:
#   npx expo start -c
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$(cd "$ROOT/../infra-supabase" 2>/dev/null && pwd || true)"
ENV_FILE="$ROOT/.env"

if [[ ! -d "$INFRA" ]]; then
  echo "infra-supabase not found next to vector-elegans"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example to .env first"
  exit 1
fi

# Prefer en0 (Wi-Fi), then en1, then first non-loopback inet from ifconfig
HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$HOST_IP" ]]; then
  HOST_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [[ -z "$HOST_IP" ]]; then
  HOST_IP="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
fi
if [[ -z "$HOST_IP" ]]; then
  echo "Could not detect LAN IP (en0/en1). Connect to Wi-Fi and retry."
  exit 1
fi

STATUS_ENV="$(cd "$INFRA" && supabase status -o env)"
API_PORT="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL="http:\/\/[^:]*:\([0-9]*\)"/\1/p')"
if [[ -z "$API_PORT" ]]; then
  API_PORT="$(printf '%s\n' "$STATUS_ENV" | sed -n 's|^API_URL="http://[^"]*:\\([0-9]*\\)"|\\1|p')"
fi
# Fallback parse: last :port in API_URL
if [[ -z "$API_PORT" ]]; then
  API_URL_RAW="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL="\(.*\)"/\1/p')"
  API_PORT="$(printf '%s' "$API_URL_RAW" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
fi
ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')"

if [[ -z "$API_PORT" ]]; then
  API_PORT="54329"
fi
if [[ -z "$ANON_KEY" ]]; then
  echo "Could not read ANON_KEY from supabase status (is supabase running?)"
  exit 1
fi

LAN_URL="http://${HOST_IP}:${API_PORT}"

TMP="$(mktemp)"
awk -v url="$LAN_URL" -v anon="$ANON_KEY" '
  BEGIN { u=0; a=0; s=0; api=0 }
  /^EXPO_PUBLIC_SUPABASE_URL=/ { print "EXPO_PUBLIC_SUPABASE_URL=" url; u=1; next }
  /^EXPO_PUBLIC_SUPABASE_ANON_KEY=/ { print "EXPO_PUBLIC_SUPABASE_ANON_KEY=" anon; a=1; next }
  /^EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=/ { print "EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=" anon; s=1; next }
  /^EXPO_PUBLIC_API_URL=/ { print "EXPO_PUBLIC_API_URL=" url; api=1; next }
  { print }
  END {
    if (!u) print "EXPO_PUBLIC_SUPABASE_URL=" url
    if (!a) print "EXPO_PUBLIC_SUPABASE_ANON_KEY=" anon
    if (!s) print "EXPO_PUBLIC_SUPABASE_STORAGE_ANON_KEY=" anon
    if (!api) print "EXPO_PUBLIC_API_URL=" url
  }
' "$ENV_FILE" > "$TMP"

mv "$TMP" "$ENV_FILE"

echo "Updated $ENV_FILE"
echo "  EXPO_PUBLIC_SUPABASE_URL=$LAN_URL"
echo "  EXPO_PUBLIC_API_URL=$LAN_URL"
echo "  ANON_KEY synced from infra-supabase"
echo ""
echo "Smoke test from this Mac:"
echo "  curl -sS \"$LAN_URL/auth/v1/health\" || true"
echo "From your phone (same Wi-Fi), open:"
echo "  $LAN_URL/auth/v1/health"
echo ""
echo "Then restart Metro:"
echo "  cd vector-elegans && npx expo start -c"
echo "Login: jean.dupont@elegance-mobilite.local / password123"
