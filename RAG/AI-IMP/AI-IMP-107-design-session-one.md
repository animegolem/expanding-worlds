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
1. ~~Tag-add surface~~ — RATIFIED as proposed 2026-07-06 ("all
   three looked good, no complaints"), scribed at rev 0.45 §4.8.
2. ~~Appearance switcher~~ — RATIFIED as proposed 2026-07-06,
   scribed at rev 0.45 §4.6/§8.4.
3. ~~☰ menu inventory~~ — RATIFIED as proposed 2026-07-06, scribed
   at rev 0.45 §8.2 (trash door question in item 4 is answered:
   the ☰ Trash… row; only the browser's internal shape remains).
4. ~~Trash browser shape~~ — RATIFIED 2026-07-06 as proposed
   (rev 0.46 §9.7): flat list, restore-stays-put + fly-to toast,
   takeover. IMP-102 is loop-safe.
5. ~~Everything-scope pull~~ — RATIFIED with adjustment 2026-07-06
   (rev 0.47 §14.4): pull ends as a PLACE CURSOR over the board;
   Escape stores unplaced.
6. Context-menu grammar (the EPIC-016 core: per-kind verb
   inventory over the PureRef reference). → design-letter scope.
7. ~~Materialization-undo rule~~ — RATIFIED as proposed 2026-07-06
   (rev 0.47 §7.2): one structural undo, typed text survives.
8. Canvas background color picker placement (proposal: board menu
   row beside background image ops).
9. Panel/card visual identity (tabled from rev 0.31).
10. Bookmark-this-board keybind (proposal: Mod+D).
11. ~~Swap-node bucket rule~~ — RATIFIED as proposed 2026-07-06
    (rev 0.47 §6.5): displaced node survives unplaced,
    destroy-nothing.
12. ~~Replace/swap verb pair~~ — RATIFIED 2026-07-06 (rev 0.47
    §6.5): "Replace image…" / "Swap for…", no jargon nouns, "file"
    banned; "item" is the working noun where unavoidable, final
    tone at the design pass.

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
