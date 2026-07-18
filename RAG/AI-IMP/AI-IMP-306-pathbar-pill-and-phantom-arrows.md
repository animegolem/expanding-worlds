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
overlay rung is reachable from the strip. Approach after review:
keep the arrows mounted, but move their host out of flex flow onto
a local absolute overlay anchored at Home. `pointer-events:none`
gates the host and buttons at rest; path hover reveals them on a
separate vertical rung so resident clicks remain operable.
Keyboard/history chords are unaffected. The existing `0.15rem`
token is the one ruled gap between Home and the first entry-route
crumb.

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`: slot collapse,
overlay reveal, gap.
`apps/desktop/e2e/navigation.spec.ts`: rest
geometry pin + phantom-hit assertion + reveal-no-shift pin.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Round-1 review: verify PathBar structure, reveal state
      source, overlay reachability; record corrections here first.
- [x] Arrow slot reserves zero width and owns zero hit targets at
      rest (`elementsFromPoint` proof at the old slot coordinates).
- [x] Home→first-route-crumb rest gap = one ruled token; crumb rect pinned.
- [x] Hover reveal draws arrows on the overlay at the seam;
      pill rect identical during reveal; 120ms beat preserved;
      arrows fully operable while revealed.
- [x] e2e: rest census (gap + no phantom hits) and reveal census
      (pill stationary, arrows clickable) at 960 and full width.
- [x] Evidence: rest/reveal screenshots + rects.

### Acceptance Criteria

**Scenario:** The path bar at rest.
**GIVEN** a board open with history available.
**WHEN** nothing is hovered.
**THEN** the first entry-route crumb sits one ruled gap from Home
(and is the current-board pill on a one-entry route),
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

#### Round-1 source verification (2026-07-17)

- **Diagnosis convicted.** Home, `.arrows`, and the entry-route crumbs
  are flex siblings (`PathBar.svelte:146-211`). The arrow host remains
  `display:flex` at `opacity:0` with no hit-test gate
  (`PathBar.svelte:335-355`), so the invisible controls both reserve
  width and own pointer targets.
- **Overlay scope corrected.** No global anchored-popover machinery is
  needed: ChromeLayer is already an absolute, pointer-transparent
  overlay (`ChromeLayer.svelte:104-115`) and PathBar's wrapper is
  absolute on its own raised rung (`PathBar.svelte:244-266`). Keep an
  always-mounted, locally absolute arrow host so the 120ms opacity beat
  survives; use `pointer-events:none` at rest and enable hits only while
  revealed.
- **Geometry wording corrected.** The stable promise is
  Home-to-**first route crumb** = one existing resident gap
  (`PathBar.svelte:276-298`), not Home-to-current for every history
  depth. RFC 8.1 requires all entry-route crumbs to remain visible
  (`RFC:2027-2036`). The one-entry/root screenshot makes the first crumb
  the current crumb. The verdict should confirm that the existing
  `0.15rem` gap is the ruled gap; this ticket must not invent a number.
- Existing navigation e2e proves hover/click behavior only
  (`e2e/navigation.spec.ts:68-74`). Repair stays in PathBar plus that
  spec: at 960 and full width pin rest rects/hit stacks, reveal without
  any crumb rect movement, then prove Back/Forward remain operable.
- **Implementation evidence.** The full navigation shard passed 10/10
  after build. Rest/reveal captures at 960 and 1280 were inspected;
  the resident gap remained the computed token, arrows owned neither
  sampled hit at rest, and the first crumb's full DOMRect was identical
  through reveal. An initial same-row overlay intercepted the existing
  crumb click; moving the absolute host to the adjacent vertical rung
  preserved both the no-reflow promise and resident navigation.
