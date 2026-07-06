---
node_id: AI-IMP-061
tags:
  - IMP-LIST
  - Implementation
  - navigation
  - persistence
kanban_status: planned
depends_on: [AI-IMP-060]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-061-bookmarks

## Summary of Issue #1

RFC §8.1 makes bookmarks durable project-scoped records with one
menu control at the path's tail; none of it exists — no table, no
commands, no UI. This ticket adds the persistence (migration,
Create/Remove/Reorder commands, list query with target trash
state), the map-pin button that morphs into a teardrop anchoring
its menu, menu rows (drag-handle · name · printed shortcut · ✕ ·
bottom "＋ bookmark this board"), Mod+1–n jump bindings where row
order IS the binding, and stale-target degradation (trashed → In
Trash grey-out with Restore; purged → broken with remove offer;
never silently vanishes). Covers FR-5; completes slice item 12.

### Out of Scope

The hold-Mod switcher HUD (RFC Q24). Bookmarks targeting graph or
query projections (EPIC-013 — schema leaves room via a target-kind
column, only `canvas` ships). Cross-window bookmark sync beyond
ordinary event subscription.

### Design/Approach

Migration 0004: `bookmark` table (id, target_kind TEXT CHECK
('canvas'), canvas_id, label, viewport JSON nullable, sort_key).
Commands per the structure.ts payload pattern with draft-purge
symmetry as needed: CreateBookmark, RemoveBookmark,
ReorderBookmark (single-move with fractional/renumbered sort keys —
match how placements order today). Query `listBookmarks` joins
target trash state so the menu renders degradation without N+1.
Bookmark jumps route through 060's navigateTo (they are navigation
events). UI: BookmarkMenu.svelte anchored to the pin button per the
one-physics rule; drag-to-reorder commits ReorderBookmark; each row
prints its live Mod+n; global keybindings Mod+1–9 resolve by
current row order. Restore action on an In Trash row executes the
existing RestoreContent/RestoreRecord path for the canvas, then
jumps. Undo: bookmark commands are ordinary durable commands and
enter the undo stack like any other.

### Files to Touch

`packages/persistence/src/migrations/0004-bookmarks.ts` + index:
new table.
`packages/commands/src/payloads/*`: three payloads + validators +
unit tests.
`packages/commands/src/…handlers`: create/remove/reorder handlers
following existing command wiring.
`packages/persistence` or query layer: `listBookmarks` with trash
state.
`apps/desktop/src/renderer/chrome/BookmarkMenu.svelte`: new.
`apps/desktop/src/renderer/chrome/PathBar.svelte`: pin button at
tail.
`apps/desktop/e2e/navigation.spec.ts`: bookmark scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Migration 0004 with target_kind seam; migration test passes
      on fresh + existing DB fixtures.
- [ ] CreateBookmark/RemoveBookmark/ReorderBookmark payload
      validators + handlers + unit tests (ordering semantics
      covered, undo round-trip covered).
- [ ] listBookmarks query returns rows in sort order with target
      trash/purge state; unit test.
- [ ] Pin button at path tail; press morphs to teardrop anchoring
      the menu (the button is its own anchor tail).
- [ ] Menu rows: drag-handle reorder (commits ReorderBookmark),
      name, printed current shortcut, ✕ remove; bottom row
      bookmarks the current board with its viewport.
- [ ] Mod+1–9 bound to current row order; bindings update on
      reorder without restart; jumps go through navigateTo.
- [ ] Degradation: trashed target row greys with In Trash label +
      Restore action (restores then jumps); purged target shows
      broken state offering removal; restoring a target
      revalidates its bookmark with no user action.
- [ ] e2e: add two bookmarks, reorder, assert Mod+1/Mod+2 swap
      targets and printed shortcuts update; trash a target and
      assert grey-out + Restore path; full gates green.

### Acceptance Criteria

**GIVEN** boards A and B bookmarked in that order
**WHEN** the user drags B's row above A
**THEN** Mod+1 now jumps to B, both rows print their new
shortcuts, and the order survives restart.

**GIVEN** a bookmarked canvas that is then trashed
**WHEN** the menu opens
**THEN** the row is greyed In Trash offering Restore, and choosing
Restore restores the canvas and jumps to it.

**GIVEN** a bookmark jump
**WHEN** it lands
**THEN** the jump is a §8.1 history entry (Back returns).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
