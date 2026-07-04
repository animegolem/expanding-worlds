---
node_id: LOG-2026-07-04-domain-persistence-core
tags:
  - AI-log
  - development-summary
  - persistence
  - domain
  - sqlite
closed_tickets: [AI-IMP-009, AI-IMP-010, AI-IMP-011, AI-IMP-012, AI-IMP-013, AI-IMP-014, AI-IMP-015, AI-IMP-016, AI-EPIC-003]
created_date: 2026-07-04
related_files:
  - packages/persistence/src/
  - packages/commands/src/
  - packages/domain/src/
  - packages/protocol/src/index.ts
  - apps/desktop/src/utility/index.ts
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.9
---

# 2026-07-04-LOG-AI-domain-persistence-core-epic

## Work Completed

Executed AI-EPIC-003 end to end: the authoritative project service
now lives behind the Project API. Lead-built interface tickets:
AI-IMP-009 (node:sqlite chosen — passes in both ABIs we serve, system
Node for vitest and Electron 39's utility process; full §4 schema
with invariants pushed into storage: title_key uniqueness across
Trash, one-canvas-per-node, link-state CHECKs, root-protection
triggers; UUIDv7 + short codes; heartbeat writer lock) and AI-IMP-010
(envelope → versioned registry with upcaster chain → handler in one
transaction with revision bump + command_log; structured conflicts;
{affected, inverse} handler contract; coarse project-changed events;
Project API over utility IPC, proven by the desktop e2e end to end
from the sandboxed renderer).

Two parallel agent waves: 011 (notes/links/phantoms/sweep), 012
(structure commands + render_order), 014 (staged import) — then 013
(lifecycle/trash/purge/GC eligibility) and 015 (FTS5 + quick-open).
All five green on first full report; boundary discipline held every
time. Lead integration commit wired MakeNoteIndependent into the link
machinery (the planned cross-worktree TODO) and fixed its inverse,
which deleted the copied note while link rows still referenced it —
an FK violation waiting for the features to meet.

Lead-built AI-IMP-016: startup recovery on every open (§11.4),
cross-process lock and kill-during-import tests, and the consolidated
§5 invariant suite (rules 1–31 through the public service surface,
24–25/29–31 at data-contract level). RFC bumped to 0.7 with two
review-proven clarifications (aliased-token rename semantics,
linkable-title restriction).

## Session Commits

- 2ff5048 epic cut into IMP-009..016
- b799546 IMP-009; e865c93 IMP-010 (lead)
- 6ae12a6 / 870bfbe / dd9f7fd wave-1 merges (011, 014, 012, reviewed)
- 4fe5fa0 lead integration: MakeNoteIndependent link wiring
- 468fbde / b8fd924 wave-2 merges (015, 013, reviewed)
- e9aa089 IMP-016; a6515b0 RFC rev 0.7; closure commit follows

## Issues Encountered

- All three wave-1 agents hit a session limit mid-ticket; worktrees
  preserved everything and SendMessage resumption completed each with
  zero rework. The isolation model absorbed the interruption.
- Stale dist bites after every merge: vitest resolves workspace
  packages through dist/, so run `pnpm -r build` before judging test
  failures on freshly merged master (43 phantom failures once).
- vitest 2's bundled vite predates the node:sqlite builtin — upgraded
  vitest to ^4 workspace-wide.
- Raw Node cannot run tsc's extensionless ESM dist; process-test
  fixtures are esbuild-bundled at test time.
- fts5 integrity-check verifies external content only in its rank=1
  form; the bare form passed on a deliberately corrupted index.
- The predicted append-only merge conflicts (service.ts + package
  index files) appeared exactly as expected; both-sides resolution
  every time. Agents based on current master merged conflict-free.
- Deferred with recorded scope: real thumbnail generation (no-op
  behind DerivativeGenerator), worker_threads import offloading,
  export-lease GC guard (EPIC-008), thumbnail-existence recovery
  check (needs a real generator first).

## Tests Added

310 persistence tests across 26 files (was 38 at epic start), plus
domain 36 and commands 17. Highlights: the 32-test §5 invariant
suite; scripted §10.1 catalogue with monotonic revisions and a stale
conflict; real second-OS-process lock refusal; SIGKILL-during-import
recovery with clean re-import; FTS trigger consistency straight
through 013's purges with no handler cooperation.

## Next Steps

EPIC-004 (canvas & board loop) is next: PixiJS renderer, Canvas
Controller (§13.1), import surfaces calling service.importAsset,
gesture pipeline committing one command each, board tooling. The
domain core it needs is complete: every §10.1 structural command
exists with inverses, getCanvasContents feeds the display list in
render order, and project-changed events drive re-query. EPIC-005/007
consumers should note: handlers return inverses but the in-memory
undo stack does not exist yet (invariant 31), and CreateNode's
inverse is DeleteDraftNode while CreateNote's is the purge-safe
TrashNote. Read RAG/INDEX.md and the EPIC-004 file before cutting
IMPs; keep agent briefs carrying the pnpm-build-before-tests note.
