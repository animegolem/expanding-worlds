---
node_id: AI-IMP-188
tags:
  - IMP-LIST
  - Implementation
  - gallery
  - feel
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-08
---


# AI-IMP-188-gallery-clickaway-deselect

## Summary of Issue #1

Owner testing note (2026-07-08, v0.15.0): in the gallery takeover,
clicking free space — off any cover — leaves the selection, the
floating action bar ("N · pull into this world · tag · place ·
trash"), and any open suggestion popover standing. Expected desk
physics: a click on empty ground puts things down. Done means a
click on gallery free space (not a tile, not the bar, not a
control) clears the selection, which dismisses the action bar, and
closes any open suggestion/quick-look popover — while clicks ON
tiles/controls behave exactly as today. ~20-40 LOC.

### Out of Scope

- Marquee/drag-select in the gallery (not specced).
- Escape behavior (already layered per AI-IMP-183).
- Quick-look internals (close is enough).

### Design/Approach

A pointerdown handler on the gallery's scroll container that clears
selection state when `event.target` is the container itself (or a
non-interactive descendant — test with the group headers). The
action bar visibility already derives from selection count, so
dismissal falls out. Close the suggestion popover through its
existing close path. Mind the §8.2 disengage grammar: this is a
deliberate click, not a fade.

### Files to Touch

`apps/desktop/src/renderer/views/GalleryView.svelte` (+
GalleryActionBar if visibility needs a nudge), e2e extension in the
gallery spec: select a tile → click free space → bar gone,
selection empty; click a tile → still selects.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Free-space click clears selection + bar + suggestion; tile
      and control clicks unchanged.
- [ ] Group headers / filter row clicks do NOT deselect (they are
      controls).
- [ ] E2e round-trip.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** tiles selected in the gallery with the action bar up
**WHEN** the user clicks empty gallery space
**THEN** the selection clears, the bar dismisses, and any
suggestion popover closes — and clicking a tile still selects it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
