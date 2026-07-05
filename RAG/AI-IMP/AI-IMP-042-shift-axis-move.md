---
node_id: AI-IMP-042
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
kanban_status: completed
depends_on: [AI-IMP-041]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.9
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-042-shift-axis-move

## Summary of Issue #1

Completing the Shift vocabulary before EPIC-005: Shift while MOVING
constrains the drag to the nearest horizontal/vertical/45° axis —
the last member of "Shift = keep it tidy" (draw proportions,
orientation snap, resize aspect lock).

### Out of Scope

Changing snap interplay (snapping still runs on the constrained
delta — its small pulls may nudge off-axis near targets, matching
Figma's behavior); Shift as add-to-selection at pointerdown
(unchanged — constraint reads Shift during the drag).

### Design/Approach

move.ts: when modifiers.shift, project the raw pointer delta onto
the nearest 45° ray (angle rounded to π/4; delta' = (delta·û)û),
then snap as usual. Pure `constrainDeltaToAxes` helper + unit tests.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Constraint helper + move-driver wiring; unit tests: near-
      horizontal drag zeroes dy, near-45° projects onto the
      diagonal, no shift unchanged.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a selected image
**WHEN** dragged at ~10° with Shift held
**THEN** it moves purely horizontally.

### Issues Encountered

<!-- Filled out post-work. -->
As scoped. One deliberate nuance: Shift at pointerDOWN still means
add-to-selection (controller semantics); the constraint reads Shift
during the drag, so both meanings coexist — press Shift after the
drag starts to constrain. Snapping runs on the constrained delta.
