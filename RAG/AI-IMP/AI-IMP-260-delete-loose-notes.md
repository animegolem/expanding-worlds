---
node_id: AI-IMP-260
tags:
  - IMP-LIST
  - Implementation
  - notes
  - lifecycle
  - field-report
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
date_completed: 2026-07-10
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

- [x] Pre-implementation review: affordance census + applicable
      command + undo shape recorded here.
      CENSUS (2026-07-10): hypothesis CONFIRMED — `TrashNote`
      exists (handlers/lifecycle.ts:613, §9.4: note row alone
      flips, title-key reservation holds, inverse RestoreRecord)
      with ZERO renderer dispatchers. Loose notes surface in
      exactly two places: the outline's loose bin (listLooseNotes:
      active notes attached to no active node) and the note panel
      — NOT the gallery (it lists nodes; a loose note has no
      node), so the ticket's gallery contingency is void. TICKET
      CORRECTION: the acceptance criterion "undo restores it as a
      loose note" contradicts the ratified AI-IMP-233 matrix —
      TrashNote is EXEMPT ("trash-is-recovery-home: recovered
      from the Trash, not Mod+Z"); the round trip is trash →
      restore FROM THE TRASH VIEW → loose again, and TrashView
      already lists + restores notes. Dispatch seam: no shared
      envelope helper exists yet (FR-23 queued; Trash/Settings/
      GalleryActionBar still hand-roll), so both new surfaces use
      the CommandGateway-backed note project port
      (createNoteProjectPort) — the seam FR-23 consolidates onto,
      zero new hand-rolled envelopes.
- [x] Outline row menu: Trash on a loose note (existing verb, no
      hand-rolled envelope).
      As a row-action button beside "Place" (the outline's actual
      idiom — its rows have no context menus; building menu
      machinery for one verb exceeds the grammar's need), red per
      destructive-last-alone, hover-revealed like every row
      action. Lazily-created note project port, disposed on
      teardown; toast on commit/failure; the outline's existing
      project-changed refresh removes the row.
- [x] Note panel menu: Trash, same dispatch.
      ADJUSTED (no panel menu exists; flagged to owner in the
      batch proposal, approved): a "Trash this note" row under
      the unfolded uses list, shown ONLY when totalPlacements
      === 0 — the exit lives where the looseness shows, away
      from the header's misclick zone. Dispatches through the
      panel's existing port; the panel closes through the
      ordinary path (§7.1 flush contract holds).
- [x] Undo restores the note as loose; e2e round-trip green.
      SUPERSEDED per the review: TrashNote is undo-exempt.
      e2e/loose-note-trash.spec.ts (2 tests): outline trash → row
      leaves → getTrashView shows it → Trash-takeover restore →
      loose bin lists it again; panel trash on a loose note
      closes the panel + lands in Trash, and a PLACED note's
      uses list offers NO trash row. Gate: desktop vitest 406
      passed/1 skipped; e2e outline/trash/notes/panels/
      loose-note-panel/loose-note-trash 42/42, pipefail on.
- [x] HUMAN-TESTING entry for alph.

### Acceptance Criteria

**GIVEN** a note with no placements
**WHEN** the user opens its outline row menu (or its panel menu)
and chooses Trash
**THEN** the note moves to Trash under the standard retention
**AND** restore from the Trash view returns it as a loose note
(corrected at review: TrashNote is undo-exempt per AI-IMP-233 —
trash-is-recovery-home)
**AND** the flow matches the board-item trash grammar.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The acceptance criterion promised Mod+Z restore; the ratified
  undo matrix (AI-IMP-233) exempts TrashNote deliberately. The
  criterion was corrected at review rather than bending the
  matrix — recovery is the Trash view, and the e2e proves THAT
  round trip.
- "Note panel menu" landed as a uses-list row (no panel menu
  exists; one verb doesn't justify birthing one). Owner approved
  the placement in the batch proposal.
- Both surfaces dispatch through createNoteProjectPort rather
  than a third/fourth hand-rolled envelope — one more surface for
  FR-23 to NOT have to consolidate.
