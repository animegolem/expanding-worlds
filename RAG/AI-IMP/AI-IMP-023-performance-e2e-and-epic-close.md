---
node_id: AI-IMP-023
tags:
  - IMP-LIST
  - Implementation
  - performance
  - e2e
  - canvas
kanban_status: planned
depends_on: [AI-IMP-019, AI-IMP-020, AI-IMP-021, AI-IMP-022]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.7
date_created: 2026-07-04
date_completed:
---

# AI-IMP-023-performance-e2e-and-epic-close

## Summary of Issue #1

With the interaction loop merged, nothing yet enforces the §12.1
engineering targets or §12.2 renderer requirements (culling, lazy
textures, eviction, tiled oversized backgrounds, memory release on
swap), and the epic's success metrics — §17 slice items 2–6, 9–10,
17–19 end to end and one-durable-command-per-gesture command-log
assertions — need a consolidated proof on merged master. Lead-built
close ticket. Done means: perf scenarios hold on the development
machine with hardware GL, the slice e2e suite passes, and AI-EPIC-004
closes with all FRs checked.

### Out of Scope

Real thumbnail/derivative generation (DerivativeGenerator remains a
recorded no-op from EPIC-003; resolution-appropriate derivatives
beyond background tiling stay deferred with that scope). Fast-return
navigation history (§8.1, EPIC-006). Undo stack UI (EPIC-007).
Product-level performance guarantees (§12.1: engineering targets
only).

### Design/Approach

Culling: sceneSync marks content-plane items outside the padded
viewport non-renderable each camera change (cheap AABB pass; Pixi
`renderable=false` keeps the display map intact). Lazy textures: the
placement renderer requests a texture only when its item first enters
the padded viewport; a TextureBudget owns explicit texture lifetime
(spike carry-forward: ownership outside Pixi's global caches) with an
LRU byte budget and eviction back to placeholder fills; canvas swap
releases the whole set (§12.2 memory release). Oversized backgrounds:
originals larger than the GPU texture cap are sliced at import-read
time into a tile pyramid rendered per zoom level (tiles generated in
the utility process next to the existing import pipeline seam,
cached under the project's derivatives dir; original stays canonical
§6.7). Perf harness: a Playwright spec seeds §12.1 scenes through the
service (500 pins, 150 visible images, 1,000 stress icons, several
hundred mixed decorations), drives pan/zoom/marquee/multi-drag via
CDP input, and reads a frame-time probe from the Pixi ticker exposed
on `__ewDebug`; thresholds assert no interaction collapse (p95 frame
time bound) — benchmark lesson applies: assert
hardware-accelerated GL in-app and fail loudly on SwiftShader rather
than record meaningless numbers. Slice e2e: one spec per §17 item in
scope (2–6, 9–10, 17–19) composed from the per-ticket e2e helpers,
each gesture asserted against the command log. Close: FR checkboxes,
epic completion, INDEX regen, AI-LOG.

### Files to Touch

`packages/canvas-engine/src/{culling.ts,texture-budget.ts}` (+ tests): viewport culling + texture lifetime/eviction.
`packages/canvas-engine/src/renderers/{placement.ts,background.ts}`: lazy texture requests; tiled background rendering.
`packages/persistence/src/import/derivatives.ts` (+ tests): background tile pyramid generation behind the existing seam.
`apps/desktop/src/utility/index.ts`: tile generation request wiring if needed.
`apps/desktop/src/renderer/canvas/host.ts`: swap/release path, GL-mode + frame-probe debug surface.
`apps/desktop/e2e/perf.spec.ts`: §12.1 scenarios.
`apps/desktop/e2e/slice.spec.ts`: §17 items 2–6, 9–10, 17–19.
`RAG/AI-EPIC/AI-EPIC-004-canvas-board-loop.md`: close.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Culling pass on camera/content change: off-viewport items non-renderable, re-entering items restored; unit tests over synthetic scenes incl. rotated bounds and padding hysteresis.
- [ ] TextureBudget: explicit acquire/release keyed by content hash, LRU eviction under a byte budget, eviction downgrades sprites to placeholder; unit tests for budget math, LRU order, double-acquire refcount.
- [ ] Lazy loading: textures requested on first viewport entry only; canvas swap releases all textures and empty GPU residency verified via debug counters in e2e (open large canvas → swap away → budget reports zero resident bytes).
- [ ] Background tiling: pyramid generation for originals exceeding the GPU cap (detect cap at runtime; test fixture uses a synthetic large image), per-zoom tile selection in the background renderer, original untouched; unit tests for level selection and tile addressing; recorded-derivative rows reuse the derivative_jobs seam.
- [ ] Perf spec: seed §12.1 scenes via service; assert hardware GL (fail with clear message on SwiftShader); p95 frame-time thresholds during pan/zoom/marquee/multi-drag for 500 pins, 150 images, 1,000 icons, mixed-decoration scene; memory-release assertion on swap.
- [ ] Slice spec covering §17 items 2, 3, 4, 5, 6, 9, 10, 17, 18, 19 (item 19's cross-canvas-undo clause deferred to EPIC-007 — note in spec) with command-log gesture assertions throughout.
- [ ] Verify epic success metrics, check FR-1..FR-10 in AI-EPIC-004 honestly (deviations documented), set epic completed, run `./RAG/scripts/generate-index.sh`.
- [ ] Full gates green on merged master: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint`, desktop e2e incl. perf + slice specs.
- [ ] Session AI-LOG entry written.

### Acceptance Criteria

**Scenario:** §12.1 targets and the slice hold on merged master.
**GIVEN** a project seeded with 500 pins, 150 visible images, and 1,000 stress icons across canvases.
**WHEN** the perf spec pans, zooms, marquee-selects, and multi-drags on hardware GL.
**THEN** p95 frame time stays under the interaction-collapse threshold in every scenario.
**AND** swapping canvases returns texture residency to zero.
**WHEN** an oversized background beyond the GPU texture cap is set.
**THEN** it renders tiled at every zoom level with the original asset unmodified.
**WHEN** the slice spec runs items 2–6, 9–10, 17–19.
**THEN** every continuous gesture appears as exactly one durable command in the command log and the epic closes with all FRs checked.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
