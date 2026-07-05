---
node_id: LOG-2026-07-04-canvas-board-loop
tags:
  - AI-log
  - development-summary
  - canvas
  - renderer
  - pixijs
closed_tickets: [AI-IMP-017, AI-IMP-018, AI-IMP-019, AI-IMP-020, AI-IMP-021, AI-IMP-022, AI-IMP-023, AI-EPIC-004]
created_date: 2026-07-04
related_files:
  - packages/canvas-engine/src/
  - apps/desktop/src/renderer/canvas/
  - apps/desktop/e2e/
  - packages/persistence/src/handlers/pin.ts
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.9
---

# 2026-07-04-LOG-AI-canvas-board-loop-epic

## Work Completed

Executed AI-EPIC-004 end to end: the visual board loop is live.
Lead-built interface tickets: AI-IMP-017 (PixiJS 8 scene projection in
@ew/canvas-engine — three §4.4 planes, identity-preserving SceneSync,
renderer registry seam, `getCanvasScene` one-round-trip read model,
`ew-asset://` content-addressed blob protocol in main) and AI-IMP-018
(the §13.1 Canvas Controller — camera/selection/hit-test/state
machine, the gesture contract committing exactly one TransformContent
per completed gesture, SetCanvasCamera inverse-null persistence,
SnapProvider seam, CommandGateway revision threading).

Three parallel agents (019 gestures+labels, 020 CreatePin composite +
every §6.1 import surface, 021 decoration schemas/renderers/tools)
merged with one real conflict (CanvasHost.svelte, composed); wave-2
agent 022 delivered the real SnapProvider, align/distribute (one
command each, idempotent), zoom-to-fit/selection, and the full §6.7
background lifecycle with its explicit edit mode. Lead 023 closed
with viewport culling + residency-driven lazy textures behind a
refcounted TextureBudget, ImageBitmap-sliced tile pyramids for
oversized backgrounds (live-verified against a 17,000 px original),
canvas swap with full memory release, the §12.1 perf harness (refuses
software GL; p95 < 25 ms tripwire across 500 pins / 150 images /
1,000 icons + 300 decorations), and the consolidated §17 slice spec
(items 2–6, 9–10, 17–19).

Lead integration work between merges: `listTags` + `listNotes.nodeCount`
queries (closing 020's flagged gaps), single-sourcing the `__ewDebug`
e2e declaration (a TS2717 trap all three wave-1 branches tripped
independently), live `handle.canvasId` + `controller.setCanvas` (the
stale-canvas latency canvas swapping would have exposed in EPIC-006).

## Session Commits

- 2ed1b3b epic cut into IMP-017..023
- 48a9415 IMP-017; 9483745 IMP-018 (lead); b981b36/f3f18aa seams
- f3fcfc5 / 9df7f10 / b69ee4f wave-1 merges (019, 020, 021, reviewed)
- 903662d query-gap fixes; 4113fe9 wave-1 closure
- fc85e03 IMP-022 merge; f31f460 close
- IMP-023 + epic close commit follows this log

## Issues Encountered

- All three wave-1 agents hit a session limit mid-ticket again;
  worktrees + SendMessage resumption completed each with zero rework
  (second epic in a row — the isolation model is load-bearing).
- Playwright `waitForFunction` with an ASYNC predicate passes
  vacuously (a Promise is truthy): produced a false-green camera test
  and would have masked the debounce race. Use `expect.poll`. Now in
  CLAUDE.md.
- The stale-dist trap fired once more (utility bundle builds from
  persistence dist): `pnpm -r build` before desktop e2e, always.
- openCanvas leaked the texture set on swap (scene cleared without
  firing residency-leave hooks); caught by the perf e2e's
  zero-resident-bytes assertion, fixed with an empty cull pass first.
- canvas.toBlob PNG bytes are not deterministic across calls — the
  "original untouched" proof is a SHA-256 round-trip via ew-asset://.
- Deferred with recorded scope: disk-cached tile/thumbnail derivatives
  (needs a Node image codec; renderer-side ImageBitmap slicing serves
  §12.2 meanwhile), grid/pack (§6.9), item 19's cross-canvas undo
  (EPIC-007), a host-level input arbiter for capture-phase overlay
  modules (gestures-ui/board-tooling registration-order coupling noted
  by the 022 agent).

## Tests Added

154 canvas-engine tests across 19 files (was 0 at epic start), 16 new
persistence tests (pin composite, scene query, listTags/nodeCount,
canvas-text FTS shape), 15 desktop e2e across 7 specs — including the
§12.1 perf suite and the §17 slice run. Final gates: 336 persistence /
154 engine / 36 domain / 17 commands, 15/15 e2e, lint clean.

## Next Steps

EPIC-005 (notes, links, phantoms UI) is next: CodeMirror 6 note shell,
wiki-link autocomplete/rendering, phantom materialization, Uses
sidebar — the domain machinery (links, sweeps, phantom projection,
quickOpen/search queries) is complete and query-backed. EPIC-006
consumers get `handle.openCanvas` + camera persistence already working
(navigation history/bookmarks UI remains). EPIC-007 gets inverses from
every canvas command (TransformContent/CreatePin round-trips are
tested); the in-memory undo stack and inverse-null skipping are
specified in §10.2/invariant 31. Read RAG/INDEX.md and the EPIC-005
file before cutting IMPs; keep agent briefs carrying the
pnpm-build-before-tests and expect.poll notes.
