---
node_id: AI-IMP-200
tags:
  - IMP-LIST
  - Implementation
  - notes
  - panels
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-200-panel-legibility-floor

## Summary of Issue #1

Owner review FAIL on AI-IMP-083/116 (2026-07-08): tethered notes
"render far too small in most cases, to the point they are almost
unperceivable as even open," the notebook effect isn't selling,
and undocking jumps the size 4–6× — a jarring discontinuity. Plus:
the big editor's shadows "do not read" (it opens fine). Root
shape: 116 made tethered panels scale WITH the world, so at the
zoom levels boards actually live at, a panel is a postage stamp;
the legibility floor (PANEL_LEGIBILITY_FLOOR 0.4) fades it rather
than holding it readable. Done means a tethered panel never
renders below a MINIMUM ON-SCREEN size — world-scaled until the
floor, then held at the floor (screen-fixed) instead of shrinking
away — closing most of the undock jump; and the big editor wears
a shadow that actually reads (per The Two Materials' material
rules), both themes.

### Out of Scope

- Paper anatomy (AI-IMP-194 — coordinate, likely same builder
  wave).
- The wedge bug (199) and spawn flash (193).
- Pinned-panel behavior (screen-fixed already, passed review).

### Design/Approach

Replace fade-at-floor with hold-at-floor: the panel's world scale
clamps at max(worldScale, MIN_PANEL_SCREEN_SCALE) — below the
clamp it behaves like a mini pinned panel glued to its anchor
(position still world-tracked, size screen-held). Keep a deep-zoom
fade only where even the held panel would occlude everything
(far-out overview). Tune MIN so default-size panels are readable
at typical board zoom; the undock jump then shrinks naturally —
verify the remaining ratio and record it. Big-editor shadow: token
value per Two Materials (paper casts), check both themes over art.
All constants named, owner feel-tunes.

### Files to Touch

`note/panels.ts` / `NotePanel.svelte` (scale clamp),
`NotePanels.svelte`/big-editor styles, theme.css token if needed.
E2e: panel on-screen size never below the floor across a zoom
sweep; existing world-scale specs updated to the new clamp.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Hold-at-floor clamp; readable at typical zooms; deep-zoom
      behavior defined and deliberate.
- [ ] Undock size ratio measured before/after and recorded.
- [ ] Big-editor shadow reads in both themes.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a tethered note at any board zoom
**THEN** it is never smaller on screen than the legibility floor —
open notes always read as open
**AND** undocking no longer multiplies the size 4–6×.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
