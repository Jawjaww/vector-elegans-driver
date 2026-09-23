#!/usr/bin/env bash
# Local preview APK, named after the version it actually contains.
#
# The output used to be a fixed `./app.apk`, so two builds a week apart shared one
# name: an installed APK could not be traced back to a commit, and a stale build on
# the phone was indistinguishable from a fresh one. That is not hypothetical — it
# cost a night spent testing an application that did not contain the code under test.
#
# The version and versionCode are read from app.config.js rather than repeated here, so
# the name cannot drift from the build. Both are printed: the versionName is what a human
# recognises, the versionCode is what Android actually compares and what Settings > Apps
# displays, so the two together are what make an installed APK identifiable.
#
# Usage (from vector-elegans):
#   ./scripts/build-local-apk.sh
#
# Install the printed path over the existing app: same release key, so it updates in
# place and keeps the session and the FCM token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${APK_OUTPUT_DIR:-$ROOT}"

cd "$ROOT"

# gitignored, so a local build has to be pointed at the copy on disk. Without it the
# prebuild dies on ENOENT and nothing in the error says which file is missing.
if [[ -z "${GOOGLE_SERVICES_JSON:-}" ]]; then
  if [[ ! -f "$ROOT/google-services.json" ]]; then
    echo "Missing google-services.json in $ROOT — or set GOOGLE_SERVICES_JSON." >&2
    exit 1
  fi
  export GOOGLE_SERVICES_JSON="$ROOT/google-services.json"
fi

# npm omits devDependencies under NODE_ENV=production, and metro.config.js reaches
# tailwindcss (a devDependency) through nativewind: the JS bundling phase then fails
# with "Cannot find module 'tailwindcss/package.json'".
if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "NODE_ENV=production breaks this build (tailwindcss is a devDependency). Unset it." >&2
  exit 1
fi

# Toolchain locations. Only filled when unset, so an explicit choice always wins.
if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [[ -z "${JAVA_HOME:-}" && -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

VERSION="$(node -p "require('./app.config.js').expo.version")"
VERSION_CODE="$(node -p "require('./app.config.js').expo.android.versionCode")"
OUT="$OUTPUT_DIR/ve-driver-${VERSION}+${VERSION_CODE}.apk"

echo "Building version ${VERSION} (versionCode ${VERSION_CODE}, profile preview-local)"
echo "  java:      ${JAVA_HOME:-<inherited>}"
echo "  android:   ${ANDROID_HOME:-<inherited>}"
echo "  output:    $OUT"
echo

npx eas-cli@latest build \
  --local \
  --platform android \
  --profile preview-local \
  --non-interactive \
  --output "$OUT"

echo
echo "Wrote $OUT"
shasum -a 256 "$OUT"
