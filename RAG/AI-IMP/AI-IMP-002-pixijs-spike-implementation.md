---
node_id: AI-IMP-002
tags:
  - IMP-LIST
  - Implementation
  - spike
  - pixijs
kanban_status: planned
depends_on: AI-EPIC-001, AI-IMP-001
parent_epic: [[AI-EPIC-001-renderer-spike]]
confidence_score: 0.75
date_created: 2026-07-03
date_completed:
---

# AI-IMP-002-pixijs-spike-implementation

## PixiJS adapter covering the full spike scenario

PixiJS is the RFC §13 preferred renderer but unproven against the
§12.3 workload. Implement the `RendererAdapter` from AI-IMP-001 in
PixiJS so every scenario runs and records metrics. Done means: run-all
completes on the PixiJS adapter with results written, including clean
memory release after unmount.

### Out of Scope

Konva (003), the decision report (004), any editor-grade polish —
interactions need to be representative, not shippable.

### Design/Approach

Pixi Application with a world container under camera transform; tile
pyramid as a culled sprite grid swapping resolution by zoom; images
and pins as sprites/graphics with a labels layer; marquee, drag,
resize/rotate handled through pointer events feeding the shared op
scripts; highlight via filters or overlay graphics; smart-guide lines
drawn in an overlay container. Texture eviction through
`destroy(true)` on swap; verify release via the harness heap check.
Note implementation-effort observations as input to 004.

### Files to Touch

`spike/src/adapters/pixi/*.ts`: adapter implementation.
`spike/package.json`: add pixi.js dependency.
`spike/src/main.ts`: register adapter in the picker.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Implement mount/unmount with camera container and DPR-correct resize.
- [ ] Implement tiled map rendering with zoom-appropriate tile selection and culling.
- [ ] Implement image placements, pins, and label rendering.
- [ ] Implement selection marquee, multi-drag, resize, rotate, and snapping guide overlay ops.
- [ ] Implement highlight mode and background set/replace/edit/reset/remove ops.
- [ ] Implement the decoration suite (text, shapes, freehand, lines, arrows, anchored connectors, grouping, lock, hide, ordering).
- [ ] Run run-all; confirm results JSON complete and heap returns to baseline after unmount.
- [ ] Record effort/friction notes for the decision report.

### Acceptance Criteria

**Scenario:** Full spike run on the PixiJS adapter.
**GIVEN** AI-IMP-001's harness with the fixed seed.
**WHEN** run-all executes with the PixiJS adapter selected.
**THEN** all scenarios complete without errors and write metrics.
**AND** post-unmount heap sampling shows texture memory released.
**AND** interaction scenarios maintain measurable frame data at the 300-image and 1,000-pin loads.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
