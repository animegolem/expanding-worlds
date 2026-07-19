---
node_id: AI-IMP-315
tags:
  - IMP-LIST
  - Implementation
  - note-paper
  - lifecycle
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-031-the-notes-epic]]
confidence_score: 0.75
date_created: 2026-07-19
date_completed:
---

# AI-IMP-315-lifecycle-door-normalization

## Summary of Issue #1

Three census convictions on doors and identity. (1) The selection
note charm KNOWS the selected placement but drops that anchor when
it calls `requestOpenNote(noteId)` (`canvas/charms-ui.ts:746-755`),
while the hint-page door passes it correctly; the multi-placement
fallback resolver's comment says "exactly one obvious home" but the
code accepts any positive count and silently picks the first active
placement (`note/panels.ts:218-245`). (2) Pinning an ordinary
non-bound panel to the glass produces a plain bordered card — no
tape, no scar (`NotePanel.svelte:1011-1019,1765-1782`) — violating
the hardware law that tape identifies glass. (3) The shipped
lifecycle is serial book → tape → world, while ratified kit 1.6
(§8.5 rev 0.73) gives direct pin/tape branches and direct rebind.
Done means: every door passes the anchor it knows, ambiguity gets a
chooser (never silent-first), pinned paper carries tape + scar, and
the direct branch/rebind vocabulary exists under the settled
durability rule.

### Out of Scope

Floating-window geometry (314); rungs (313); open-as-flight and the
big editor (owner-gated); any change to AI-IMP-296's durable
semantics.

### Design/Approach

Durability rule (settled notes-census r2, preserving AI-IMP-296):
posture transitions are PRESENTATION-ONLY except where they cross
the world boundary — exactly the existing durable pair
(`PlaceAsCard` / `DeleteContent`), one durable undo step per world
crossing. Landmark identity (same settle): scar + angled pin belong
to note PAPER placed via pin-to-world regardless of book ancestry;
plain place-as-card of non-paper stays a plain card. The
multi-placement chooser follows the alph-wave precedent (AI-IMP-311
places chooser — never deterministic-first). Charm door: thread the
selection's placement id through `requestOpenNote`.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: charm passes its
known anchor.
`apps/desktop/src/renderer/note/panels.ts`: resolver honest —
one home opens, many homes ask.
`apps/desktop/src/renderer/note/NotePanel.svelte` +
`NotePanels.svelte`: tape/scar on pinned paper; direct
branch/rebind verbs per the durability rule.
`apps/desktop/e2e/` (panels/note-lifecycle): anchor-fidelity census
per door; chooser proof; pinned-paper hardware capture
(NOTE-PANEL-01/02 shapes).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify census citations + the 296 boundary;
      corrections here before code.
- [ ] Charm door passes the selected placement's anchor; hint-page
      door behavior unchanged; per-door anchor census green.
- [ ] Resolver: one active placement opens tethered; multiple →
      chooser (311 pattern); zero → loose. No silent first.
- [ ] Pinned non-bound paper mounts tape + torn scar.
- [ ] Direct branches/rebind exist; every world crossing is exactly
      one durable undo step; presentation transitions add none
      (undo-stack census).
- [ ] 296's e2e lifecycle walk remains green.

### Acceptance Criteria

**Scenario:** Opening a multi-placement note from the charm.
**GIVEN** a note with three placements, one selected on the board.
**WHEN** the user opens it via the selection charm.
**THEN** the panel tethers to THE SELECTED placement,
**AND** opening the same note from a surface with no anchor asks
via the chooser instead of picking the first.

**Scenario:** Pinning a loose note to the glass.
**WHEN** the user pins the standard panel.
**THEN** it carries tape and the torn scar,
**AND** the undo stack gained no entry for the presentation change.

**Scenario:** Direct rebind.
**GIVEN** a landmark on the board.
**WHEN** the user rebinds it to its book.
**THEN** the placement delete is one durable undo step and the
page returns without duplication.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
