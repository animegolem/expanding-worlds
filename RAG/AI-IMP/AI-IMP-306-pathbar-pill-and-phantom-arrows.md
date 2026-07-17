---
node_id: AI-IMP-306
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - path-bar
  - feel-pass
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-17
date_completed:
---

# AI-IMP-306-pathbar-pill-and-phantom-arrows

## Summary of Issue #1

Owner feel-pass (2026-07-17, via the feel-pass-geometry
consultation, field screenshot + source conviction): the
current-board pill sits far from the Home button because
Back/Forward arrows occupy the slot between them
(`PathBar.svelte:146-211`) while INVISIBLE at rest —
`.arrows` keeps `display:flex` at `opacity:0`, and its own comment
concedes opacity does not gate hit-testing (`:335-355`). Two
phantom buttons reserve width and own hit targets the user cannot
see. Ruled (consultation r2): collapse the arrow slot at rest AND
remove its hit ownership, closing Home→pill to one ruled gap; on
deliberate path hover the arrows reveal THROUGH THE OVERLAY above
the Home→pill seam and the pill DOES NOT move (engagement-cadence
grammar: hover lights, never moves; FLY-02's no-reflow law one
band up). Done means: rest geometry pinned, zero invisible hit
ownership, pill rect identical at rest and during reveal.

### Out of Scope

Any Search/palette work (owner withdrew the centering request —
recorded in the consultation); crumb/❖ redraws (kit-side); the
defaults-row item-1 investigation (stale pending 0.26.0 re-test,
its own ticket only if it reproduces).

### Design/Approach

Round-1 review verifies the PathBar structure and where the
overlay rung is reachable from the strip. Approach: arrows render
only while the reveal state is active (conditional mount or
`display:none` + `pointer-events:none` at rest — review picks the
cheaper one that preserves the 120ms opacity beat); the revealed
arrows mount on the anchored-popover/overlay rung positioned over
the Home→pill seam so resident layout never changes; keyboard/
history chords unaffected. One ruled gap token between Home and
pill at rest.

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`: slot collapse,
overlay reveal, gap.
`apps/desktop/test/e2e/*` (board-tooling/shell spec home): rest
geometry pin + phantom-hit assertion + reveal-no-shift pin.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify PathBar structure, reveal state
      source, overlay reachability; record corrections here first.
- [ ] Arrow slot reserves zero width and owns zero hit targets at
      rest (`elementsFromPoint` proof at the old slot coordinates).
- [ ] Home→pill rest gap = one ruled token; pill rect pinned.
- [ ] Hover reveal draws arrows on the overlay above the seam;
      pill rect identical during reveal; 120ms beat preserved;
      arrows fully operable while revealed.
- [ ] e2e: rest census (gap + no phantom hits) and reveal census
      (pill stationary, arrows clickable) at 960 and full width.
- [ ] Evidence: rest/reveal screenshots + rects.

### Acceptance Criteria

**Scenario:** The path bar at rest.
**GIVEN** a board open with history available.
**WHEN** nothing is hovered.
**THEN** the current-board pill sits one ruled gap from Home,
**AND** probing the old arrow coordinates finds no arrow hit
ownership.

**Scenario:** Deliberate reveal.
**WHEN** the pointer hovers the path region.
**THEN** the arrows appear over the Home→pill seam, fully
operable,
**AND** the pill's rect is byte-identical to its rest rect.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
