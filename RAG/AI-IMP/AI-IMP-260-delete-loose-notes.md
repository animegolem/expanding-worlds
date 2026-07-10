---
node_id: AI-IMP-260
tags:
  - IMP-LIST
  - Implementation
  - notes
  - lifecycle
  - field-report
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed:
---


# AI-IMP-260-delete-loose-notes

## Summary of Issue #1

alph, v0.20.0, 2026-07-10: "need a way to delete loose notes." A
note with no placement currently has NO delete affordance — the
board context menu needs a placement, and the pre-implementation
review must confirm what the outline, gallery, and note panel
offer today (hypothesis: nothing). This is also the §9.2
invisible-node problem wearing its note face: strand a note and
the only exit is search. Done means: a loose note can be sent to
Trash from the surfaces where loose notes are actually
encountered — the outline and the note panel's own menu (gallery
if the review shows loose notes surface there) — using the
EXISTING trash verb + undo policy (this is affordance work, not a
new lifecycle verb).

### Out of Scope

- Purge/retention semantics (§9, shipped).
- Bulk operations beyond what Gallery already has.
- The node-reachability design question broadly (RFC §9.2 owns it).

### Design/Approach

Pre-implementation review: confirm the affordance census and which
trash command applies to a note-bearing node without placements
(likely the same TrashNode family the board menu dispatches);
verify undo restores a loose note to loose (not placed). Then:
context-menu entry in the outline row + a Trash action in the note
panel menu, dispatching the existing command through the existing
gateway seam (respect the FR-23 envelope-consolidation direction —
no new hand-rolled envelopes). Confirmation grammar matches the
board's trash flow (§16 menu grammar).

### Files to Touch

(Census in review; expected:)
- `apps/desktop/src/renderer/views/OutlineView.svelte`: row menu.
- Note panel menu component.
- e2e: loose-note trash + undo round-trip.
- `RAG/HUMAN-TESTING.md`: alph entry.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: affordance census + applicable
      command + undo shape recorded here.
- [ ] Outline row menu: Trash on a loose note (existing verb, no
      hand-rolled envelope).
- [ ] Note panel menu: Trash, same dispatch.
- [ ] Undo restores the note as loose; e2e round-trip green.
- [ ] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** a note with no placements
**WHEN** the user opens its outline row menu (or its panel menu)
and chooses Trash
**THEN** the note moves to Trash under the standard retention
**AND** undo restores it as a loose note
**AND** the flow matches the board-item trash grammar.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
