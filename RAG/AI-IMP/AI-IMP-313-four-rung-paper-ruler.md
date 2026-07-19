---
node_id: AI-IMP-313
tags:
  - IMP-LIST
  - Implementation
  - note-paper
  - zoom-ruler
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-031-the-notes-epic]]
confidence_score: 0.75
date_created: 2026-07-19
date_completed:
---

# AI-IMP-313-four-rung-paper-ruler

## Summary of Issue #1

Note paper's shrink behavior is a generic three-state ladder keyed
on rendered shared-edge thresholds of 48px and 8px
(`packages/canvas-engine/src/shrink-ladder.ts:18-34,46-63`) — not
the ratified four-rung posture ruler (RFC §8.5 rev 0.73: full →
rings-only with text as texture → bound-edge stroke → gone, at
100/50/25/8; RFC lines 2454-2469). The census also convicted a
zoom-honesty violation on the landmark: its push pin is clamped to
12–30 SCREEN pixels (`NotePanels.svelte:170-190`), leaving screen
furniture floating over a world object at 8%. Done means: world
paper (bound page + landmark) renders the named rung at each
ratified camera stop, skipping none; landmark hardware joins the
ruler (nothing screen-clamped at the dot rung); the sticky's glass
invariance (never scales) is pinned as its own proof. AUTHORITY
NOTE: the kit's ruler specimen shows 50/100/200 and is STALE —
acceptance cites the RFC numbers (census verdict; kit redraw is
owner-owed, DESIGN-QUEUE 2026-07-19).

### Out of Scope

The kit specimen redraw (owner's sitting); bound-measure width
(AI-IMP-312); floating-window geometry (AI-IMP-314); any change to
the sticky beyond pinning its existing invariance.

### Design/Approach

Introduce a paper-specific ruler beside (not inside) the generic
shrink ladder: camera-zoom-keyed rungs at 100/50/25/8 with
hysteresis so rung flips don't flicker at boundaries. Rung
renderings: full live editor · rings + text-as-texture (no live
DOM editor; text rendered as static texture) · bound-edge stroke ·
gone/dot-census. The census records that today the FULL LIVE EDITOR
stays mounted at the degraded rung (`NotePanel.svelte:1365-1387,
1603-1608,1744-1762`) — the text-as-texture rung is new work, and
it is also a performance win (no live DOM at overview zooms). The
landmark pin/scar adopt world scaling below the rung where the
clamp currently holds them (12px min dies at the dot rung).

### Files to Touch

`packages/canvas-engine/src/shrink-ladder.ts` (or a sibling
`paper-ruler.ts`): the four-rung, camera-keyed ruler + hysteresis.
`apps/desktop/src/renderer/note/NotePanel.svelte`: rung consumption;
texture rung swaps the live editor out.
`apps/desktop/src/renderer/note/paper/BinderRings.svelte`: rings-only
rung.
`apps/desktop/src/renderer/note/NotePanels.svelte`: landmark
pin/scar join the ruler.
`apps/desktop/e2e/note-lifecycle.spec.ts` (or new spec): one proof
per rung per posture + sticky invariance (NOTE-ZOOM-01/02 shapes).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify census citations + current ladder
      consumers; record corrections here before code.
- [ ] Four-rung ruler exists, camera-keyed at 100/50/25/8 with
      hysteresis; unit tests cover boundaries + flicker guard.
- [ ] Bound page: rings/text-as-texture rung real (live editor
      unmounted); stroke rung; gone rung; no rung skipped.
- [ ] Landmark: scar + pin scale with the world at the low rungs;
      nothing screen-clamped at 8%.
- [ ] Sticky: rendered size byte-identical across all four camera
      stops (glass invariance pinned).
- [ ] e2e: one capture/assert per rung per posture (ZOOM-01) +
      sticky equality (ZOOM-02).

### Acceptance Criteria

**Scenario:** One board, three postures, four camera stops.
**GIVEN** a bound page, a landmark, and a sticky on one board.
**WHEN** the camera steps 100 → 50 → 25 → 8%.
**THEN** the bound page shows live text → rings + text texture →
stroke → gone, in order, no skips,
**AND** the landmark's hardware scales with the world at the low
rungs,
**AND** the sticky's rect is identical at every stop.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
