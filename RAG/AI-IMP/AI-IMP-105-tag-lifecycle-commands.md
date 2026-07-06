---
node_id: AI-IMP-105
tags:
  - IMP-LIST
  - Implementation
  - tags
  - persistence
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-105-tag-lifecycle-commands

## Summary of Issue #1

Doc review 2026-07-06: RenameTag exists but DELETE-in-use and MERGE
do not, and tag color/icon are fields nothing writes. Backend only
— surfaces come from the owner's design session (AI-IMP-107). Done
= DeleteTag (lifecycle-aware: unassigns everywhere + removes, full
inverse restoring tag + all assignments), MergeTag (winner absorbs
loser's assignments by name_key discipline, loser removed, one
inverse), SetTagAppearance (color/icon, prior-state inverse), all
with §10.2-exact inverses and units.

### Out of Scope

- Any UI (AI-IMP-107 decides surfaces).
- Tag lifecycle_state/trash semantics beyond what §4.8 states.

### Design/Approach

Follow handlers/tags.ts idioms; DeleteTag inverse = CreateTag +
re-assignments in one internal inverse command (DeleteContent
precedent for batched inverse shape); merge = reassign-then-delete
in one transaction, checks-before-writes (CreatePin shape); skip
duplicate assignments on merge (node already carries winner).

### Files to Touch

packages/commands/src/payloads/structure.ts; packages/persistence/
src/handlers/tags.ts (+tests).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] DeleteTag + inverse round-trip byte-exact; units incl.
      tag-in-use, empty tag, already-deleted refusal.
- [x] MergeTag one-transaction; duplicate-assignment dedupe; unit
      proves loser gone, winner owns the union, one undo restores
      both exactly.
- [x] SetTagAppearance with prior-state inverse; units.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** two tags with overlapping assignments
**WHEN** MergeTag(loser→winner) commits
**THEN** every loser-tagged node carries winner exactly once, the
loser is gone, and ONE undo restores the prior world byte-exact.

### Issues Encountered

Opus-built, lead-transcribed. Merge inverse tracks addedNodeIds so
undo removes only what the merge added — both tags return
byte-exact (overlap unit proves it). DeleteTag hard-deletes with a
full restoring inverse (tag row + every assignment, created_at
verbatim). DESIGN-SESSION FLAG: SetTagAppearance is whole-replace
(color+icon together, mirroring SetNodeAppearance) — if AI-IMP-107
wants independent edits, cut a partial variant then. Gates: 459
persistence (11 new) / 18 commands / 37 desktop units, lint clean.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
