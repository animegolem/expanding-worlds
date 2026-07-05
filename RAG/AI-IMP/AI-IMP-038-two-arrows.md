---
node_id: AI-IMP-038
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - decorations
  - feel
kanban_status: planned
depends_on: [AI-IMP-035]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-038-two-arrows

## Summary of Issue #1

Alignment pause with the owner (RFC rev 0.13, §6.8): one arrow kind
was being stretched across two incompatible mental models — a pen
stroke for pointing and a shape that scales with its box — and the
IMP-035 thickness-on-resize coupling was a patch on the wrong model.
The Baseline UI Vision's tool rail already separates them. Done
means: the ANNOTATION ARROW reverts to pure pen semantics (head from
thickness with tunable proportion constants, thickness constant
under resize like lines, degenerate clamp kept), and a new ARROW
SHAPE ShapeKind variant renders a block silhouette filling its
bounding box — inheriting shape scaling, rotation, oriented chrome,
fill/stroke, and Shift-canonical drawing (2:1 box) for free — with a
toolbar button until the shapes palette exists.

### Out of Scope

The hold-to-open shapes palette (chrome era, §8.2 vision); arrow
head-style variants; connector heads; migrating existing annotation
arrows.

### Design/Approach

decoration-data: ShapeKind gains 'arrow' (validator union). Shape
renderer: 'arrow' draws a 7-point block polygon in the centered
box — head width = box height, head length = min(0.5·w, 0.9·h),
shaft half-height ≈ 0.22·h — filled and stroked like other shapes
with round joins (arbitrary barb angles). Tools: ShapeVariant grows
'arrow'; DrawToolKind gains 'shape-arrow' mapping to a ShapeSession
('arrow'); Shift constrains its box to 2:1. Toolbar gains the
"Arrow shape" button. Resize: remove the IMP-035 arrow strokeWidth
scaling branch (+ its test) — annotation arrows follow the line
convention again; head proportion constants stay exported for owner
tuning. Hit-test/orientedCorners need nothing (generic shape paths).

### Files to Touch

`packages/canvas-engine/src/decoration-data.ts` (+ test): ShapeKind.
`packages/canvas-engine/src/renderers/decorations/shape.ts` (+
decorations.test.ts): arrow silhouette.
`packages/canvas-engine/src/tools/draw-tools.ts` + `tool-mode.ts`
(+ tools.test.ts): variant, tool kind, 2:1 shift.
`packages/canvas-engine/src/gestures/resize.ts` (+ test): revert
arrow thickness scaling.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: tool button.
`apps/desktop/e2e/decorations.spec.ts`: draw + box-scale e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] ShapeKind 'arrow' accepted by the validator (+ test).
- [ ] Shape renderer arrow silhouette (7-point block polygon in the
      box, round joins); renderer test pins the polygon.
- [ ] Tool: 'shape-arrow' draws ShapeSession('arrow'); Shift = 2:1
      box; toolbar button with testid; unit tests.
- [ ] Resize revert: annotation arrows keep constant thickness (test
      updated); clamp and head constants unchanged and exported.
- [ ] e2e: draw an arrow shape, corner-resize → width/height scale
      with the box (silhouette proportional); annotation arrow
      resize leaves strokeWidth untouched.
- [ ] Full gates: build, unit suites, desktop e2e, perf, lint.

### Acceptance Criteria

**Scenario:** Artist uses both arrows for their jobs.
**GIVEN** the arrow-shape tool
**WHEN** the artist drags a box (Shift for canonical 2:1)
**THEN** a block arrow fills it, and corner-resizing scales head and
body together like any shape.
**GIVEN** an annotation arrow
**WHEN** it is stretched by resize
**THEN** the shaft lengthens while thickness (and head) keep their
pen weight.

### Issues Encountered

<!-- Filled out post-work. -->
