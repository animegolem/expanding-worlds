#!/usr/bin/env bash
# The wave EVIDENCE TRAIN — lead-side companion to the wave
# orchestration workflow (RGB-Agent pattern: plan once, execute
# dumb, halt on divergence, wake the mind with evidence).
#
# Runs AFTER the lead has reviewed the submission diff and written
# the merge message; runs the mechanical stretch merge → build →
# full check (counts parsed against an expected floor) → ci push →
# oracle watch, HALTING on the first divergence. It NEVER pushes
# main and NEVER decides acceptance: it emits one evidence file the
# lead must read before blessing (the counts table is printed raw —
# acceptance is a judgment, not a grep; see CLAUDE.md's pipefail /
# counts-read law, which this script makes structural).
#
# Usage:
#   ./RAG/scripts/wave-gate.sh \
#     --clone /path/to/isolated-clone \
#     --branch codex/imp-xxx-yyy \
#     --commit <submission tip sha> \
#     --msg-file /path/to/merge-message.txt \
#     --ci-branch ci/imp-xxx-yyy \
#     --expect "persistence=658 canvas-engine=409 desktop=541 e2e=268"
#
# --expect values are FLOORS (new pins raise counts; a drop is a
# divergence). Evidence lands in $WAVE_EVIDENCE_DIR (default: a
# mktemp dir), path printed last. Exit: 0 evidence complete (read
# it!), 3 halted on divergence (evidence says where).

set -uo pipefail

CLONE="" BRANCH="" COMMIT="" MSG_FILE="" CI_BRANCH="" EXPECT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --clone) CLONE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --msg-file) MSG_FILE="$2"; shift 2 ;;
    --ci-branch) CI_BRANCH="$2"; shift 2 ;;
    --expect) EXPECT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
for v in CLONE BRANCH COMMIT MSG_FILE CI_BRANCH EXPECT; do
  [ -n "${!v}" ] || { echo "missing --$(echo "$v" | tr 'A-Z' 'a-z' | tr _ -)" >&2; exit 2; }
done

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
EVD="${WAVE_EVIDENCE_DIR:-$(mktemp -d /tmp/wave-evidence-XXXX)}"
mkdir -p "$EVD"
EV="$EVD/evidence.md"
LOG="$EVD/gate.log"
: > "$EV"; : > "$LOG"

note() { echo "$1" | tee -a "$EV"; }
halt() {
  note ""
  note "## HALTED — $1"
  note "Working tree left as-is for inspection. Log: $LOG"
  echo "EVIDENCE: $EV"
  exit 3
}

note "# Wave gate evidence — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
note ""
note "- repo branch: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
note "- submission: $BRANCH @ $COMMIT (clone: $CLONE)"

# Preconditions: clean tree, on owner-view.
[ -z "$(git status --porcelain)" ] || halt "working tree not clean — resolve before gating"
[ "$(git rev-parse --abbrev-ref HEAD)" = "owner-view" ] || halt "not on owner-view"

# 1 · fetch + verify tip identity (submission shas may be short).
git fetch "$CLONE" "$BRANCH" >>"$LOG" 2>&1 || halt "fetch failed"
FETCHED="$(git rev-parse FETCH_HEAD)"
case "$FETCHED" in
  "$COMMIT"*) note "- fetched tip: $FETCHED (matches submission)" ;;
  *) halt "FETCH_HEAD $FETCHED does not match submitted commit $COMMIT" ;;
esac

# 2 · merge (message is the lead's, provided via file).
git merge --no-ff FETCH_HEAD -F "$MSG_FILE" >>"$LOG" 2>&1 || halt "merge failed (conflicts?)"
note "- merge: $(git rev-parse --short HEAD)"
note ""
note "## Diffstat"
note '```'
git diff --stat "HEAD^1..HEAD" | tail -6 >> "$EV"
note '```'

# 3 · build.
CI=true pnpm -r build >>"$LOG" 2>&1 || halt "workspace build failed"
note "- build: green"

# 4 · full check with counts parsed against floors.
CI=true pnpm check >>"$LOG" 2>&1
CHECK_EXIT=$?
note ""
note "## Counts (raw lines — READ THESE)"
note '```'
grep -E "Tests  [0-9]+ passed|[0-9]+ passed \(" "$LOG" | tail -12 >> "$EV"
note '```'
grep -nE "[1-9][0-9]* (failed|flaky)" "$LOG" >> "$EV" && note "(failed/flaky lines above)"
[ $CHECK_EXIT -eq 0 ] || halt "pnpm check exit $CHECK_EXIT"

for pair in $EXPECT; do
  name="${pair%%=*}"; floor="${pair##*=}"
  case "$name" in
    e2e) actual=$(grep -Eo "[0-9]+ passed \(" "$LOG" | tail -1 | grep -Eo "[0-9]+") ;;
    *)   actual=$(grep -E "$name test:\s+Tests\s+[0-9]+ passed" "$LOG" | grep -Eo "Tests\s+[0-9]+" | grep -Eo "[0-9]+" | tail -1) ;;
  esac
  [ -n "${actual:-}" ] || halt "count for '$name' not found in check output"
  [ "$actual" -ge "$floor" ] || halt "$name count $actual below floor $floor"
  note "- $name: $actual (floor $floor) ok"
done

# 4.5 · review-targeting metrics (owner-approved trial 2026-07-23,
# two waves then keep-or-delete). Informational — never a halt.
note ""
./RAG/scripts/review-metrics.sh "HEAD^1..HEAD" >> "$EV" 2>>"$LOG" || note "(review-metrics failed — see log; not a halt)"

# 5 · oracle.
git push origin "owner-view:$CI_BRANCH" >>"$LOG" 2>&1 || halt "ci branch push failed"
sleep 10
RUN_ID="$(gh run list --branch "$CI_BRANCH" --limit 1 --json databaseId -q '.[0].databaseId' 2>>"$LOG")"
[ -n "$RUN_ID" ] || halt "no workflow run found for $CI_BRANCH"
note ""
note "- oracle run: $RUN_ID (watching…)"
gh run watch "$RUN_ID" --exit-status >>"$LOG" 2>&1
CONCLUSION="$(gh run view "$RUN_ID" --json conclusion -q '.conclusion' 2>>"$LOG")"
note "- oracle conclusion: \"$CONCLUSION\" (run $RUN_ID — quote this)"
[ "$CONCLUSION" = "success" ] || halt "oracle conclusion=$CONCLUSION"

note ""
note "## Train complete — NOTHING PUSHED TO MAIN"
note "Bless by reading the counts + diffstat above, then run wave-close.sh."
echo "EVIDENCE: $EV"
