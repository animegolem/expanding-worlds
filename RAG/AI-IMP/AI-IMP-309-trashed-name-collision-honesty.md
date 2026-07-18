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
somewhere but idk where." Round-1 correction: `TrashNode` flips only
the node; its attached note deliberately remains ACTIVE and owns the
title (§7.7 collisions + §9 retention are working as designed). The
special board-in-Trash explanation is therefore relationship-aware,
not derived from note lifecycle: it applies only when exactly one
trashed canvas-owner refers to the note and no active node does.
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

Round-1 review located the collision after the naming palette closes,
at the `CreateNoteAndAttach` step of board seating. Structured handler
details cross that command seam; there is no schema change. The surface:
the existing collision error becomes a kit-drawn dialog/toast row
stating "a board named X is in the Trash" with verbs
[Restore it] [Keep both — name it X 2] [Cancel]; restore routes
through `RestoreRecord { kind: 'node' }`, exits the carry, and navigates
to the revived owned canvas. Keep-both chooses the first free ascending
space-separated integer (`X 2`, `X 3`, …), skipping occupied title
keys. Exact copy follows the GR-4
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

- [x] Round-1 review: cite the collision path and confirm the
      trashed-owner case is distinguishable from a live collision.
- [x] Collision against a TRASHED owner surfaces source + doors
      (restore / keep-both / cancel); live collisions keep their
      current behavior.
- [x] Restore door round-trips through §9.7 (board returns, name
      intact); keep-both applies the variant rule.
- [x] e2e: delete board → recreate same name → dialog offers
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

- The original diagnosis inferred a trashed note from the invisible
  collision. Source review convicted the common path as an ACTIVE note
  referenced only by a trashed canvas-owner node; lifecycle-only copy
  would have lied.
- Shared notes and multiple trashed canvas owners intentionally fall
  back to the existing generic title-conflict behavior rather than
  selecting or naming an owner silently.
- Validation: `pnpm -r build`; persistence 59 files / 665 tests;
  focused renderer 1 file / 2 tests; hidden-window `new-board.spec.ts`
  5/5 tests.
