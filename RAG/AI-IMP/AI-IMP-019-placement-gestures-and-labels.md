---
node_id: AI-IMP-019
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - gestures
  - labels
kanban_status: in-progress
depends_on: [AI-IMP-018]
parent_epic: [[AI-EPIC-004-canvas-board-loop]]
confidence_score: 0.75
date_created: 2026-07-04
date_completed:
---

# AI-IMP-019-placement-gestures-and-labels

## Summary of Issue #1

The controller (AI-IMP-018) can select content but nothing can be
moved, resized, rotated, reordered, flipped, or labeled. Implement the
placement manipulation loop on top of the gesture contract: multi-
selection move, handle-based resize and rotate, reorder operations for
the shared content plane, flip, and placement labels per §4.5 (rev
0.8: label scale proportional to placement world size) with the
selection-controls visibility toggle. Done means: every gesture
commits exactly one durable command, labels render and follow renames,
and unit + e2e tests prove it.

### Out of Scope

Snapping/smart-guide implementation (AI-IMP-022 — call the injected
SnapProvider, never implement one). Decoration creation tools and
renderers (AI-IMP-021). Import/creation dialogs (AI-IMP-020). Align/
distribute (AI-IMP-022). Do NOT touch: scene-sync core, controller/
camera/selection/hit-test modules (extend via their exported seams),
handlers other than listed, `service.ts` beyond appends.

### Design/Approach

Move: drag on a selected item begins a gesture over the whole
selection (placements and decorations); update applies the delta
through the SnapProvider; commit issues the one `TransformContent`.
Resize: overlay-plane handles on the selection's bounds; corner
handles preserve aspect for image appearances by default (§6.1),
modifier frees it; single-item resize maps to width/height, multi-item
resize scales about the anchor corner. Rotate: a rotate handle above
the bounds, Shift snaps to 15° increments (ephemeral aid, allowed —
still one command). Reorder: bring-to-front/forward/backward/send-to-
back on the selection via existing `ReorderContent` (afterId/beforeId
neighbors computed from the current ordered scene) — works on
placements AND decorations since the plane is shared (§6.8). Flip
horizontal/vertical via existing `FlipPlacement` (presentation state,
§6.9). Labels: a BitmapText child of the placement renderer showing
the note title from `getCanvasScene`, positioned under the image/dot,
font size = placement world height × fixed ratio so resizing the
placement resizes the label and zoom reads the layout (§4.5); no
screen-space clamping in this ticket (tuning deferred to feel).
Toggle: a small control on the selection outline issuing existing
`SetPlacementLabelVisibility`; label hidden ⇒ no BitmapText child.

### Files to Touch

`packages/canvas-engine/src/gestures/{move.ts,resize.ts,rotate.ts}`: gesture implementations against the 018 contract.
`packages/canvas-engine/src/gestures/*.test.ts`: fake-gateway tests (one command per gesture).
`packages/canvas-engine/src/renderers/placement.ts`: label BitmapText, proportional sizing, flip application.
`packages/canvas-engine/src/reorder.ts` (+ test): neighbor computation → ReorderContent payloads.
`apps/desktop/src/renderer/canvas/host.ts`: handle rendering, selection-controls label toggle, reorder shortcuts/context-menu entries.
`apps/desktop/e2e/gestures.spec.ts`: gesture + command-log e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Move gesture: multi-selection drag with SnapProvider delta applied; commit = one TransformContent with prior+next for every member; cancel restores; tests with fake gateway assert exactly one command and correct payload.
- [ ] Resize gesture: corner/edge handles in overlay plane; aspect preserved by default for image appearances, modifier frees; multi-selection scales about anchor; commit/cancel semantics as move; unit tests for aspect math and multi-item scaling.
- [ ] Rotate gesture: handle above selection bounds, Shift = 15° steps; single and multi (rotate about selection center, updating member x/y + rotation); tests.
- [ ] Reorder: neighbor computation from ordered scene snapshot → ReorderContent (front/forward/backward/back) for mixed placement/decoration selections; keyboard shortcuts + context-menu entries; tests for neighbor edge cases (already-front, adjacent moves).
- [ ] Flip: context/shortcut issuing FlipPlacement per selected placement (one gesture = user action per placement command is acceptable here — flips are instantaneous acts, not continuous gestures); renderer applies flip_x/flip_y to sprite scale sign.
- [ ] Labels: BitmapText under placement, text = note title, size proportional to placement world height (single named ratio constant), reflows on TransformContent and on note rename (scene re-query); no label when node has no note (§4.5); renderer unit tests.
- [ ] Label toggle on selection controls issuing SetPlacementLabelVisibility; default visible; e2e asserts toggle round-trip.
- [ ] e2e gestures.spec.ts: drag two selected placements → command log gains exactly one TransformContent; resize an image placement preserving aspect; rotate; bring-to-front changes render order in sceneStats; flip persists; rename note → label text updates.
- [ ] Full gates green: `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint` and desktop e2e.

### Acceptance Criteria

**Scenario:** One durable command per completed gesture (§10.2).
**GIVEN** two placements selected on the root canvas.
**WHEN** the user drags them 100 world units and releases.
**THEN** the command log contains exactly one new TransformContent whose items cover both placements.
**AND** pressing the undo inverse (executed manually via the API) restores both prior transforms.
**WHEN** the user resizes an image placement by a corner handle.
**THEN** aspect ratio is preserved and its label grows proportionally with the placement.
**WHEN** label visibility is toggled from the selection controls.
**THEN** the label disappears, the state persists, and re-toggling restores it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
