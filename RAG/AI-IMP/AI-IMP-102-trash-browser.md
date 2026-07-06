---
node_id: AI-IMP-102
tags:
  - IMP-LIST
  - Implementation
  - lifecycle
  - chrome
kanban_status: backlog
depends_on:
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.6
date_created: 2026-07-06
date_completed:
---

# AI-IMP-102-trash-browser

> **DESIGN REVIEW REQUIRED before proceeding** (owner, 2026-07-06):
> the shape below is a starting sketch, not a decided design — it
> goes through the design queue first.

## Summary of Issue #1

Trash has a complete model (recoverable lifecycle state, §9;
getTrashView and impact queries exist since EPIC-013-era work) and
ZERO user surface — nothing lists trashed records, nothing
restores, nothing purges. From the user's chair every delete is
one-way. Done = a Trash surface listing trashed records with
restore and purge (empty-trash) actions riding the existing
commands, entered from a sensible door (candidate: the ☰ menu or a
takeover view — design review decides).

### Out of Scope

- Undo/redo keybinds and stack UI (EPIC-007's other half).
- Retention enforcement (§9.1 purge-by-retention — separate).

### Design/Approach

To be settled at design review. Sketch: a takeover-or-panel list
in the §7.4 row grammar (kind glyph, title, trashed-at, impact
summary from the existing impact queries), restore per row,
empty-trash with the §9 confirmation shape. Open questions for the
review: door placement; per-kind grouping vs one list; whether
restore navigates to the restored thing.

### Files to Touch

To be confirmed post-review.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] To be cut after design review.

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
