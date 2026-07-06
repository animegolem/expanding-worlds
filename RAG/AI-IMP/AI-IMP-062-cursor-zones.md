---
node_id: AI-IMP-062
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-062-cursor-zones

## Summary of Issue #1

gestures-ui.ts renders drawn resize/rotate handles on selection;
RFC §6.9 (rev 0.17) forbids them: selection is a thin accent
outline only, and the cursor is the affordance, driven by hot
zones — inside = move, edge (±~4px screen) = directional resize,
corner = diagonal resize, a 4–14px band outside a corner = rotate,
empty canvas = pan/grab. Option-drag inside duplicates (a §6.5
copy — another placement of the same node). A locked object shows a
refusal cursor and draws no further state; placements have no lock
field today, so this ticket adds it (decorations already carry
one). Covers FR-8. Done when no handle pixels render, all
transforms work through zones with correct cursors, gestures.spec
passes migrated off handle-clicking, and lock refuses.

### Out of Scope

The charm bar and its lock toggle button (063 — this ticket ships
the placement lock field + command; 063 gives it UI, so until 063
lock is command/test-surface only). Snapping/smart-guide changes
(§6.9 semantics unchanged). Chrome cadence (059 — no dependency
either way; this ticket can run in parallel).

### Design/Approach

Zone classification is pure geometry: a canvas-engine helper takes
pointer screen position, the selected item's world AABB + rotation,
camera scale, and the zone constants, returning
move/resize-N/NE/E…/rotate-NE…/none. Screen-space widths (divide
by camera scale into world units) so zones feel constant at any
zoom. gestures-ui.ts consumes it for both cursor styling
(CSS cursors; rotate uses a custom cursor asset if needed) and
drag-mode dispatch, deleting the handle rendering and its
hit-testing. Option held at drag start on an inside zone issues
CreatePlacement for the same node at the drag position (one
durable command on completion, like any gesture). Lock: migration
adds `locked` to placement rows; `SetPlacementLock` command +
validator; gestures refuse transform gestures on locked placements
(refusal cursor `not-allowed`, no drag starts); decorations honor
their existing locked field the same way. Zone widths land in the
feel constants file. gestures.spec migrates: instead of clicking
drawn handles, pointer moves to computed zone offsets around the
selection AABB.

### Files to Touch

`packages/canvas-engine/src/hit-test.ts` (+ test): zone
classification helper.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: delete handle
render/hit code; zone cursors + dispatch; ⌥-duplicate; lock
refusal.
`packages/persistence/src/migrations/0005-placement-lock.ts` (or
0004 if 061 lands second — coordinate numbering at merge):
locked column.
`packages/commands/src/payloads/structure.ts` + handlers + tests:
SetPlacementLock.
`apps/desktop/e2e/gestures.spec.ts`: zone-based migration + lock +
⌥-duplicate coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] canvas-engine zone helper: unit tests cover every zone,
      rotated items, zoom invariance (screen-space widths), and
      the outside-corner rotate band including its outer cutoff.
- [ ] gestures-ui: handle rendering and handle hit-testing
      deleted; selection draws outline only (verify no adornment
      draw calls remain).
- [ ] Cursor reflects zone on hover and during drag: move /
      directional resize (8 ways) / rotate / grab on empty
      canvas.
- [ ] Drag dispatch by zone commits the same single durable
      command per gesture as today (move/resize/rotate parity
      with existing behavior — no regression in
      TransformContent payloads).
- [ ] ⌥-drag inside duplicates: one CreatePlacement of the same
      node at release; Esc cancels cleanly.
- [ ] Placement lock: migration + SetPlacementLock + validator +
      unit tests; locked placements refuse move/resize/rotate
      with `not-allowed` cursor; locked decorations refuse the
      same way.
- [ ] gestures.spec migrated to zone-position gestures; new cases
      for rotate band, ⌥-duplicate, lock refusal; full gates
      green (`pnpm -r build`, unit, desktop e2e hidden-window).

### Acceptance Criteria

**GIVEN** a selected placement at any zoom
**WHEN** the pointer rests 10px outside its corner
**THEN** the rotate cursor shows and dragging rotates with the
existing orientation snapping, while no handles are drawn.

**GIVEN** a selected placement
**WHEN** the user ⌥-drags from inside it
**THEN** a second placement of the same node exists at the drop
point and one undo removes it.

**GIVEN** a locked placement
**WHEN** any transform gesture is attempted
**THEN** the refusal cursor shows and no command commits.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
