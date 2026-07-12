---
node_id: AI-IMP-293
tags:
  - IMP-LIST
  - Implementation
  - rail
  - chrome
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-292, AI-IMP-294]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed:
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

- [ ] Round-1: verify current rail inventory + exclusivity
      machinery, ⚠ perch rendering, TitleStrip corner state after
      292, the gallery scope surface, and 207's remaining scope;
      record corrections here.
- [ ] Rail = ⊞ ▤ ⊛(inert+why) ⌕ + ⚠ perch at foot; kit geometry;
      tooltips; exclusivity regression-tested.
- [ ] ☰ lives in the strip's top-right; its menu unchanged.
- [ ] ⧉ removed; project switch reachable via the picker route;
      open-as-source reachable via the gallery scope affordance
      (or flagged to the lead if the gallery side is undrawn in
      practice).
- [ ] ⚠ perch keeps its producer contract (status.ts tests
      green); leaves with its last condition per the kit.
- [ ] AI-IMP-207's cancelled-with-pointer record still matches
      what shipped; half-1 record intact.
- [ ] Unit + e2e green; full local gate green with counts read.

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

