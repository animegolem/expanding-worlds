#!/usr/bin/env bash
# Review-targeting metrics (owner-approved trial, 2026-07-23 — two
# waves, then keep-or-delete by whether the lead ever acted on it).
#
# NOT a gate: emits three short sections the lead reads while
# reviewing a wave merge, aimed at THIS repo's real defect classes
# (seams and platform divergence), not at complexity dogma — CC as
# a threshold was deliberately rejected (OWNER-APPROVALS A8).
#
#   1. Churn x complexity hotspots — files changed often (90d) AND
#      complex; slow down when a wave touches one.
#   2. Platform-risk touches — diff hunks touching the API families
#      behind every oracle red to date (focus races, coordinate
#      proxies, rAF timing, DPR/layout quantum).
#   3. Complexity delta — functions whose CCN rose >=3 or crossed
#      15 in this range (lizard; .ts/.js only — .svelte script
#      blocks are not parsed, an accepted blind spot).
#
# Usage: ./RAG/scripts/review-metrics.sh [<range>]   (default HEAD^1..HEAD)

set -uo pipefail
RANGE="${1:-HEAD^1..HEAD}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
LIZARD="python3 -m lizard"

echo "## Review-targeting metrics ($RANGE)"
echo

# ---- 1 · churn x complexity hotspots -------------------------------
echo "### Hotspots touched by this range (churn90d x avgCCN)"
CHANGED=$(git diff --name-only "$RANGE" -- 'apps/**/*.ts' 'packages/**/*.ts' | grep -v '\.test\.ts$' | grep -v '/e2e/' || true)
if [ -z "$CHANGED" ]; then
  echo "(no non-test .ts files in range)"
else
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    churn=$(git log --since="90 days ago" --oneline -- "$f" | wc -l | tr -d ' ')
    ccn=$($LIZARD "$f" 2>/dev/null | tail -1 | awk '{print $2}')
    echo "$((churn * ${ccn%.*}))|$f|churn=$churn avgCCN=$ccn"
  done <<< "$CHANGED" | sort -rn -t'|' -k1 | head -10 | awk -F'|' '{printf "- %s (%s, score %s)\n", $2, $3, $1}'
fi
echo

# ---- 2 · platform-risk touches -------------------------------------
echo "### Platform-risk touches (the oracle-red API families)"
RISK='\.focus\(|autofocus|activeElement|setPointerCapture|releasePointerCapture|requestAnimationFrame|devicePixelRatio|getBoundingClientRect|elementsFromPoint|scrollIntoView'
HITS=$(git diff "$RANGE" -- 'apps/**' 'packages/**' | grep -E "^\+" | grep -cE "$RISK" || true)
if [ "$HITS" = "0" ] || [ -z "$HITS" ]; then
  echo "(none added in range)"
else
  echo "$HITS added line(s) touch risk APIs — files:"
  for f in $(git diff --name-only "$RANGE" -- 'apps/**' 'packages/**'); do
    n=$(git diff "$RANGE" -- "$f" | grep -E "^\+" | grep -cE "$RISK" || true)
    [ "${n:-0}" != "0" ] && echo "- $f ($n)"
  done
fi
echo

# ---- 3 · complexity delta ------------------------------------------
echo "### Complexity delta (CCN +3 or crossing 15; .ts/.js only)"
BASE=$(git rev-parse "${RANGE%%..*}")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
found=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  ext="${f##*.}"
  git show "$BASE:$f" > "$TMP/base_file.$ext" 2>/dev/null || : > "$TMP/base_file.$ext"
  $LIZARD "$TMP/base_file.$ext" 2>/dev/null | awk 'NR>2 && $1+0>0 {print $NF"|"$2}' | sed 's/@.*|/|/' > "$TMP/base.idx" || true
  $LIZARD "$f" 2>/dev/null | awk 'NR>2 && $1+0>0 {print $NF"|"$2}' | sed 's/@.*|/|/' > "$TMP/head.idx" || true
  while IFS='|' read -r fn ccn; do
    [ -n "$fn" ] || continue
    case "$fn" in *anonymous*) continue ;; esac
    case "$ccn" in ''|*[!0-9]*) continue ;; esac
    base_ccn=$(grep -F "$fn|" "$TMP/base.idx" | head -1 | cut -d'|' -f2)
    base_ccn=${base_ccn:-0}
    case "$base_ccn" in ''|*[!0-9]*) base_ccn=0 ;; esac
    if [ "$ccn" -ge $((base_ccn + 3)) ] || { [ "$ccn" -ge 15 ] && [ "$base_ccn" -lt 15 ]; }; then
      echo "- $f :: $fn CCN $base_ccn -> $ccn"
      found=1
    fi
  done < "$TMP/head.idx"
done <<< "$CHANGED"
[ "$found" = "0" ] && echo "(no meaningful rises)"
