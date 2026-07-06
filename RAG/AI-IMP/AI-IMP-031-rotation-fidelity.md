---
node_id: AI-IMP-031
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-019, AI-IMP-029]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-031-rotation-fidelity

## Summary of Issue #1

Three rotation findings from owner testing. (1) Bug: rotating a
shape orbits it around the pivot without spinning it — the rotate
gesture maps every stored coordinate pair (a shape's x/y is its
TOP-LEFT) but never touches the shape's own `rotation` field, which
the renderer already honors. (2) Fidelity: a rotated image's
selection chrome is the axis-aligned envelope, which balloons at 45°;
PureRef draws the box rotating WITH the image. Related: resize
anchors in world axes, which feels broken on a rotated item. (3) The
lollipop rotate handle is the only rotation affordance; PureRef's
corner-hover rotate cursor is the expected muscle memory. Done means:
shapes spin in place (and compose under multi-select pivots), single
-selection chrome and resize are oriented to the object, corner-hover
rotate works, and rotated shape bounds are rotation-expanded.

### Out of Scope

Text rotation (no schema field — group rotation keeps orbit-only for
text, recorded limitation); multi-selection oriented chrome (union
of mixed angles has no single frame — axis-aligned box stays);
precise rotated-rect hit-testing for shapes (AABB hit stays; only
bounds expand); snapping during rotation.

### Design/Approach

(1) rotate driver: shapes get a dedicated branch — rotate the CENTER
(x+w/2, y+h/2) about the pivot, write back top-left from the moved
center, and set rotation = (prior.rotation ?? 0) + delta. Other
decoration kinds keep coordinate-pair mapping. hit-test's shape
branch expands the AABB by |cos|/|sin| like placements so outline,
cull, marquee, and snap see the rotated extent.
(2) Chrome: when the selection is a single item with rotation
(placement, or shape decoration), drawSelection strokes the oriented
box via its four rotated corners, and gestures-ui places the eight
resize handles + rotate handle at rotated positions; hitHandle keeps
point-distance logic. Resize cursors map direction through the angle
(quantize handle angle to the 4 cursor axes). Resize driver, single
rotated item: transform pointer and anchor into the item's LOCAL
frame (rotate by −angle about the item center), scale width/height
there, transform the moved center back — the anchored-scaling
contract (opposite corner pinned) holds in the local frame.
Multi-selection paths are untouched.
(3) gestures-ui hitHandle adds four rotate zones just outside the
corner handles (offset along the corner diagonal, in the rotated
frame) mapping to the rotate driver with a rotate-ish cursor
(crosshair per AI-IMP-024 convention).

### Files to Touch

`packages/canvas-engine/src/gestures/rotate.ts`: shape spin branch.
`packages/canvas-engine/src/gestures/resize.ts`: local-frame path
for a single rotated item.
`packages/canvas-engine/src/hit-test.ts`: rotation-expanded shape
AABB; export orientedCorners helper for chrome.
`packages/canvas-engine/src/gestures/*.test.ts` + hit-test.test.ts:
spin, local resize, expanded bounds.
`apps/desktop/src/renderer/canvas/host.ts`: oriented outline in
drawSelection (single selection).
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: oriented handle
layout, angle-aware resize cursors, corner rotate zones.
`apps/desktop/e2e/gestures.spec.ts`: shape-spin + oriented-handles
assertions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] rotate.ts shape branch: center orbits pivot, rotation
      accumulates; unit tests for single-shape spin-in-place and
      multi-select compose; other kinds unchanged.
- [x] hit-test shape AABB rotation expansion (+ tests); export an
      orientedCorners(item) helper returning the 4 world corners for
      single-item chrome.
- [x] host drawSelection: oriented outline for a single rotated
      item; AABB otherwise.
- [x] gestures-ui: handles at oriented positions; rotate handle off
      the oriented top edge; angle-quantized resize cursors; corner
      rotate hover zones starting the rotate driver.
- [x] resize.ts: single rotated item resizes in its local frame
      (anchored scaling preserved); unit tests at 90° and 45°;
      multi-select behavior unchanged (tests stay green).
- [x] e2e: rotate a shape 90° with the rotate handle → data.rotation
      ≈ π/2 and top-left unchanged (single selection); handles()
      report oriented positions for a rotated image; resize of a 90°
      -rotated placement changes the expected local dimension.
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, §12.1
      perf, lint; owner feel pass on rotate/resize of rotated
      images.

### Acceptance Criteria

**Scenario:** Artist rotates and adjusts board content.
**GIVEN** a single selected rectangle shape
**WHEN** the artist drags the rotate handle 90°
**THEN** the rectangle spins about its own center (no orbit) and
commits one durable command with data.rotation ≈ π/2.
**GIVEN** a single selected image rotated 45°
**WHEN** the artist looks at the selection
**THEN** the outline and handles hug the oriented box, not the
axis-aligned envelope.
**WHEN** the artist drags the (rotated) east handle
**THEN** the image widens along its own axis with the opposite edge
pinned.
**WHEN** the artist hovers just outside a corner
**THEN** the rotate cursor appears and dragging rotates.

### Issues Encountered

<!-- Filled out post-work. -->
Gates item stays open pending the owner feel pass on rotated
rotate/resize (everything else validated: 201 engine tests, 19/19
e2e twice consecutively, lint, perf suite). Notes: the resize
anchored-scaling contract measures from the OPPOSITE edge — two of
my own test expectations initially doubled the corner instead;
handles() report canvas-local coordinates (mouse math must add the
canvas box). Full-suite e2e flake root-caused: under 19-sequential-
Electron load, BoardToolbar's 120ms debounced refresh can swallow a
click and slow launches outrun 5s polls — specs pass reliably alone
(3x repeat). playwright.config gains retries: 1 (regressions still
fail twice); the debounced-toolbar-refresh click race is recorded
debt for whenever the §8.2 chrome pass touches toolbars. Text
decorations under group rotation orbit without spinning (no rotation
field) — recorded limitation per ticket scope.

Owner feel pass landed 2026-07-06: resize on rotated content feels
fine, but (1) the rotate cursor state never appears on corner hover
— the acceptance scenario's "rotate cursor appears" line is not met
in practice — and (2) the rotate hover zone is too narrow to find
by feel; pad it. Both fixed under this ticket before close.
