#!/usr/bin/env bash
# Point vector-elegans/.env at the same Supabase cloud project as Vercel
# (elegance-mobilite). Restore local Docker with:
#   ./scripts/sync-local-supabase-env.sh
#
# Usage (from vector-elegans):
#   ./scripts/use-cloud-supabase-env.sh
# Then restart Metro:
#   npx expo start -c
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
NEXT_PROD="$ROOT/../elegance-mobilite/.env.local.production"
NEXT_LOCAL="$ROOT/../elegance-mobilite/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example to .env first"
  exit 1
fi

SOURCE=""
if [[ -f "$NEXT_PROD" ]]; then
  SOURCE="$NEXT_PROD"
elif [[ -f "$NEXT_LOCAL" ]]; then
  SOURCE="$NEXT_LOCAL"
fi

CLOUD_URL=""
CLOUD_ANON=""

if [[ -n "$SOURCE" ]]; then
  CLOUD_URL="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$SOURCE" | head -1 | tr -d '"' | tr -d "'")"
  CLOUD_ANON="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_ANON_KEY=//p' "$SOURCE" | head -1 | tr -d '"' | tr -d "'")"
fi

# Fallback: commented cloud lines already in .env
if [[ -z "$CLOUD_URL" || "$CLOUD_URL" != https://* ]]; then
  CLOUD_URL="$(sed -n 's/^# *EXPO_PUBLIC_SUPABASE_URL=\(https:\/\/.*supabase\.co[^[:space:]]*\)/\1/p' "$ENV_FILE" | head -1)"
fi
if [[ -z "$CLOUD_ANON" ]]; then
  CLOUD_ANON="$(sed -n 's/^# *EXPO_PUBLIC_SUPABASE_ANON_KEY=\(.*\)/\1/p' "$ENV_FILE" | head -1)"
fi

if [[ "$CLOUD_URL" != https://*supabase.co* ]]; then
  echo "Could not resolve cloud Supabase URL (need https://….supabase.co)."
  echo "Put NEXT_PUBLIC_SUPABASE_* in elegance-mobilite/.env.local.production"
  echo "or a commented https://….supabase.co block in vector-elegans/.env"
  exit 1
fi

if [[ -z "$CLOUD_ANON" ]]; then
  echo "Could not resolve cloud anon key."
  exit 1
fi

# Skip if Next .env.local still points at local Docker
if [[ "$CLOUD_URL" == http://* ]]; then
  echo "Source URL is local HTTP — use elegance-mobilite/.env.local.production for cloud keys."
  exit 1
fi

# Backup current .env once (don't overwrite an existing backup)
if [[ ! -f "$ROOT/.env.lan.bak" ]]; then
  cp "$ENV_FILE" "$ROOT/.env.lan.bak"
  echo "Saved backup → .env.lan.bak"
fi

TMP="$(mktemp)"
awk -v url="$CLOUD_URL" -v anon="$CLOUD_ANON" '
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

echo "Updated $ENV_FILE → cloud (same project as Vercel)"
echo "  EXPO_PUBLIC_SUPABASE_URL=$CLOUD_URL"
echo ""
echo "Back to local Docker LAN:"
echo "  ./scripts/sync-local-supabase-env.sh"
echo "  # or: cp .env.lan.bak .env"
echo ""
echo "Then restart Metro:"
echo "  npx expo start -c"
