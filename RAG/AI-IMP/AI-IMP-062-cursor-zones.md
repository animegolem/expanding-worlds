---
node_id: AI-IMP-062
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
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

- [x] canvas-engine zone helper: unit tests cover every zone,
      rotated items, zoom invariance (screen-space widths), and
      the outside-corner rotate band including its outer cutoff.
- [x] gestures-ui: handle rendering and handle hit-testing
      deleted; selection draws outline only (verify no adornment
      draw calls remain).
- [x] Cursor reflects zone on hover and during drag: move /
      directional resize (8 ways) / rotate / grab on empty
      canvas.
- [x] Drag dispatch by zone commits the same single durable
      command per gesture as today (move/resize/rotate parity
      with existing behavior — no regression in
      TransformContent payloads).
- [x] ⌥-drag inside duplicates: one CreatePlacement of the same
      node at release; Esc cancels cleanly.
- [x] Placement lock: migration + SetPlacementLock + validator +
      unit tests; locked placements refuse move/resize/rotate
      with `not-allowed` cursor; locked decorations refuse the
      same way.
- [x] gestures.spec migrated to zone-position gestures; new cases
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
Delivered as specified, with these deviations and judgment calls:

- **No dedicated feel-constants file exists** — AI-IMP-056 retuned
  constants in place (camera.ts, snap-guides.ts, placement.ts), so
  `CURSOR_ZONES` (edge ±4 px, rotate band 4–14 px, screen-space)
  lives beside `classifyCursorZone` in
  `packages/canvas-engine/src/hit-test.ts`, exported for retuning.
- **Migration took 0004** (`0004-placement-lock`); 061 gets 0005.
- **⌥ collision found by the full suite**: board-tooling.spec used
  ⌥-at-drag-start as the snap bypass, which rev 0.17 reassigns to
  duplicate. The move driver reads modifiers per pointermove, so ⌥
  pressed AFTER the press still bypasses snapping; the test now does
  that. UX consequence worth an RFC note: the snap-disable modifier
  for move gestures is ⌥-mid-drag, not ⌥-at-start.
- **⌥-duplicate scope**: single-placement selections only (the §6.5
  copy semantics and the "one CreatePlacement, one undo" acceptance
  are singular); ⌥ on a multi-selection or a decoration falls back to
  a plain move. Threshold 4 px so ⌥-click never duplicates. The drag
  renders a translated outline ghost (transient feedback like
  marquee/guides, not selection adornment).
- **Lock enforcement is gesture-surface only** (deliberate): the
  SetPlacementLock handler does not gate TransformContent/
  MovePlacement, so undoing a pre-lock transform can never dead-end
  on a lock check (unit test pins this). Toolbar align/distribute on
  a marquee that includes a locked placement therefore still
  transforms it — BoardToolbar was out of bounds for this ticket;
  flag for 063/lead.
- **Mixed selections refuse wholesale**: any locked member makes all
  transform zones show `not-allowed` and refuse (simplest coherent
  rule; splitting the session would need controller surgery). Cmd+A
  still includes locked placements (Delete is not a transform);
  locked decorations remain entirely unhittable as before.
- **Rotate cursor is `crosshair`** (provisional stand-in; CSS has no
  rotate cursor — a custom asset slot is noted in gestures-ui).
  During a move drag the cursor stays the host's `grabbing`;
  zone-started resize/rotate hold their directional cursor for the
  whole drag.
- **Empty-canvas hover is now `grab`** per §6.9; canvas.spec's old
  `default` assertion updated. Inside a MULTI-selection's union box,
  gaps read `move` but a drag there still marquees (controller
  semantics untouched); single selections use the oriented body box
  so zone and behavior agree exactly.
- Label visibility lost its drawn toggle with the handles; slice and
  gestures specs exercise SetPlacementLabelVisibility directly until
  the 063 charm bar lands the pointer affordance.
- The `__ewGestureDebug.handles()` e2e seam became `zoneAt(x, y)`;
  all consumers (slice, canvas, decorations specs) migrated to
  zone-position gestures per the lead's mid-flight instruction.
- One unrelated flake observed once under full-suite load
  (import.spec drop test, passes in isolation and on re-run); not
  touched.
