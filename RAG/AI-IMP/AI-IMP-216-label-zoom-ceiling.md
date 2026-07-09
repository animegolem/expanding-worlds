---
node_id: AI-IMP-216
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - labels
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-216-label-zoom-ceiling

## Summary of Issue #1

Owner Parking Lot flush (2026-07-09, on v0.16.0, screenshot): at
board zoom (~37%) a placement title label ("Beyrl") renders HUGE
relative to its shrunken artwork, dominating the view — "past a
certain readable zoom level titles should no longer be displayed."
Labels keep screen legibility while the world shrinks, so far out
they invert the hierarchy: chrome dwarfing content (the same
doctrine violation 192 just fixed for the charm bar). Done means:
FIRST diagnose and document the label's actual scaling rule
(packages/canvas-engine/src/renderers/placement.ts renders it;
host.ts positions "screen-constant chrome"); THEN labels
fade/hide once their PLACEMENT's rendered size crosses below a
threshold derived from the shrink-ladder family (the 192/133
constants — no new magic numbers), so a label never outweighs the
thing it names. Fade preferred over pop if a cheap opacity ramp is
available in that renderer; either way the transition must not
flicker at the boundary during a zoom glide (hysteresis or the
ladder's existing banding).

### Out of Scope

- Frame titles (187 owns rotated frame adornments).
- Label content/typography.
- The 192 selection dismissal (shipped; this is the label
  sibling).

### Design/Approach

Read the placement renderer's label path and name the current rule
in the ticket (screen-fixed px? clamped world scale?). Gate on the
placement's rendered max edge vs a ladder constant (likely
EW_FURNITURE_MIN_PX is too low for text — labels probably want the
page-floor tier; pick from the EXISTING constants and justify).
Apply at the same point the renderer already receives zoom, so no
new per-frame work. Unit the threshold decision; e2e: zoom out
past the floor → label gone/faded, zoom in → returns (labels are
presentation, not selection — unlike 192, they resurrect).

### Files to Touch

`packages/canvas-engine/src/renderers/placement.ts` (+ shrink-
ladder import), engine unit test, a canvas e2e assert.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Current label scaling rule diagnosed and documented.
- [ ] Labels fade/hide below the chosen ladder threshold; return
      on zoom-in; no boundary flicker.
- [ ] Threshold from existing constants, choice justified; unit +
      e2e.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the
      threshold tier is a feel call — flag it).

### Acceptance Criteria

**GIVEN** a labeled placement and the camera zooming out
**WHEN** the artwork shrinks below the legibility floor
**THEN** its label yields with it — a title never dominates a
board it can no longer describe — and zooming back in restores it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
