---
node_id: AI-IMP-298
tags:
  - IMP-LIST
  - Implementation
  - tags
  - lens
  - design-adoption
kanban_status: completed
depends_on: []
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed: 2026-07-13
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

- [x] Round-1: verify §7.5 machinery capabilities (ring? dim?),
      the tag panel's shipped lens toggle path, esc handler
      structure, and the kit's lens vocabulary (dim levels, chip
      anatomy); record corrections here.
- [x] Tags charm engages the lens; hits ring note-orange; misses
      dim; view-state only (dropping the lens restores exactly;
      no command records).
- [x] Active-lens ✕ chip while engaged; click drops the lens.
- [x] Esc drops lens before panel (ordering test).
- [x] ⌖ fly-to arrival rings the landed placement once.
- [x] Note-page tag chips engage the same lens (beat names the
      contract per the kit).
- [x] No per-frame overhead added (dim/ring are state-driven).
- [x] Unit + e2e green; full local gate green with counts read.

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

### Round-1 source verification (2026-07-13)

The ticket understates what shipped. The engine already implements both
halves of the board lens: outsiders dim to `LENS_DIM_ALPHA = 0.25` and
members receive the note-orange ring (`packages/canvas-engine/src/lens.ts:
1-20,81-87`); the host exposes set/clear/read/change seams
(`renderer/canvas/host.ts:144-154`). TagPanel already applies the active
canvas placement ids and follows engine-side clears
(`renderer/tags/TagPanel.svelte:338-372`). Its Escape ladder already
declines the first press while a lens exists, then closes the panel on
the next (`:374-405`). These paths are reuse, not round-2 additions.

The missing board work is identity coordination and doors. Today both
the node charm and note-paper chip merely call `openTagPanel`
(`renderer/canvas/charms-ui.ts:533-545` and
`renderer/note/NotePanel.svelte:1474-1489`), while the engine lens stores
only placement ids. Proposed repair: one renderer lens coordinator owns
the active tag id/name plus membership, drives the existing host lens,
and feeds the one active-lens chip. Charm, TagPanel, and note chip call
that same coordinator; no command or persistence record is introduced.

The arrival ring is genuinely absent. Existing ⌖ routes center through
`requestCenterPlacements` (`TagPanel.svelte:415-427`) and the engine lens
ring is inseparable from its dim-others state. Round 2 therefore adds a
sanctioned, transient one-shot arrival pulse beside (not inside) the
durable lens state; reusing `setLens` would incorrectly dim the board.

The “wiki-link hover highlighting already exists” premise is false.
Wiki links have state classes (`note/wiki-link-plugin.ts:40` and
`NotePanel.svelte:2068-2088`), but no hover event engages placement
highlighting; the only documented hover chip is for ordinary URL domains
(`renderer/editor-face.css:130-140`). That wire is outside this ticket's
named two missing surfaces and is recorded as deferred rather than
invented here.

Round-1 ruling: coordinator, two missing doors, active chip, and transient
arrival ring are accepted as proposed. Wiki-link hover as a lens door is
explicitly deferred to design debt.

### Issues Encountered

- The semantic tag identity did not belong in the engine's placement-id
  lens. A renderer-session coordinator now owns identity and synchronizes
  engine-side clears, so charm, panel, page, and the active chip cannot
  drift into four independent lens states. Async door queries carry a
  generation guard; a late result cannot overwrite a newer lens.
- The first focused e2e run exposed two stale rename-test assumptions:
  those tests opened the panel through a tag chip but expected the next
  Escape to close it. A chip is now a lens door, so the correct ladder is
  editor → lens → panel, one layer per press. The assertions now name and
  pin each layer; no product behavior was weakened.
- The ⌖ arrival ring is a separate one-shot map on the existing shared
  world-beat ticker. It borrows the lens ring vocabulary but never calls
  `setLens`, never dims outsiders, clears on canvas reset, and leaves no
  idle per-frame work.
- Focused validation: coordinator unit 3/3; hidden-window tag e2e 8/8.
  Full `CI=true pnpm check` green: shared-ui 1, commands 19, domain 60,
  protocol 1, canvas-engine 410, persistence 659, desktop unit 560, and
  hidden-window e2e 273 (6.1m); eslint and spike typecheck green. The
  isolated clone printed its known non-failing `git main` diagnostic.
