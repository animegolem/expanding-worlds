---
node_id: AI-IMP-187
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - frames
  - geometry
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-187-rotated-adornment-geometry

## Summary of Issue #1

Two P3s, one root cause (AI-IMP-173 M-21 + Codex wave review
2026-07-08): DOM adornments anchor to rotation-EXPANDED axis-aligned
bounds while the body renders at its true rotation. (1) The frame
title (frames-furniture.ts:~106) sits at `itemWorldAABB()` top-center
— a rotated frame's title floats at the bounding-box north point
instead of straddling the visual top edge. (2) The charm bar's label
clearance (`placementLabelWorldBottom`, renderers/placement.ts:~631)
computes straight-down world-Y with no rotation term, so the bar can
cover a rotated placement's label (adornedWorldAABB undercounts).
Artists rotate reference images constantly — both are reachable in
ordinary use. Done means both adornments compute from the TRUE
rotated corners: the frame title rides the rotated top edge's
midpoint (upright text, §4.5 label conventions), and the charm bar
clears the label's actual world extent at any rotation, with e2e at
a non-trivial angle for each.

### Out of Scope

- Rotating the adornment TEXT itself (titles/labels stay upright —
  screen-readable chrome; only the ANCHOR math changes).
- Any hit-test change (`adornedWorldAABB`'s callers beyond the bar).
- The frame sort chip (charm bar; fixed placement, unaffected).

### Design/Approach

One shared helper: rotate the item's four local corners into world
space (center + rotation are on ScenePlacement; flip via scale
sign). Frame title anchors to the midpoint of the world-space edge
whose OUTWARD NORMAL points most upward (the visual "top" at any
rotation, stable under flips); the existing zoom gate and
engagement cadence are untouched. Label clearance: the label hangs
below the body in LOCAL space and rotates with the container
(syncLabel), so compute the label quad's world corners (body-bottom
edge + clearance + glyph box, rotated) and extend the adorned AABB
by their max Y. Unit-test the corner math against 0°/90°/±45°;
e2e: a ~40°-rotated titled frame shows its title on the visual top
edge (position assert vs the rotated edge midpoint), and a rotated
labeled placement's charm bar sits below the label quad.

### Files to Touch

`packages/canvas-engine/src/renderers/placement.ts`
(placementLabelWorldBottom + a corners helper, + units),
`packages/canvas-engine/src/hit-test.ts` (adornedWorldAABB reads
the rotated extent), `apps/desktop/src/renderer/canvas/
frames-furniture.ts` (edge-midpoint anchor), e2e extensions in
frames.spec.ts + charms.spec.ts. ~80–120 LOC.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Shared rotated-corners helper, unit-tested at the angle
      matrix (0/90/±45, flips).
- [ ] Frame title anchors to the visual top edge at any rotation;
      text stays upright.
- [ ] Charm bar clears the rotated label quad; unrotated behavior
      byte-identical (existing e2e stays green).
- [ ] E2e at a non-trivial angle for both adornments.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a titled frame rotated ~40°
**THEN** its title straddles the frame's visual top edge, upright.
**GIVEN** a rotated, labeled, selected placement
**THEN** the charm bar sits clear below the label's actual extent.
**GIVEN** an unrotated board
**THEN** every adornment position is unchanged from today.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
