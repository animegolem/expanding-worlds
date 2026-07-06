---
node_id: AI-IMP-102
tags:
  - IMP-LIST
  - Implementation
  - lifecycle
  - chrome
kanban_status: planned
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

- [ ] Trash takeover opens from the ☰ Trash… row; flat list rows
      show kind glyph, title, trashed-when, impact summary for
      trashed note, node, and canvas records.
- [ ] Per-row restore dispatches RestoreRecord; the row leaves the
      list; a toast offers fly-to (and flying works cross-canvas).
- [ ] Empty Trash shows the §9 impact confirmation, purges all
      eligible records on confirm, and the list empties.
- [ ] Empty state renders when nothing is trashed.
- [ ] e2e: trash a note/node/canvas → all list; restore the node →
      it returns intact; Empty Trash → purge semantics hold.
- [ ] Full gates.

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
