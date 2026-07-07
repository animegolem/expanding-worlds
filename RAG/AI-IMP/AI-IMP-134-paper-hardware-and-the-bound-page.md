---
node_id: AI-IMP-134
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - notes
  - panels
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic: [[AI-EPIC-023-paper-note-lifecycle]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-134-paper-hardware-and-the-bound-page

## Summary of Issue #1

EPIC-023 FR-1. The shipped tethered panel (dashed SVG tail, 9px
radius, drop shadow) becomes the OPEN BOOK per rev 0.55 §8.5: the
page binds directly to its image's side — binder rings straddling
the seam (punched: fill = board color), square corner on the
binding edge (`0 9px 9px 0` mirrored per side), FLAT (no shadow —
world content), and its size matches the SHARED edge: image height
when side-bound (width free); a wide image (≳1.4:1) binds BELOW
like a calendar at image width. Binding side chosen at open by
image shape + free viewport (§8.8 region math), stable for the
panel's life. Done means: opening a note on a placed image
presents the bound page with the hardware, world-scaling exactly
as the rev 0.47 tethered panel does today, degrading per the
shrink ladder (rings → bound-edge stroke → whole-page fade).

### Out of Scope

- All transitions (tear/tape/pin — AI-IMP-135). The pin control
  still converts to today's pinned panel in this ticket; 135
  reskins that state.
- Anchorless notes (board note charm panel) keep their current
  presentation — only image-anchored opens bind.
- Big-editor rework (135's tear-to-center).

### Design/Approach

Paper primitives as reusable Svelte pieces (BinderRings, TornEdge,
Tape, PushPin) styled ONLY from 130's tokens — the kit's JSX +
`materials-paper.html` are the visual reference; clip-path tears
may be re-crafted but stay token-colored. NotePanel gains a
`bound` presentation replacing `tethered`'s look (same lifecycle
slot, same §8.5 one-at-a-time and §7 commit semantics — this is a
reskin plus GEOMETRY): position from the anchor placement's world
rect (side chosen by aspect + free region, the decision function
pure and unit-tested), height (or width when bottom-bound) locked
to the shared edge through zoom via the existing world-scale
transform (rev 0.47 machinery), rings rendered straddling the
seam. The dashed tail dies for image-anchored panels (the binding
IS the attribution; §8.5 indicator table's on-screen row updates
in 135's RFC-consistency check — flag, don't edit RFC here).
Degradation: consume EW_PAGE_FLOOR_PX (or local constant if 133
unmerged, flagged): rings→stroke below ~40% page render, whole
page fades below the floor (charm rule).

### Files to Touch

`apps/desktop/src/renderer/note/paper/` (new): the four
primitives (+ vitest where logic exists, e.g. ring count by
height).
`apps/desktop/src/renderer/note/NotePanel.svelte` + `panels.ts`:
bound presentation, side-choice fn (pure, exported, unit-tested),
shared-edge sizing.
`apps/desktop/e2e/note-lifecycle.spec.ts` (new): open portrait →
side-bound height-matched; open wide → bottom-bound width-matched;
zoom → page scales with image, rings degrade.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Primitives on tokens only (guard green); reusable, no
      NotePanel-specific leakage.
- [ ] Side-choice pure fn: aspect ≳1.4 → below; else freer
      viewport side; unit matrix.
- [ ] Shared-edge sizing holds through zoom (e2e asserts page
      rect tracks image rect at two zooms).
- [ ] Flat (no shadow) bound page; pinned state unchanged this
      ticket.
- [ ] Ring degradation per ladder; whole-page fade at the floor.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      book read instantly; ring weight; wide-image calendar feel).

### Acceptance Criteria

**GIVEN** a portrait image's note opened
**THEN** the page binds to the freer side at exactly the image's
height, rings on the seam, flat, and scales with the world.
**GIVEN** a wide (≥1.4:1) image
**THEN** the page binds below at the image's width, rings on top.
**GIVEN** deep zoom-out
**THEN** rings degrade to a stroke, then the page fades whole.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
