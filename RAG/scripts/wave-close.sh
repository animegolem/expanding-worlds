#!/usr/bin/env bash
# The wave CLOSE TRAIN — runs ONLY after (1) the lead has read
# wave-gate.sh's evidence file, (2) the ACCEPTANCE VERDICT is
# WRITTEN to outbox (the archive copies whatever stands — the
# nav-wave close archived an amend by running before the verdict),
# and (3) the close records are COMMITTED locally
# (CHANGELOG, HUMAN-TESTING, INDEX, ticket/epic state).
# Mechanics only: push main, sync the local main pointer, delete
# the ci branch, re-run the loud gates, archive the round files.
# It refuses to run with a dirty tree (uncommitted close records
# are a divergence, not a convenience).
#
# Usage:
#   ./RAG/scripts/wave-close.sh \
#     --wave nav-wave --round 2 --ci-branch ci/imp-292-295
#
# Exit: 0 closed, 3 halted (nothing irreversible happens after a
# halt — every step before main-push is local or deletable).

set -uo pipefail

WAVE="" ROUND="" CI_BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --wave) WAVE="$2"; shift 2 ;;
    --round) ROUND="$2"; shift 2 ;;
    --ci-branch) CI_BRANCH="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$WAVE" ] && [ -n "$ROUND" ] && [ -n "$CI_BRANCH" ] || { echo "need --wave --round --ci-branch" >&2; exit 2; }

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
halt() { echo "HALTED — $1" >&2; exit 3; }

[ "$(git rev-parse --abbrev-ref HEAD)" = "owner-view" ] || halt "not on owner-view"
[ -z "$(git status --porcelain)" ] || halt "working tree dirty — commit close records first"

# Loud gates before anything leaves the machine.
./RAG/scripts/generate-index.sh >/dev/null 2>&1
[ -z "$(git status --porcelain)" ] || halt "generate-index produced changes — review and commit them first"
./RAG/scripts/validate-tickets.sh >/dev/null 2>&1 || halt "validate-tickets red"

git push origin owner-view:main || halt "main push failed"
git branch -f main owner-view
git push origin --delete "$CI_BRANCH" 2>/dev/null || echo "(ci branch already gone)"

# Archive the round files (copy, never delete inbox — the verdict
# writer owns inbox lifecycle; this preserves the record).
CDX=".codex"
for side in inbox outbox; do
  src="$CDX/$side/$WAVE.md"
  if [ -f "$src" ]; then
    cp "$src" "$CDX/archive/$WAVE-$side-r$ROUND.md"
    echo "archived $side r$ROUND"
  fi
done

echo "CLOSED: main @ $(git rev-parse --short owner-view) · $WAVE r$ROUND archived · $CI_BRANCH deleted"
