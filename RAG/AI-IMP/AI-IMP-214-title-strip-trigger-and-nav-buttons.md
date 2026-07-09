---
node_id: AI-IMP-214
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-09
---


# AI-IMP-214-title-strip-trigger-and-nav-buttons

## Summary of Issue #1

Owner Parking Lot flush (2026-07-09, on v0.16.0, closing out the
AI-IMP-191 review): three defects in the top band. (1) The smoky
strip's reveal trigger is effectively ONE pixel row at the very
window edge — "hovering anywhere over the normal window chrome bar
should be showing the gradient" (his ruling: the Board button
location is fine and no hairline border is fine, CONDITIONAL on
this trigger getting fixed). (2) The back/forward history buttons
render BLACK — invisible against the board except on hover. (3)
The home button is not vertically centered against the traffic
lights. Done means the reveal zone covers the full title-band
height (the region a window chrome bar would occupy — use/extend
TITLE_STRIP_REVEAL_PX in chrome/feel.ts, named constant), the nav
buttons are visible at rest in both themes (token color, not
black), and the home glyph sits centered on the traffic-light
axis.

### Out of Scope

- The strip's gradient/fade itself (shipped, 191, owner-approved).
- Board menu click-away (AI-IMP-215).

### Design/Approach

Find the reveal trigger (TitleStrip mount condition /
gestures/host hover seam reading TITLE_STRIP_REVEAL_PX). Widen to
the full band height and verify the canvas doesn't lose pointer
events beneath the (invisible) trigger zone — the zone arms
reveal, it must not swallow clicks. Nav buttons: locate PathBar's
back/forward styles — likely missing a `color` token so they
inherit black; give them the chrome-mono token at rest with the
existing hover treatment. Home centering: measure against
trafficLightPosition (x:14, y:13) and align the glyph line-box.
E2e: pointer at y = band-height − 4px reveals the strip; nav
buttons' computed color at rest ≠ rgb(0,0,0) in both themes.

### Files to Touch

`chrome/TitleStrip.svelte` / reveal seam, `chrome/feel.ts`
(constant), `chrome/PathBar.svelte` (button color + home
alignment), shell e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Reveal triggers across the full band height; canvas clicks
      beneath are unaffected.
- [ ] Back/forward visible at rest, both themes; home centered on
      the traffic-light axis.
- [ ] E2e for trigger height and rest-state visibility.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the pointer anywhere over the title-band region
**THEN** the smoky gradient reveals — and at rest the history
arrows and home glyph read clearly against any board.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
