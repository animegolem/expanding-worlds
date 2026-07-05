---
node_id: AI-IMP-028
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - lifecycle
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-019, AI-IMP-021]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
---

# AI-IMP-028-delete-zorder-safety-nets

## Summary of Issue #1

Nothing placed on a board can be removed from it: Delete/Backspace is
unwired, even though `DeletePlacement` (full §9.2 semantics with
bare-node auto-trash and restore inverse) and `DeleteDecoration`
handlers have existed since EPIC-003/004. Occluded content is also
unrecoverable in practice (the owner lost a text decoration under an
image), because z-order actions aren't reachable enough and there is
no select-all. Done means: Delete/Backspace removes the selection as
one undoable user action with §9.2 notices, z-order actions work on
any selection via keyboard and the board toolbar, Cmd+A selects all,
and zoom-to-fit falls back to fit-everything when nothing is
selected.

### Out of Scope

The undo stack itself (EPIC-007 — inverses are recorded, not yet
replayable in-app); Trash view UI; canvas contents outline (§14.3,
deferred); node-menu redesign; deleting canvases/nodes/notes from the
board surface.

### Design/Approach

Batch command: add `DeleteContent` v1 (`@ew/commands` payload:
canvasId + placementIds[] + decorationIds[]) so deleting a
multi-selection is one command_log row and will be one undo step.
The handler validates all ids first (§9.2-style active checks, same
canvas), then per placement reuses the existing DeletePlacement logic
(connector release, hard delete, bare-node auto-trash never for
root/invested nodes) and per decoration the DeleteDecoration logic —
extract shared internals rather than dispatching nested commands, per
the CreatePin composite precedent. Inverse: one composite restore
(RestorePlacement-shaped entries + decoration re-creates) mirroring
prior values; round-trip tested. Handler returns per-node outcomes in
`affected` so the renderer can toast the §9.2 notices ("moved bare
node to Trash — Keep in Project", "node remains in library,
unplaced") non-blockingly. Renderer: keydown Delete/Backspace in
gestures-ui (skip when focus is in a text input/text-entry mode) →
gateway.execute; toast component in shared-ui or a minimal inline
notice in CanvasHost.svelte. Z-order: `ReorderContent` exists —
add keyboard bindings (Cmd+]/[, Cmd+Shift+]/[ front/back) and
BoardToolbar buttons acting on the current selection, placements and
decorations alike (reorder.ts neighbor simulation already models the
shared plane). Cmd+A → selection.set(all active scene item ids);
zoom-fit with empty selection → unionBounds(all items).

### Files to Touch

`packages/commands/src/payloads/structure.ts` (or lifecycle.ts):
DeleteContentPayload + restore payload types.
`packages/persistence/src/handlers/lifecycle.ts`: DeleteContent v1 +
composite restore; extract shared delete internals.
`packages/persistence/src/handlers/lifecycle.test.ts`: batch delete,
mixed selection, bare-node path, root guard, inverse round-trip.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: Delete/Backspace,
Cmd+A, z-order keybindings (respect text-entry focus).
`apps/desktop/src/renderer/BoardToolbar.svelte`: z-order buttons;
zoom-fit-all fallback.
`apps/desktop/src/renderer/CanvasHost.svelte`: non-blocking notice
surface for §9.2 outcomes.
`apps/desktop/e2e/board-tooling.spec.ts`: delete/z-order/select-all
e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Add DeleteContentPayload (+ composite restore payload) to
      @ew/commands with type tests if the package has them.
- [ ] Extract DeletePlacement/DeleteDecoration internals into shared
      helpers; existing single commands keep passing their suites
      unchanged.
- [ ] Implement DeleteContent v1: validate-first, per-item §9.2
      semantics, one command_log row, composite inverse; register in
      lifecycle handlers.
- [ ] Persistence tests: mixed placements+decorations batch; last
      placement of bare node auto-trashes with restoreNodeId; root
      node never trashed; invested node stays active; inverse
      round-trips to identical rows; connector anchors release.
- [ ] Wire Delete/Backspace in gestures-ui to DeleteContent for the
      current selection; suppressed while text entry or an input has
      focus; selection clears on success.
- [ ] Non-blocking notice in CanvasHost for §9.2 outcomes (bare-node
      trashed / node unplaced), auto-dismissing, with data-testid.
- [ ] Z-order: Cmd+]/Cmd+[ (forward/backward), Cmd+Shift+]/[
      (front/back) via ReorderContent on the selection; BoardToolbar
      buttons for the same; decorations included.
- [ ] Cmd+A selects all active items; zoom-fit with nothing selected
      fits union bounds of all content.
- [ ] e2e: place 3 items, marquee, Delete → board empties, revision
      +1 (one command), notice shown for a bare pin; send occluding
      image to back via keyboard → covered text hit-testable; Cmd+A
      then zoom-fit frames all content.
- [ ] Run gates: `pnpm -r build`, all unit suites, desktop e2e,
      lint.

### Acceptance Criteria

**Scenario:** Artist clears mistakes off the board.
**GIVEN** a selection of two image placements and one arrow
**WHEN** the user presses Delete
**THEN** all three leave the board in one durable command and the
project revision advances by one.
**AND** a bare image node whose last placement was deleted shows a
non-blocking "moved to Trash — Keep in Project" notice.
**GIVEN** a text decoration fully covered by an image
**WHEN** the user selects the image and presses Cmd+Shift+[
**THEN** the image moves behind the text and the text is clickable.
**GIVEN** nothing selected
**WHEN** the user presses Cmd+A and triggers zoom to fit
**THEN** all board content is selected and framed in view.

### Issues Encountered

<!-- Filled out post-work. -->
