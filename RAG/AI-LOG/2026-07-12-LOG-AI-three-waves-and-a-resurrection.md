---
node_id: 2026-07-12-LOG-AI-three-waves-and-a-resurrection
tags:
  - AI-log
  - development-summary
  - delegation
  - undo
  - tags
  - design-kits
closed_tickets:
  - AI-IMP-264
  - AI-IMP-244
  - AI-IMP-279
  - AI-IMP-280
  - AI-IMP-281
  - AI-IMP-282
  - AI-IMP-283
  - AI-IMP-284
  - AI-IMP-285
created_date: 2026-07-12
related_files:
  - .codex/ASSIGNMENT-world-wave.md
  - .codex/outbox/world-wave.md
  - packages/persistence/src/migrations/0011-tag-unassign-suppression.ts
  - apps/desktop/src/renderer/undo/undo-stack.ts
  - RAG/design/ui-kits/home-canvas-ui-kit.zip
confidence_score: 0.92
---

# 2026-07-12-LOG-AI-three-waves-and-a-resurrection

## Work Completed

THREE WAVES CLOSED IN ONE SITTING — the lifecycle push (rev 0.70) is
now FULLY BUILT; main sits at 26f85021.

LOCKS ROUND 3 (264+244, main 7ed39d51): the amend round PROVED the
concurrent split-brain (~400ms overlapping tenure, timestamped) —
the rewritten `absent` disposition fell through to unlink and
deleted a fresh O_EXCL winner's live lock. Fix: absent → {removed:
true}, "never unlink after observing absence"; probe gained the
attempted-worker barrier + per-worker timestamps. Both incident
rules held their first outing: oracle conclusion QUOTED
(29186430052 success) before the push; no positional reverts needed.

GR WAVE (280→281→279→282, main ae147dd3): round 1 verified 7/7
citation spot-checks; rulings — Escape/scrim = Skip on the first-run
guide; mirror-ask dismissal dissolves (never answers); snapshot
outcome = LOSABLE app-settings fact voiced next boot; shared
FindingState owns only the quiet sentence; kit SVG extraction
sanctioned. Round 2 landed exits/voices/finding-states/pin-arc;
263/263 e2e; oracle 29191815500 success. Tickets arrived `planned`
with unchecked lists — lead closed after re-validating (verdict
codifies: check what YOU validated; either reading defensible,
prefer the prior one). CHANGELOG backfilled the trust/locks waves'
owed entries.

WORLD WAVE (285→284→283, main 26f85021): round 1 was the strongest
yet — killed a stale ticket delta (AI-IMP-233 had ALREADY repaired
the relink-create inverse; verified in source) and surfaced that
mirror provenance has no schema home → ruled the inert-superset
predicate (suppression written for any active image-backed node;
only read when sync offers that exact triple). Round 2: migration
0011 `tag_unassign_suppression` (STRICT, node-scoped PK); assign
lifts universally; planner excludes by triple key (same-hash
sibling pinned); RestoreRecord→RelinkBrokenLinks one-group verb;
session phantom drafts; delay-all birth carry (nothing durable
until seat; committedCount-guarded rollback; carry survives refusal
and speaks — the 282 failed-pin precedent); typed birth metadata
drives the SOLE §10.2 navigating undo (navigate-then-apply, redo
never navigates). 267/267 e2e, 658 persistence; oracle 29204912740
success.

THE RESURRECTION INCIDENT (lead collateral, diagnosed and half
repaired): the owner's RAG reorg (audits→RAG/audits, design→archive)
had UNCOMMITTED delete-halves; the locks-rollback repair at 03:03
(Revert+Reapply pair) re-created all 16 old-path files (birthtimes
03:03, byte-identical copies verified). Nothing lost. Lead re-did
the audits delete-half: 6 root duplicates removed, RAG/.loc-reviews
.tsv's 42 refs sed'd to RAG/audits/, CLAUDE.md pointer fixed —
UNCOMMITTED by owner instruction; he sorts the design side and
hands over the clean state to commit. LESSON: uncommitted deletions
are one history operation from resurrection; the reorg commit is
the fix.

ALSO: home-canvas UI kit landed (reservation frame + charm halo
invariants; KIT-PREFLIGHT audit checklist is new standard); lead
review ran (preflight claims verified; Dock still has 11 native
controls — "beta sweep" is real; AI-IMP-190 gets its design; zoom
ruled dock-resident after the corner experiment) then HELD at owner
request pending the finished kit + design-team ratification log.
Held findings: scratchpad/home-canvas-kit-review-held.md (session
b2fd8973). Codex sandbox recommendation delivered: profile with
workspace-write + writable_roots (clone home + .codex/inbox only),
exclude /tmp writes, move clones to ~/codex-clones — motivated
DOUBLY by the midnight tmp-cleaner (observed gutting a stale clone
at 00:00) and the home-dir trust grant found in config.toml.
Fable extension through Jul 19 + second Max-20 recorded.

## Issues Encountered

- Cwd-relative git pathspecs bit AGAIN (diffs run from .codex/
  returned false-empty for real changes). Rule: anchor pathspecs
  (`:/path`) or verify cwd = repo root before trusting any empty
  diff. Second occurrence; treat empty diffs as suspect, not clean.
- GR tickets arrived planned/unchecked (deviation from prior waves)
  — resolved in the verdict, not a defect; world wave arrived
  closed-with-checked per the standard.
- World-wave clone frictions (recorded from the agent's candid
  notes): fresh clones need root deps at first build AND
  spike/node_modules at the final gate; an e2e helper emits
  `ambiguous argument 'main'` in clones without a local main
  (agent created one clone-locally — right call, consider fixing
  the helper); one first-launch worker-startup e2e timeout (retry
  green) joins the standing source-panel flake on the watch list
  (AI-IMP-269 scope).
- zsh nits: `echo ===` breaks (glob), grep -v with `^+++` patterns
  hits ugrep syntax — quote or restructure.

## Tests Added

Via merges: GR wave (first-run exit paths, mirror dismissal, search/
gallery/trash/outline finding states, pin lifecycle incl. re-click
disarm; desktop e2e 258→263). World wave (suppression write/lift
units, planner triple exclusion + same-hash sibling, phantom draft
map, birth carry/rollback/navigating-undo stack tests, R6
close-reopen e2e pin; persistence 652→658, desktop e2e →267).
Undo-policy matrix diff updated for the one sanctioned flip.

## Next Steps

- Kit one-object review when the owner's design push completes
  (held findings at the scratchpad path above: ratification writes
  RFC §8.8.3/8.8.4 — cited but nonexistent; KIT-PREFLIGHT template
  into RAG/templates; arrange-popover gap needs a home; then the
  implementation tickets: reservation-frame tokens, halo clearance,
  dock beta-controls retirement, defaults row, restyle panel,
  AI-IMP-190 update).
- Owner-pending: clean-state RAG reorg commit (lead's audits
  delete-half is sitting uncommitted in the tree); v0.24.x
  patch-tag call — EIGHT landed workstreams unshipped to testers;
  kit 1.3/1.4 ledger; solo-vs-bulk trash unification (221 notes).
- Sandbox move before next wave: owner edits config.toml (profile
  sketch delivered in-session), then PROTOCOL.md + brief template
  name ~/codex-clones as clone home.
- Cleanup owed: world-wave clone (post next-wave standup); old
  /private/tmp remnants (epic-028, imp-250-252, imp-266,
  windows-249 ×2, helper-audit ×2, expanding-worlds-audit) —
  verify landed, then sweep.
- iPad thinking approaches (owner signal); V2 sketch in
  DESIGN-QUEUE; kit density tokens already speak its language.
