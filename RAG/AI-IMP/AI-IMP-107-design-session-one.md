---
node_id: AI-IMP-107
tags:
  - IMP-LIST
  - Implementation
  - OWNER-DELIVERABLE
  - design
assignee: owner
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-107-design-session-one

## Summary of Issue #1

THE FIRST M-TICKET (assignee: owner). One design sitting that
unblocks the queued build work. Each item arrives with the lead's
proposal — most are yes/no/adjust calls. Outputs land in the RFC
(lead scribes) and flip the blocked tickets to loop-safe.

### Out of Scope

Building anything. The session produces decisions.

### Design/Approach

Agenda (proposals in RAG/DESIGN-QUEUE.md + the lead's readout):
1. Tag-add surface (proposal: the # charm popover gains a
   completing input; same component in the note panel chips).
2. Appearance switcher placement (proposal: a charm-bar appearance
   charm opening dot-swatches / icon / image-via-replace / card).
3. ☰ menu inventory (proposal: Undo · Redo · divider · Trash… ·
   End Session · divider · Settings · Help/About).
4. Trash browser shape (AI-IMP-102 sketch: door, grouping,
   restore-navigates?).
5. Everything-scope pull (proposal: action bar in everything scope
   offers "Pull into this world" → ingest unplaced + toast with
   place-now affordance).
6. Context-menu grammar (the EPIC-016 core: per-kind verb
   inventory over the PureRef reference).
7. Materialization-undo rule (§7.2 vs §10.2 contradiction —
   proposal: the materializing edit IS structural; one undo removes
   note+binding, editor text survives as unresolved token).
8. Canvas background color picker placement (proposal: board menu
   row beside background image ops).
9. Panel/card visual identity (tabled from rev 0.31).
10. Bookmark-this-board keybind (proposal: Mod+D).

### Files to Touch

None by the owner; the lead scribes outcomes into the RFC and
tickets.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] All ten agenda items decided or explicitly re-tabled;
      outcomes scribed to the RFC; blocked tickets updated.

### Acceptance Criteria

**GIVEN** the session held
**THEN** every decision is in the RFC with a rev bump and the
design queue is pruned to zero blocking items.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
