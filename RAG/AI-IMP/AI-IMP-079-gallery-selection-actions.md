---
node_id: AI-IMP-079
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - selection
kanban_status: planned
depends_on: [AI-IMP-077]
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.6
date_created: 2026-07-06
---

# AI-IMP-079-gallery-selection-actions

## Summary of Issue #1

The gallery can show but not act. §14.4: bulk selection summons a
floating action bar — tag · place · trash — and placement reuses
the §6.10 grammar the outline shipped (070). This ticket lands the
grid's MOUSE selection model per rev 0.25 (click selects, Shift
extends the linear document-order range from the anchor, Mod
toggles membership), the action bar, and the three actions: tag
(completion field assigning to every selected node, merging by
name_key), place (close the takeover and run the §6.10 placement
flows — place-on-current-canvas for the selection; single-item
drag-out), trash (the §9 commands over the selection). Done when:
a multi-select can be tagged, placed, and trashed in bulk, and
Escape peels selection before the takeover closes.

### Out of Scope

The keyboard half (080 — cursor, arrows, Space reservation, Mod+A;
this ticket is pointer-only). Facet interactions beyond operating
on the currently-filtered grid. Undo UI (EPIC-007; the commands
carry inverses as always).

### Design/Approach

Selection state lives in the view (ids + anchor), styled per the
§4.6-adjacent selection tokens; linear ranges follow document
order of the CURRENT sort/filter (rev 0.25: never a rectangle).
The action bar is a floating strip that appears when selection is
non-empty (count + tag · place · trash), anchored bottom-center
of the takeover, engagement-fade exempt (it IS the selection's
chrome). Tag: completion field (custom list) assigning the chosen
or created tag to every selected node via existing tag commands —
batch as one gesture if the command seam allows, else sequential
with one toast. Place: 'Place on current canvas' closes the
takeover first (070 precedent), then places the selected nodes
via the §6.10 flow with the existing multi-place spacing; a
single-cell HTML5 drag-out sets NODE_DRAG_MIME exactly like
outline rows and closes the takeover at the row bounds. Trash:
TrashNode per §9.6 semantics over the selection with a summary
toast; the grid refreshes on the project push. Escape peels:
selection → takeover (rev 0.25), matching the canvas.

### Files to Touch

`apps/desktop/src/renderer/views/GalleryView.svelte`: selection
model, action bar, activation wiring.
`apps/desktop/src/renderer/` shared placement seam (whatever 070
exported — reuse, do not fork).
`apps/desktop/e2e/gallery.spec.ts`: selection + three actions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Pointer selection: click, Shift linear range in document
      order across bucket boundaries, Mod toggle; anchor rules
      match rev 0.25 (e2e).
- [ ] Floating action bar appears on non-empty selection with
      live count; disappears on empty (e2e).
- [ ] Bulk tag: completion field assigns to all selected nodes,
      name_key merge respected; one toast (e2e).
- [ ] Place on current canvas: takeover closes first, all
      selected nodes place via the §6.10 seam (e2e); single-cell
      drag-out sets NODE_DRAG_MIME and the import surface accepts
      it (e2e if the outline drag test pattern transfers, else
      documented manual check).
- [ ] Bulk trash over the selection; grid refreshes on push;
      summary toast (e2e).
- [ ] Escape peels selection first, closes takeover second (e2e).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Bulk curation.
**GIVEN** a filtered gallery showing a dozen entries.
**WHEN** the user clicks one cell and Shift-clicks another five
cells later.
**THEN** the six entries between them (document order) are
selected and the action bar shows "6".
**WHEN** the user assigns a tag from the bar.
**THEN** all six nodes carry it and one toast reports the batch.
**WHEN** the user clicks 'place'.
**THEN** the takeover closes and six placements land on the
current canvas.
**WHEN** the user presses Escape with a selection active.
**THEN** the selection clears and the takeover stays open.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
