---
node_id: AI-IMP-102
tags:
  - IMP-LIST
  - Implementation
  - lifecycle
  - chrome
kanban_status: in-progress
depends_on: [[AI-IMP-110-menu-shell]]
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.6
date_created: 2026-07-06
date_completed:
---

# AI-IMP-102-trash-browser

> Design RATIFIED 2026-07-06 (rev 0.46 §9.7, one-ticket PM flow):
> ☰-entered takeover, one flat list, restore-stays-put + fly-to
> toast. Loop-safe.

## Summary of Issue #1

Trash has a complete model (recoverable lifecycle state, §9;
getTrashView and impact queries exist since EPIC-013-era work) and
ZERO user surface — nothing lists trashed records, nothing
restores, nothing purges. From the user's chair every delete is
one-way. Done = the rev 0.46 §9.7 trash browser: a takeover
listing every trashed record with per-row restore and Empty Trash,
entered from the ☰ menu's Trash… row (built disabled by
AI-IMP-110; this ticket enables it).

### Out of Scope

- Undo/redo keybinds and stack UI (EPIC-007's other half).
- Retention enforcement (§9.1 purge-by-retention — separate).

### Design/Approach

Ratified (rev 0.46 §9.7): a takeover in the gallery/settings
family (TakeoverKind gains 'trash'; TakeoverLayer renders it; the
☰ Trash… row from AI-IMP-110 flips live and opens it). ONE flat
list across kinds in the §7.4 row grammar — kind glyph (note ·
node · board), title, trashed-when, impact summary from the
existing impact queries (getTrashView, getEmptyTrashEligibility in
queries-lifecycle.ts) — restore per row dispatching RestoreRecord
{kind, id}, and Empty Trash at the bottom behind the §9
impact-summary confirmation. Restore does NOT navigate: the row
leaves the list and a toast offers fly-to (reuse the board-notice/
toast action grammar). Empty state: a quiet "trash is empty" line.

### Files to Touch

`apps/desktop/src/renderer/chrome/takeover.ts` + `TakeoverLayer.svelte`:
'trash' kind.
`apps/desktop/src/renderer/views/TrashView.svelte`: new.
`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: flip the
Trash… row live (depends on AI-IMP-110 landing first).
`apps/desktop/e2e/` (new or lifecycle spec home): coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Trash takeover opens from the ☰ Trash… row; flat list rows
      show kind glyph, title, trashed-when, impact summary for
      trashed note, node, and canvas records.
- [x] Per-row restore dispatches RestoreRecord; the row leaves the
      list; a toast offers fly-to (and flying works cross-canvas).
- [x] Empty Trash shows the §9 impact confirmation, purges all
      eligible records on confirm, and the list empties.
- [x] Empty state renders when nothing is trashed.
- [x] e2e: trash a note/node/canvas → all list; restore the node →
      it returns intact; Empty Trash → purge semantics hold.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** a trashed note, node, and canvas
**WHEN** the artist opens Trash
**THEN** all three list with impact context, restore brings one
back intact, and empty-trash purges with the §9 semantics.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Empty-trash command path.** No dedicated EmptyTrash command
  exists; the ratified purge verb is `PurgeRecord {kind, id}`
  (`packages/persistence/src/handlers/lifecycle.ts:613`). Empty Trash
  therefore loops `getEmptyTrashEligibility` → one `PurgeRecord` per
  entry (the GalleryActionBar hand-rolled-envelope pattern, since the
  takeover has no canvas gateway). One summary toast reports the
  count; the list reloads on the project push.
- **Fly-to per kind.** canvas → `navigateTo(id, 'Board')`; node →
  `getNodeLocations(id)` first placement → `navigateTo(canvasId,
  canvasLabel)` then `requestCenterPlacements([placementId])` (a
  placement-less node with a note falls back to opening that note);
  note → notes carry no placement, so `requestOpenNote(id)` opens the
  note panel (as the brief directed). The fly-to action closes the
  takeover first, then flies — restore itself is stays-put.
- **Restore is stays-put.** Restore removes the row locally and shows
  a `trash-restored` toast; the takeover stays open. The toast lives
  in the chrome layer (z-index 10), which stays mounted above the
  takeover cover (z-index 9) — the fly-to action survives the later
  takeover close.
- **Type seam.** Followed the renderer convention (bookmarks.ts): the
  renderer imports only `@ew/commands`; query shapes cross the seam
  untyped, so TrashView mirrors the lifecycle/structure query shapes
  locally rather than importing `@ew/persistence` types.
- **Deviation — shell.spec.ts.** AI-IMP-110's menu test iterated
  `menu-trash` in its disabled-row loop; this ticket makes that row
  live, so I removed `menu-trash` from that loop and added an
  enabled+opens-takeover-trash assertion. AI-IMP-114 (Undo/Redo rows)
  edits the same file/test — a merge touch-up the lead will resolve.
- **Impact summaries** reuse `getNoteImpact` / `getNodeImpact` /
  `getCanvasImpact` on trashed records (their aggregate members stay
  active rows under the trashed parent, so counts read correctly),
  fetched in parallel on open. Fine for small trash; revisit if a
  project ever trashes thousands of records.
