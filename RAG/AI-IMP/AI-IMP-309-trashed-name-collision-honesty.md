---
node_id: AI-IMP-309
tags:
  - IMP-LIST
  - Implementation
  - trash
  - naming
  - tester-feedback
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-17
date_completed:
---

# AI-IMP-309-trashed-name-collision-honesty

## Summary of Issue #1

First tester field doc (2026-07-17, item 6): he deleted a board
(and its contents), tried to remake it with the same name, and hit
"board with that name already exists" with no visible board
anywhere — "seems like it's remembering the original board
somewhere but idk where." It is: the TRASHED board still owns the
title (§7.7 collisions + §9 retention are working as designed).
The defect is honesty: a dead-end error naming an invisible
conflict is a wall where the grammar demands a door. Done means:
the collision message names WHERE the conflict lives and offers
the doors — restore the trashed board, or proceed with a
variant name — with the impact stated as fact (GR-4 register).

### Out of Scope

Changing §7.7 collision semantics or §9 retention; auto-renaming
without consent; any schema change (none needed — STOP if review
disagrees).

### Design/Approach

Round-1 review locates where the collision surfaces (create-board
validation path) and what the trash lookup costs. The surface:
the existing collision error becomes a kit-drawn dialog/toast row
stating "a board named X is in the Trash" with verbs
[Restore it] [Keep both — name it X 2] [Cancel]; restore routes
through the existing §9.7 restore command; keep-both applies the
standard collision variant rule. Exact copy follows the GR-4
impact-as-fact register; cite the Empty-trash confirm specimen.

### Files to Touch

Board-creation validation seam (commands/persistence — review
cites); the creation dialog/toast surface in
`apps/desktop/src/renderer/*`; e2e trash-collision spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: cite the collision path and confirm the
      trashed-owner case is distinguishable from a live collision.
- [ ] Collision against a TRASHED owner surfaces source + doors
      (restore / keep-both / cancel); live collisions keep their
      current behavior.
- [ ] Restore door round-trips through §9.7 (board returns, name
      intact); keep-both applies the variant rule.
- [ ] e2e: delete board → recreate same name → dialog offers
      doors → each door does what it says.

### Acceptance Criteria

**Scenario:** Recreating a trashed board's name.
**GIVEN** a board named "warren" in the Trash.
**WHEN** the user creates a board named "warren".
**THEN** the surface states the name is held by a board in the
Trash,
**AND** offers restore / keep-both / cancel,
**AND** each verb performs exactly its stated act.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
