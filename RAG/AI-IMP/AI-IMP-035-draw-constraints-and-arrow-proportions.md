---
node_id: AI-IMP-035
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - feel
kanban_status: completed
depends_on: [AI-IMP-027, AI-IMP-031]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-035-draw-constraints-and-arrow-proportions

## Summary of Issue #1

Two owner findings (RFC rev 0.12, §6.8). (1) No Shift-to-canonical
while drawing: dragging a rect can't be constrained to a square,
lines/arrows can't be angle-locked. (2) The block arrow treats
strokeWidth as a pen when it is FORM: nothing limits thickness
against length (width 300 on a short segment renders a notched
blob — owner screenshot), and resizing an arrow scales endpoints but
never thickness, so scaled arrows lose their proportions. Done
means: Shift constrains shapes to canonical proportions and segment
kinds to 45° steps (preview and commit), arrow thickness clamps to a
fraction of length so any input stays arrow-shaped, and resize
scales arrow thickness uniformly (plain lines keep constant stroke
weight).

### Out of Scope

New arrow variants or schema changes; connector anchor behavior;
Shift semantics on freehand paths (no canonical form); grid or angle
guides rendering.

### Design/Approach

Draw tools: the shape/segment tool drag paths take modifiers already
(ToolManager forwards them) — Shift on shapes equalizes the dragged
extents (square/circle; triangle equilateral from the base width);
Shift on line/arrow/connector rotates the live endpoint onto the
nearest 45° ray from the start. Constraint applied in the tool's
update so the preview shows the constrained form and the commit
stores it. Arrow geometry: `arrowPolygon` computes effective
thickness = min(strokeWidth, length / 3) and derives head width/
length/clamp from the EFFECTIVE thickness, so extreme widths converge
on a proportioned stub. Resize: in the resize driver's decoration
branch, arrows also scale strokeWidth by the mean axis factor —
thickness is form for arrows; lines/paths/shapes keep their stroke
weight (annotation convention, unchanged).

### Files to Touch

`packages/canvas-engine/src/tools/draw-tools.ts` (+ tests): Shift
constraints in previews and commits.
`packages/canvas-engine/src/renderers/decorations/line.ts` (+
decorations.test.ts): effective-thickness clamp.
`packages/canvas-engine/src/hit-test.ts`: arrow bounds already use
arrowPolygon — verify clamp flows through (test only).
`packages/canvas-engine/src/gestures/resize.ts` (+ test): arrow
thickness scaling.
`apps/desktop/e2e/decorations.spec.ts`: shift-draw square + 45°
arrow.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Shape tool Shift: square/circle from the dominant drag axis;
      triangle equilateral; preview and committed data agree; unit
      tests.
- [x] Segment tools Shift: endpoint locked to nearest 45° ray;
      preview and commit agree; unit tests.
- [x] arrowPolygon effective thickness = min(strokeWidth, length/3);
      head factors derive from it; owner-screenshot repro (width 300,
      short segment) yields a proportioned arrow; unit tests update.
- [x] Arrow AABB via arrowPolygon reflects the clamp (test).
- [x] Resize scales arrow strokeWidth by the mean axis factor; lines
      unchanged; unit tests.
- [x] e2e: draw a rect with Shift → committed width === height; draw
      an arrow with Shift at ~50° → committed segment at exactly 45°.
- [x] Full gates: `pnpm -r build`, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist annotates with tidy geometry.
**GIVEN** the rect tool with Shift held
**WHEN** the artist drags any diagonal
**THEN** the preview and the committed shape are square.
**GIVEN** the arrow tool with Shift held
**WHEN** the artist drags at roughly 50°
**THEN** the arrow commits at exactly 45°.
**GIVEN** an arrow with strokeWidth 300 over a 150-unit segment
**WHEN** it renders
**THEN** the silhouette is a proportioned arrow (thickness ≤ 50), not
a blob.
**WHEN** any arrow is resized to twice its size
**THEN** its thickness doubles with it.

### Issues Encountered

<!-- Filled out post-work. -->
Clean. DrawSession gained an optional modifiers parameter (threaded
from ToolManager) so previews and commits share one constraint path;
the connector's end-anchor lookup now uses the constrained endpoint.
The arrow AABB inherits the clamp for free (it derives from
arrowPolygon since AI-IMP-029) — covered by the updated short-arrow
polygon test rather than a separate bounds test. Two low-frequency
full-suite load races remain on the epic's ledger (snap-guide
predicate; 120ms toolbar-refresh click class) — absorbed by the
configured retry, specs clean in isolation.
