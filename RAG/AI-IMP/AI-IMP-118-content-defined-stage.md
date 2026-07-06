---
node_id: AI-IMP-118
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - canvas-engine
  - presentation
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---


# AI-IMP-118-content-defined-stage

## Summary of Issue #1

Boards with no background image render as an undifferentiated
infinite plane: there is no visual distinction between the area the
user has actually built in and untouched canvas, so orientation at
low zoom is poor and an empty board gives no feedback that placing
things "makes the world". Rev 0.50 §6.7 ratifies the fix
(PureRef-inspired): the stage extent derives from content — the
bounding box of all placements and decorations plus padding renders
in the canvas background color (lit), and beyond it the ratified
void applies with a dimmed grid. Ratchet semantics: the extent grows
live (eased) as items push past an edge and never retreats
mid-session; on board open it recomputes snug around content. No
persisted state, no migration. Done means: a board with content
shows a lit stage over a darker void, moving an item outward drags
the edge with it, moving it back in does not shrink the stage until
the board is reopened, an empty board is all void until the first
placement, and zoom-to-fit with no selection frames the content
extent.

### Out of Scope

- Boards WITH a background image: the image stage (rev 0.11)
  remains sole authority for the extent; no union with content.
- Shrink-on-demand affordance and persist-the-ratchet toggle
  (RFC-listed open design space).
- Final visual constants: void luminance step, padding size, edge
  treatment ship as reasonable placeholders behind theme
  tokens/exported constants — Design-letter-3 item 15 restyles.
- Camera clamping or any domain-model change (presentation only).

### Design/Approach

A pure module in canvas-engine (`stage-extent.ts`) owns the ratchet:
`computeContentBounds(items)` and `ratchet(prev, next)` (union that
never shrinks), plus eased interpolation toward the target rect so
edge growth glides. Host recomputes on every scene apply
(placements + decorations, world rects) and resets the ratchet on
board navigation, keeping the rule derivable from live state. The
lit rect draws in `renderers/background.ts` beneath the grid using
the effective canvas background color; the void is the same color
stepped down via a derived theme token (no second raw color — guard
tests enforce). The grid renders across both regions with reduced
alpha outside the extent, reusing the existing image-stage void
convention so both stage kinds read identically. Empty board: no
lit rect at all. Zoom-to-fit (no selection) already frames content
bounds; verify it agrees with the padded extent rather than the raw
bbox. Alternative considered and rejected: persisted high-water-mark
extent (migration, monotonic growth decays the signal, stale after
cleanups).

### Files to Touch

`packages/canvas-engine/src/stage-extent.ts`: new — bounds, ratchet,
easing; exported padding constant.
`packages/canvas-engine/src/stage-extent.test.ts`: new — unit
coverage of ratchet/bounds/easing.
`packages/canvas-engine/src/renderers/background.ts`: draw lit rect
when content-derived extent present; dim grid beyond it.
`packages/canvas-engine/src/background-grid.ts`: void-alpha constant
if grid dimming needs one.
`packages/canvas-engine/src/controller.ts` (or scene seam): expose
extent to the background renderer per frame.
`apps/desktop/src/renderer/canvas/host.ts`: recompute on scene
apply; reset ratchet on navigation; feed background color.
`apps/desktop/src/renderer/theme.css`: derived void-step token.
`apps/desktop/e2e/` (board or new spec): stage/void behavior.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Add `stage-extent.ts`: `computeContentBounds(rects, padding)`,
      `ratchetExtent(prev, next)` (grow-only union), and an eased
      per-frame approach toward the target; unit tests cover empty
      input (null extent), single item, growth, no-shrink on inward
      move, and reset semantics.
- [ ] Wire the host: recompute target extent on every scene apply
      from placement + decoration world rects; reset the ratchet
      when navigating to a different board (board open = snug).
- [ ] Render: lit rect in canvas background color under the grid
      when no background image is set and the extent is non-null;
      void tone via derived theme token; grid alpha reduced outside
      the extent (both stage kinds share the void convention).
- [ ] Empty-board state: no lit rect; first placement blooms the
      extent (eased, not popped).
- [ ] Confirm zoom-to-fit (no selection) frames the padded extent
      consistently with what is lit.
- [ ] E2E: place an item → lit stage exists; drag it outward → the
      extent target grows; drag it back inward → extent unchanged;
      navigate away and back → extent snug again.
- [ ] Gates: `pnpm -r build`, canvas-engine vitest, lint, desktop
      e2e (hidden windows), theme guard tests pass.
- [ ] Append a HUMAN-TESTING.md entry (feel of the bloom, void
      darkness readability over both themes).

### Acceptance Criteria

**Scenario:** Working on a board with no background image.
**GIVEN** a board containing three placed images
**WHEN** the board renders
**THEN** a lit rectangle in the canvas background color covers the
content bounding box plus padding, and the area beyond it is a
visibly darker void with a dimmed grid.
**WHEN** one image is dragged beyond the lit edge
**THEN** the edge eases outward to include it.
**WHEN** that image is dragged back toward the center
**THEN** the lit extent does not shrink.
**WHEN** the user navigates to another board and returns
**THEN** the extent has recomputed snug around content.
**GIVEN** a freshly created empty board
**THEN** the entire canvas renders as void until the first
placement lights a stage around it.
**GIVEN** a board with a background image
**THEN** rendering is unchanged by this ticket.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
