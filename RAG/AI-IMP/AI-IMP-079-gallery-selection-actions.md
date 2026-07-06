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

- [x] Pointer selection: click, Shift linear range in document
      order across bucket boundaries, Mod toggle; anchor rules
      match rev 0.25 (e2e).
- [x] Floating action bar appears on non-empty selection with
      live count; disappears on empty (e2e).
- [x] Bulk tag: completion field assigns to all selected nodes,
      name_key merge respected; one toast (e2e).
- [x] Place on current canvas: takeover closes first, all
      selected nodes place via the §6.10 seam (e2e); single-cell
      drag-out sets NODE_DRAG_MIME and the import surface accepts
      it (e2e if the outline drag test pattern transfers, else
      documented manual check).
- [x] Bulk trash over the selection; grid refreshes on push;
      summary toast (e2e).
- [x] Escape peels selection first, closes takeover second (e2e).
- [x] `pnpm -r build`, full gates green.

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

- **Bulk place needed two Workspace-side adaptations, not one.** The
  anticipated fix was the cascade offset (repeated requests all
  landed at dead view center — mirrored import-surfaces'
  MULTI_DROP_OFFSET, 24, with the step counter resetting on the next
  macrotask so a lone Place still lands exactly at center). But the
  first e2e run landed 1 of 3: the burst's parallel
  `gateway.execute` calls share one observed revision, so every
  CreatePlacement after the first failed the §10.2 optimistic check.
  Fixed in the same onPlaceNode handler by serializing the burst
  through a promise chain — the gateway notes each committed
  revision, so the check stays fresh and stays ON (no
  `checkRevision: false` weakening).
- **Duplicate assigns**: the AssignTagToNode handler throws
  TAG_ALREADY_ASSIGNED (packages/persistence/src/handlers/tags.ts),
  so the bar assigns per node and buckets that error code as
  "already tagged" in the one summary toast; any other non-committed
  result counts as failed. Verified by e2e (a pre-tagged node in the
  selection).
- **Completion list source**: `galleryTagCounts` count-ordered (the
  facet strip's own vocabulary/order) rather than plain `listTags`.
  That query omits assignment-less draft tags, so typing a draft
  tag's name routes through CreateTag → TAG_NAME_CONFLICT; the bar
  falls back to the conflict's `existingTagId` detail — the same
  path that closes the create/lookup race.
- Pre-existing, untouched: GalleryView's 078 styles reference
  `--ew-text-dim`, which is not defined in theme.css (silently
  inherits). New 079 styles use defined tokens only; flagging for
  the lead rather than fixing out-of-scope styling.
- Tagging keeps the selection (only trash clears it) so a
  tag-then-place curation pass works without reselecting.
- **Bucket-boundary honesty**: the range e2e seeds one date bucket
  (CreateNode cannot backdate created_at). The claim still holds by
  construction — the range is computed over the flat index array,
  which is document order; buckets are date sort's PRESENTATION
  (gallery-buckets slices that same array) and are invisible to the
  selection model. No selection code path branches on buckets.
- The drag-out e2e transferred directly from the outline row drag
  test (synthesized DragEvent + DataTransfer); no manual check
  needed.
