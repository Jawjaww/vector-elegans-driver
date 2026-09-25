#!/usr/bin/env bash
# GitOps preview OTA — same entry point as .github/workflows/eas-update-preview.yml
set -euo pipefail

SHA="${1:-$(git rev-parse HEAD)}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# env:exec takes a single bash command string, not separate argv after the environment.
eas env:exec preview --non-interactive "bash \"$ROOT/scripts/eas-update-preview-exec.sh\" \"$SHA\""
