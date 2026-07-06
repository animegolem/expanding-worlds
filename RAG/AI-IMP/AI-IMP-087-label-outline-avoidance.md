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

- [x] Label offset computed in screen space from outline stroke +
      halo + gap constants.
- [x] Unit: offset scales with 1/zoom; label rect never intersects
      outline rect at representative zooms.
- [x] e2e: selected labeled item at three zooms — label visible and
      clear of the outline.
- [x] Full gates.

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

- Spec correction: the summary calls the label "screen-scale text";
  RFC §4.5 (rev 0.8) says the opposite — labels are WORLD-scale and
  zoom with the canvas. The collision mechanism is the same shape
  (world-scaled label gap vs screen-scale outline reach) and the fix
  is as designed: the label's world offset below the body edge is now
  LABEL_CLEARANCE_PX / zoom, so the on-screen distance is constant.
- There is no outline "halo" constant: the selection outline in host
  drawSelection was two literals — 2 px pad + 1.5 px stroke (the
  single-item oriented poly has no pad). Both now live in
  canvas-engine (SELECTION_OUTLINE_PAD_PX / _STROKE_PX) next to the
  clearance math (LABEL_OUTLINE_GAP_PX = 3, LABEL_CLEARANCE_PX = 6.5)
  and host imports them, so outline and clearance cannot drift apart.
- Camera motion never re-runs renderer updates, so host re-applies
  the offset per cull pass (applyLabelClearance, alongside the
  AI-IMP-040 stroke clamp) using ephemeral gesture values when
  present; renderers read live zoom via a new optional
  RendererResources.getZoom (absent = 1 in tests/minimal hosts).
- Card verified: the card title lives INSIDE the chrome
  (buildCardBody) and syncLabel already skips appearanceKind 'card'
  (an under-label would print the title twice) — cards untouched.
- e2e cannot value-import @ew/canvas-engine (extensionless ESM dist
  fails node resolution), so the running app exposes the shipped
  constants via __ewDebug.outlineChrome plus labelBounds; the new
  label-clearance.spec.ts asserts label top clears the outline band
  by the breathing gap at zooms 0.5/1/2. Verified discriminating: the
  old formula fails it at zoom 0.5.
- RAG/INDEX.md not regenerated (out of this ticket agent's file
  fence); lead should run generate-index.sh on merge.
