---
node_id: AI-IMP-003
tags:
  - IMP-LIST
  - Implementation
  - spike
  - konva
kanban_status: completed
depends_on: AI-EPIC-001, AI-IMP-001
parent_epic: [[AI-EPIC-001-renderer-spike]]
confidence_score: 0.75
date_created: 2026-07-03
date_completed: 2026-07-03
---

# AI-IMP-003-konva-spike-implementation

## Konva adapter covering the full spike scenario

Konva is the RFC §13 fallback candidate, attractive for its built-in
editor interactions (Transformer, dragging, hit graph). Implement the
same `RendererAdapter` so both candidates produce comparable metrics.
Done means: run-all completes on the Konva adapter with results
written, including clean memory release after unmount.

### Out of Scope

PixiJS (002), the decision report (004), editor-grade polish.
Scenario parity with 002 matters more than idiomatic-best Konva.

### Design/Approach

Konva Stage with layered structure mirroring the RFC render planes;
tile pyramid as culled Konva.Image nodes; use Konva's built-in
draggable, Transformer, and hit detection where natural — the point of
this candidate is measuring how much interaction work comes free.
Labels as Konva.Text; guides on a dedicated overlay layer; explicit
`destroy()` on swap for the memory-release check. Record where
built-ins had to be fought or replaced, as effort input to 004.

### Files to Touch

`spike/src/adapters/konva/*.ts`: adapter implementation.
`spike/package.json`: add konva dependency.
`spike/src/main.ts`: register adapter in the picker.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Implement mount/unmount with camera transform and DPR-correct sizing.
- [x] Implement tiled map rendering with zoom-appropriate tile selection and culling.
- [x] Implement image placements, pins, and label rendering.
- [x] Implement marquee, multi-drag, Transformer-based resize/rotate, and snapping guide overlay ops.
- [x] Implement highlight mode and background set/replace/edit/reset/remove ops.
- [x] Implement the decoration suite (text, shapes, freehand, lines, arrows, anchored connectors, grouping, lock, hide, ordering).
- [x] Run run-all; confirm results JSON complete and heap returns to baseline after unmount.
- [x] Record effort/friction notes for the decision report.

### Acceptance Criteria

**Scenario:** Full spike run on the Konva adapter.
**GIVEN** AI-IMP-001's harness with the fixed seed.
**WHEN** run-all executes with the Konva adapter selected.
**THEN** all scenarios complete without errors and write metrics.
**AND** post-unmount heap sampling shows node/canvas memory released.
**AND** the same fixture checksums as the PixiJS run confirm input parity.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Registration landed in `spike/src/registry.ts` (the harness's lazy-import
registry pattern), not `main.ts` as the Files-to-Touch list predicted —
`main.ts` builds its picker from the registry automatically. konva 10.3.0
is dynamically imported inside the factory; Vite code-splits it into its
own ~185 kB chunk, so the base bundle stays lean.

**What Konva gave for free.** No render loop to write: mutate node attrs
and Konva auto-batch-draws the affected layer. DPR handling is automatic
(`Konva.pixelRatio`). `Konva.Arrow` gave arrowheads for free. `stage.destroy()`
plus Konva 10's `releaseCanvasOnDestroy: true` default released canvas
memory cleanly on unmount (swap-and-return heap: start 8.5 MB, peak
14.2 MB, end 11.3 MB). The scene-graph niceties — `moveToTop`/`moveToBottom`
for ordering, `visible()`, per-node `opacity()` for highlight dimming,
group transforms for the camera — all mapped 1:1 onto ops. The hit graph
was kept enabled on the content layer as it is a headline feature, but
note it means Konva paints a second (hit) canvas for content on every
frame — an inherent tax of that convenience.

**What had to be fought or hand-built.** (1) Transformer semantics
mismatch: the spec (and RFC gesture model) wants per-item scale/rotate
about each item's own center; Konva's Transformer transforms the combined
bounding box about a common anchor. It ended up as free selection-handles
UI that auto-tracks node changes, while the actual transforms are applied
manually per item — so the marquee/select/resize/rotate math was
hand-written anyway. Transformer also lives *in* the node tree (added to
the content group) and needs `moveToTop()` re-asserted after
`bringToFront`/`addDecoration`. (2) Konva rotations are degrees; the op
vocabulary is radians — conversion sprinkled everywhere (left the
`angleDeg` global alone to avoid cross-adapter state). (3) No region
query against the hit graph: marquee intersection tests are hand-rolled
AABB math (Konva only offers point `getIntersection`). (4) Camera,
viewport tile culling, connector endpoint tracking, and label placement
are all manual — same as any candidate. (5) Typing nit: `Image.setAttrs`
demands the full `ImageConfig` (rejects a partial without `image`), so
individual setters were used.

**Benchmark blind spot worth flagging for AI-IMP-004:** Konva's biggest
selling points — built-in `draggable`, pointer events, real Transformer
interaction — are driven by DOM pointer events, and the harness drives
programmatic ops instead, so this benchmark cannot measure the thing
Konva is best at. The numbers here measure Konva as a plain renderer.

**Numbers (seed 20260703, 120 Hz machine, results/konva-seed20260703.json).**
All 10 scenarios ok, no page errors. Mostly vsync-bound (~8.3 ms avg).
Outliers: pins-1000-labels p95 16.7 ms / max 25.3 ms (2000+ nodes,
scene + hit canvas each frame); swap-and-return max 91.6 ms single-frame
spike rebuilding 300 `Konva.Image` nodes on `loadScene`.

No harness bugs found. Validated via `npm run build` (strict tsc) and
`npx playwright test` (konva + smoke both green).
