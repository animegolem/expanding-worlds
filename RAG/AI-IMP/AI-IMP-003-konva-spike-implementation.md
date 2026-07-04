---
node_id: AI-IMP-003
tags:
  - IMP-LIST
  - Implementation
  - spike
  - konva
kanban_status: planned
depends_on: AI-EPIC-001, AI-IMP-001
parent_epic: [[AI-EPIC-001-renderer-spike]]
confidence_score: 0.75
date_created: 2026-07-03
date_completed:
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

- [ ] Implement mount/unmount with camera transform and DPR-correct sizing.
- [ ] Implement tiled map rendering with zoom-appropriate tile selection and culling.
- [ ] Implement image placements, pins, and label rendering.
- [ ] Implement marquee, multi-drag, Transformer-based resize/rotate, and snapping guide overlay ops.
- [ ] Implement highlight mode and background set/replace/edit/reset/remove ops.
- [ ] Implement the decoration suite (text, shapes, freehand, lines, arrows, anchored connectors, grouping, lock, hide, ordering).
- [ ] Run run-all; confirm results JSON complete and heap returns to baseline after unmount.
- [ ] Record effort/friction notes for the decision report.

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
