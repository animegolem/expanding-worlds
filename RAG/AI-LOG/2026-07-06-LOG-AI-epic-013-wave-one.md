---
node_id: 2026-07-06-LOG-AI-epic-013-wave-one
tags:
  - AI-log
  - development-summary
  - takeover
  - outline
  - theming
closed_tickets:
  - AI-IMP-068
  - AI-IMP-069
  - AI-IMP-072
  - AI-IMP-075
created_date: 2026-07-06
related_files:
  - RAG/AI-EPIC/AI-EPIC-013-global-views.md
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.9
---

# 2026-07-06-LOG-AI-epic-013-wave-one

## Work Completed

EPIC-013 (global views) activated: eight IMPs cut (068–075) from
the ten FRs after the usual seams-first discussion, and wave one
closed — four of eight tickets, all gates green at every close.

Lead-built: **068 takeover framework** (chrome/takeover.ts store,
TakeoverLayer at z-9 — ABOVE charms/pin/panels, BELOW the chrome,
because the originating charm is one of the two mandated ways back;
ChromeLayer retires its board-scoped children under a takeover
while rail + toasts stay; engagement gains holdEngagement; every
board shortcut seam guards on takeoverActive(); ▤ and ☰ live, ☰
menu carries Settings + deferred End session/Export) and **069
outline view** (getOutlineTree projects every active canvas FLAT —
cycles are view work per invariant 19, resolved as alias rows that
fly to the first real entry; listLooseNotes beside listNodeLibrary
unplaced feeds the root loose bin, root node excluded VIEW-side
because a unit pins it inside the library; filter chips content-
less · disconnected · one-tag with custom completion; the §7.4 row
grammar extracted to rows/NodeRow.svelte, consumed by UsesList
with zero testid/controller diffs). Agent-built: **072 lens**
(claude worktree agent — Lens beside Selection in the engine,
alpha-multiply dim, intersect-on-apply, Escape peels gesture →
lens → selection; the selection-clears-on-bare-Escape behavior
change was flagged by the agent and accepted at review) and **075
theme tokens** (Codex — full renderer sweep to --ew-* custom
properties, dark/light/glass with darwin-gated vibrancy IPC and
dark fallback, a no-raw-color scan unit allowlisting only
theme.css/theme.test.ts, applyTheme + __ewTheme hook for 074).

RFC rev 0.24: session snapshots — git as the history backend at
the rev 0.23 end-session boundary (git-ready project dirs, WAL
checkpointed at close; per-project off · commit · commit+push; the
snapshot INCLUDES the regenerated vault mirror so history carries
readable note diffs — owner addition; iCloud stays a location
choice). Owner tooling: the idle bell now skips rings while
TypeWhisper/localspeechrecognition are actively inferring (CPU
test, not process-exists). The RAG work-tracking process is now a
reusable user-level Claude skill (~/.claude/skills/
rag-worktracking) with the templates and index script bundled.

## Session Commits

a93b829 (IMP cut 068–075) → 94d0967 (068) → 8db4024 (072, agent
branch ff) → c6cf1d2 (072 close) → ea4928e (RFC 0.24) → f75b41c
(069 WIP checkpoint) → cd5d88f (075, fetched from Codex's clone) →
d4efc53 (075 merge + close) → e37bd2d (069 close). Final gates: 56
desktop e2e (52 → 56: outline, 2×lens, theme), 11 desktop units,
379 persistence, 253 canvas-engine, lint, build.

## Issues Encountered

**Native `<datalist>` SEGFAULTS Electron's main process** when its
autocomplete popup opens against a hidden window (our e2e mode) —
deterministic, took the whole app down mid-test and explained both
the owner's "reopen Electron?" dialog spam and crash reports from
yesterday's runs. Custom completion list instead; repo rule: no
datalist, ever. **The Codex worktree was auto-cleaned mid-flight**:
codex:codex-rescue is a thin forwarder whose harness worktree is
removed (unchanged) the moment the wrapper's launch turn ends,
orphaning the directory before Codex writes; Codex recovered into
/private/tmp clone, and the lead fetched its commit from there,
merged, and supplied the validation its clone couldn't run
(Electron SIGABRT there — its e2e never launched; the theme e2e
needed one probe fix: it measured the transparent dock-stack
wrapper, not the themed dock-row). A protective 069-WIP commit
landed while the orphaned dir briefly made main-repo git ops a
hazard. Worktree agents again needed electron-binary repair — the
documented install.js recipe did NOT work; the lens agent copied
dist/ from the pnpm store (update future briefs). 072's reviewer
flag (bare Escape clears selection) accepted as standard canvas
semantics.

## Tests Added

outline.spec (tree/alias/bin/filters, 1), lens.spec (2, via
__ewDebug lens hooks), takeover test + theme test in shell.spec,
lens.test.ts (10 engine units), theme.test.ts (raw-color scan +
applyTheme units), getOutlineTree/listLooseNotes persistence units
(4). Suites migrated, not weakened: UsesList through NodeRow with
zero e2e diffs.

## Next Steps

Wave two: 070 outline placement flows (agent-able; retires
PlacementSourcePanel), 071 tag panel (wires the lens toggle via
the host seam — two 072 checklist items ride on it), 073 search +
quick-open (⌕ goes live, Mod+P), then lead 074 settings takeover
(NOTE: a project `settings` table and an UNDOABLE SetTrashRetention
command already exist — reconcile the ticket's non-undoable channel
with that precedent before building). Owner eyeball pending on
light-theme legibility over art. Brief future worktree agents with
the corrected electron repair (copy dist/ from the pnpm store) and
pre-sync worktrees to main at spawn. Session snapshots (rev 0.24)
and the end-session surface remain deferred-with-scope for a later
epic.
