---
node_id: AI-IMP-298
tags:
  - IMP-LIST
  - Implementation
  - tags
  - lens
  - design-adoption
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed:
---

# AI-IMP-298-lens-wires

## Summary of Issue #1

The lens grammar (tag hit = note-orange ring, miss dims, view-state
until dropped) is ruled ONE system across surfaces, and the kit
audit (letter items 15/17) found the two missing wires in the app's
scope: (a) HOME CANVAS — the tags charm should engage the lens on
the board: hit placements ring note-orange, misses dim (~0.35 per
the kit; board dim level per the tag-panel page), an active-lens ✕
chip shows while engaged, esc drops the lens BEFORE closing the
panel (exit ladder); ⌖ fly-to arrivals ring the landed placement
(the arrival ring §7.5 promises). (b) NOTE PAPER — the page's tag
chips are lens doors (§4.8/§7.5 one grammar); wiki-link hover
highlighting already exists per §7.5 (verify). GALLERY is ruled
correct NOT to lens (retrieval filters, it doesn't highlight).
Done means: both wires live against the EXISTING highlighted-
placement machinery, lens is view-state only (no commands), and
the exit ladder ordering is tested.

### Out of Scope

- The tag panel itself (its lens toggle shipped with T3; this
  ticket wires the BOARD side those toggles drive).
- Gallery lensing (ruled out).
- The graph's lens ring (EPIC-021).

### Design/Approach

Reuse §7.5's highlighted-placement visualization as the lens's
rendering (round-1 verifies it supports ring + dim-others
simultaneously; if it only rings, the dim layer is the addition —
engine-side, view-state, no per-frame allocation). The tags charm
(node charm census) engages a lens on its tag; the active-lens ✕
chip is chrome (top of board per the kit). Esc ordering: the key
handler drops the lens first, panel second (GR-2 rung order —
regression test). Fly-to arrival: navigation.ts's ⌖ landing sets a
one-shot arrival ring on the target placement via the same
machinery. Note paper: tag chips on the page call the same
lens-engage the tag panel uses.

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: tags-charm lens
  engage.
Engine highlighted-placement path (round-1 locates; §7.5
  machinery): ring + dim.
`apps/desktop/src/renderer/chrome/navigation.ts`: arrival ring.
`apps/desktop/src/renderer/keys/`: esc ladder ordering.
`apps/desktop/src/renderer/note/NotePanel.svelte`: tag chips as
  lens doors.
Active-lens chip component (chrome/).
e2e: lens engage/dim/✕/esc-order + arrival ring.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Round-1: verify §7.5 machinery capabilities (ring? dim?),
      the tag panel's shipped lens toggle path, esc handler
      structure, and the kit's lens vocabulary (dim levels, chip
      anatomy); record corrections here.
- [ ] Tags charm engages the lens; hits ring note-orange; misses
      dim; view-state only (dropping the lens restores exactly;
      no command records).
- [ ] Active-lens ✕ chip while engaged; click drops the lens.
- [ ] Esc drops lens before panel (ordering test).
- [ ] ⌖ fly-to arrival rings the landed placement once.
- [ ] Note-page tag chips engage the same lens (beat names the
      contract per the kit).
- [ ] No per-frame overhead added (dim/ring are state-driven).
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** one lens, three doors.
**GIVEN** a board with tagged and untagged placements
**WHEN** the user engages the tag lens from the tags charm, then
from the tag panel, then from a note page's chip
**THEN** all three produce the same board state: hits ringed,
misses dimmed, ✕ chip visible
**AND** esc drops the lens first (board restores) and only a
second esc closes the open panel
**AND** undo history is untouched by any of it.

### Issues Encountered

