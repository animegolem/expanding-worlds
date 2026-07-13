---
node_id: AI-IMP-293
tags:
  - IMP-LIST
  - Implementation
  - rail
  - chrome
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-292, AI-IMP-294]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed: 2026-07-13
---

# AI-IMP-293-rail-recomposition

## Summary of Issue #1

The rail table (owner-ruled 2026-07-11, kit-drawn 07-12) recomposes
the right rail to "ways of seeing this world": LENS TOGGLES ONLY —
⊞ gallery · ▤ outline · ⊛ graph (inert-with-why until EPIC-021
ships it) — plus ⌕ as the door to the search palette (kit
refinement of the table) and the ⚠ PERCH pinned at the rail's foot
as its own species (the app's one status organ). The leavers: ☰
moves to the title strip (window chrome on the band; the top-right
corner belongs to ☰ alone), ⧉ project dissolves (switch lives in
the project picker; open-as-source becomes a gallery-takeover scope
affordance). Supersedes AI-IMP-207 half 2. Done means: the rail
reads as the ruled composition, every leaver's verb reachable in
its new home, ⚠ perch anchored at the foot, 207 closed by pointer.

### Out of Scope

- The graph takeover itself (EPIC-021) — only its inert rail rung.
- The project picker's overlay form (queued separately) — ⧉'s
  switch verb routes to the EXISTING picker surface.
- The palette (AI-IMP-294) and board menu (AI-IMP-292) — landed
  dependencies this ticket rewires the rail against.

### Design/Approach

CharmRail.svelte recomposes per the kit's rail drawing: lens
toggles with exclusivity (shipped behavior preserved), ⌕ door,
⚠ perch at the foot (own species — not a charm; position fixed,
carries the GR-3 class-6 contract already shipped in status.ts).
☰ relocates into TitleStrip's top-right (292 has already freed the
corner composition). Open-as-source: gallery takeover gains the
scope affordance per the ruled table (round-1 verifies the gallery
scope UI's shape before wiring — if the gallery side needs real
design-level work beyond a scope row, flag to the lead instead of
improvising). Graph rung renders inert with why-tooltip ("arrives
with the graph epic") per GR-2's disabled-forever retirement.

### Files to Touch

`apps/desktop/src/renderer/chrome/CharmRail.svelte`: the
  recomposition.
`apps/desktop/src/renderer/chrome/TitleStrip.svelte`: ☰ hosting.
`apps/desktop/src/renderer/chrome/status.ts` region: perch anchor
  position (foot of rail).
Gallery takeover scope affordance (views/ — round-1 locates).
`RAG/AI-IMP/AI-IMP-207-rail-surface-exclusivity.md`: close half 2
  with pointer.
e2e: rail composition + leavers-reachable spec; existing rail
  specs updated.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify current rail inventory + exclusivity
      machinery, ⚠ perch rendering, TitleStrip corner state after
      292, the gallery scope surface, and 207's remaining scope;
      record corrections here.
- [x] Rail = ⊞ ▤ ⊛(inert+why) ⌕ + ⚠ perch at foot; kit geometry;
      tooltips; exclusivity regression-tested.
- [x] ☰ lives in the strip's top-right; its menu unchanged.
- [x] ⧉ removed; project switch reachable via the picker route;
      open-as-source reachable via the gallery scope affordance
      (or flagged to the lead if the gallery side is undrawn in
      practice).
- [x] ⚠ perch keeps its producer contract (status.ts tests
      green); leaves with its last condition per the kit.
- [x] AI-IMP-207's cancelled-with-pointer record still matches
      what shipped; half-1 record intact.
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** the recomposed rail.
**GIVEN** a project open on a board
**WHEN** the user reads the rail
**THEN** it shows exactly gallery, outline, graph (inert with a
why-tooltip), search, and the ⚠ perch at the foot when a condition
exists
**AND** ☰ opens from the strip's top-right
**AND** project switching remains reachable within two
interactions from the strip
**AND** lens exclusivity behaves as before (regression suite
green).

### Issues Encountered

Round-1 source verification corrected four ticket premises before
implementation:

- `status.ts` owns condition production only; the perch anchor is wholly
  `CharmRail.svelte` layout. Per the accepted ruling, neither `status.ts`
  nor AI-IMP-207 is edited.
- No project-picker overlay exists yet. The interim “Switch world…” door
  therefore lives in ☰ and reuses Electron's native directory-dialog
  pattern plus the existing renderer-bound, one-use `restore:open`
  capability. Main validates `project.sqlite` before issuing authority;
  an arbitrary renderer path can neither relaunch nor silently create a
  project.
- The old ⧉ source door was a raw text field, not a chooser seam. It is
  replaced by a native main-owned folder choice in the gallery scope bar,
  then reuses the shipped `openSourcePanel`/source-slot path.
- Pinning the perch makes the rail container full-height. The container is
  deliberately pointer-transparent while each real charm and the perch
  opts back into hit testing, so the new empty middle cannot steal board
  gestures.

The title-band ☰ retains the shipped menu inventory and behavior; the
only added row is the accepted live “Switch world…” route. It is anchored
independently at the band's top-right, so the drag strip keeps pure
reveal/tuck behavior and the existing “title strip: never” setting cannot
strand the only route back to Settings. Windows reserves the native
overlay-control width and Linux keeps its drawn controls alongside it.

Validation after a clean desktop build:

- `pnpm check:ci`: green — commands 19, domain 60, shared-ui 1,
  protocol 1, canvas-engine 409, persistence 658; repository build,
  lint, and spike typecheck all green.
- Desktop Vitest: 74 files, 553 tests green.
- Focused 293 boundary gate: 19/19 green (shell/menu, Settings strip
  modes, recovery/perch, source panel, loose-note Trash); the separate
  board-tooling run was 7/7 green and pins the transparent full-height
  rail against gesture interception.
- All remaining specs that enter ☰ through the shared helper: 44/44
  green (caption, export/import, first-run, GC, inputs, navigation
  scheme, reservation, restore, retention, Trash, undo).

One deliberately useful failed diagnostic preceded the final gate: the
first full-height rail build left `pointer-events:auto` on its transparent
middle. Playwright named the rail as the interceptor over Arrange; the
container is now transparent and the regression passes. A second focused
round exposed that TitleStrip's old takeover unmount would hide both ☰ and
Linux controls; keeping window furniture mounted convicted and fixed that
boundary before commit.
