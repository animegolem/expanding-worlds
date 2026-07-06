---
node_id: AI-IMP-087
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - chrome
kanban_status: backlog
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-087-label-outline-avoidance

## Summary of Issue #1

Owner finding (2026-07-06, screenshot): at some zooms the selection
outline runs THROUGH the placement label ("The Gang" clipped by the
outline's bottom edge). Root shape: the label is screen-scale text
anchored in world space beneath the item, while the outline is a
screen-scale stroke (plus halo) around the item's world rect — two
screen-constant thicknesses anchored to world geometry collide as
zoom compresses the world gap between them. The guard: titles and
subheadings (placement labels today; the card appearance's title
line and any future subheadings share the concern) and the
selection outline MUST avoid each other at every zoom. Done = the
label's offset is computed in SCREEN space (outline stroke + halo +
breathing gap), validated at multiple zooms by unit + e2e.

### Out of Scope

- Label styling, sizing, or visibility rules (§4.5 unchanged).
- Collision with OTHER chrome (charm bar, tooltips) — outline only,
  unless trivially shared.
- Card chrome INTERNAL layout (AI-IMP-084 owns it; the card title
  lives inside the body and already clears the outline).

### Design/Approach

Wherever the label's world offset from the item's bottom edge is
computed, replace the constant world gap with
(outlineStrokePx + haloPx + gapPx) / zoom so the screen-space
clearance is constant. If labels are drawn by the renderer, the
per-frame zoom is at hand; if drawn as DOM, the camera transform
already flows to that layer. Selection state need not change the
label position (the clearance is reserved whether or not selected —
position jumps on select would look worse than the reserved gap).

### Files to Touch

To be confirmed at activation: the placement label render path in
packages/canvas-engine (likely renderers/placement.ts or the label
plane) + tests; one e2e asserting no overlap of label bbox and
outline bbox at zoom 0.5 / 1 / 2 on a selected item.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Label offset computed in screen space from outline stroke +
      halo + gap constants.
- [ ] Unit: offset scales with 1/zoom; label rect never intersects
      outline rect at representative zooms.
- [ ] e2e: selected labeled item at three zooms — label visible and
      clear of the outline.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a selected placement with a visible label
**WHEN** the artist zooms from far out to close in
**THEN** the label text never intersects the selection outline at
any zoom level.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
