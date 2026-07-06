---
node_id: AI-IMP-086
tags:
  - IMP-LIST
  - Implementation
  - commands
  - persistence
kanban_status: backlog
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.7
date_created: 2026-07-06
date_completed:
---

# AI-IMP-086-compound-commands

## Summary of Issue #1

Two shipped flows split one user act across two commands, so a
mid-flight failure strands half the act and undo takes two steps:
(1) "create note and attach" (attach picker, node menu, canvas
corner) runs CreateNote then AttachNoteToNode — an attach failure
leaves a loose note reserving its title (Codex review finding,
2026-07-06); (2) place-on-board (AI-IMP-084) runs SetNodeAppearance
then CreatePlacement — undo is two steps. CreatePin (§6.2) is the
in-house precedent for one-transaction user acts, and DeleteContent
(AI-IMP-028) for batch commands. Done = a compound/batch command
shape exists, both flows ride it, undo is one step each, failures
leave no partial state.

### Out of Scope

- New UI. Both surfaces keep their controls; only the command
  wiring changes.
- Generalizing to arbitrary client-composed transactions (§10.2
  keeps commands as the atomic vocabulary — this adds two named
  compounds or one batch envelope, whichever review of DeleteContent
  suggests is cheaper).

### Design/Approach

To be decided at activation: either two purpose-built commands
(CreateNoteAndAttach, PlaceAsCard) following CreatePin's
one-transaction shape, or a general batch envelope like
DeleteContent. Inverse must restore the exact prior state in one
undo. Title reservation on failure disappears by construction
(single transaction).

### Files to Touch

`packages/commands/src/payloads/*`, `packages/persistence/src/
handlers/*` (+tests), the three attach call sites, NotePanel
place-on-board, e2e for one-step undo.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Command shape decided (named compounds vs batch envelope)
      with a one-paragraph rationale in this ticket.
- [ ] Create-and-attach flows are one command, one undo, no loose
      note on failure; units + e2e.
- [ ] Place-on-board is one command, one undo; units + e2e.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a node whose attach will fail (trashed concurrently)
**WHEN** the user creates-and-attaches a note
**THEN** the command rejects and NO note record exists.
**GIVEN** a placed card via place-on-board
**WHEN** the user hits undo once
**THEN** both the placement and the appearance flip revert.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
