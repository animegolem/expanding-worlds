---
node_id: AI-IMP-191
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-08
---


# AI-IMP-191-title-strip-fidelity

## Summary of Issue #1

Owner testing notes (2026-07-08, v0.15.0, screenshots): the shipped
path/title area diverges from the ratified design (Signature Pin
Changes decision 01 + the Pin & Menu Motion Prototype): (1) the
board name wears a PILL BOX the design doesn't have — the path
renders as bare text in the strip; (2) spacing next to the traffic
lights is cramped/wrong vs the prototype's layout; (3) decision
01's hover reveal — "a smoky near-black gradient, not a bar" —
is not rendered at all: hovering the top band should raise a soft
dark gradient that IS the drag handle, and it currently shows
nothing. Done means the top band matches the prototype: bare
path text properly spaced from the traffic lights, pin at
cap-height beside the name (already shipped), and the smoky
gradient fading in on hover across the strip.

### Out of Scope

- The pin/beat/menu (shipped, AI-IMP-166).
- The move/resize chord (AI-IMP-174).
- Crumb label refresh on rename (master-list P3, separate).

### Design/Approach

NORMATIVE VISUALS: RAG/design/Pin & Menu Motion Prototype.dc.html
(open it, measure the strip: text treatment, spacing, gradient
stops) and Signature Pin Changes decision 01. Remove the pill
background from the path/board-name element (bare text on the
gradient); set the traffic-light inset spacing per the prototype;
add the hover-revealed gradient band (opacity-only transition —
chrome animates ONE property; tokens only, no raw hex outside
theme.css). The gradient layer must not intercept canvas events
except as the drag region it already is.

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`,
`TitleStrip.svelte`, theme.css (gradient tokens if new), e2e:
hover → strip band opacity rises; path text has no pill
background (computed style assert).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pill removed; bare path text; prototype spacing at the
      traffic lights.
- [ ] Smoky hover gradient, opacity-only, tokenized.
- [ ] Drag-handle behavior unchanged; pin/beat untouched.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the pointer hovers the top band
**THEN** a smoky near-black gradient fades in (no bar, no pill),
the path reads as bare text spaced per the prototype beside the
traffic lights, and dragging the band still moves the window.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
