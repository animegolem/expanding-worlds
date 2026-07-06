---
node_id: AI-IMP-072
tags:
  - IMP-LIST
  - Implementation
  - canvas-engine
  - tags
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-072-lens

## Summary of Issue #1

No dim-to-hits mechanism exists anywhere: §7.5's highlighted-
placement visualization never shipped (only the connector tool's
transient hover highlight), and §4.8's tag lens specifies the same
mechanism aimed at tag results — the RFC says the two surfaces
share one implementation. This ticket builds that implementation in
the canvas engine: a lens view state that dims every placement not
in the match set to a fraction of full strength (without hiding),
keeps matches at full color with an accent ring, survives pan, zoom,
and scene reapplication, and drops on Escape or explicit clear. The
host exposes `setLens(placementIds)` / `clearLens()`; the tag
panel's header toggle consumes it for the active tag's placements
on the current canvas. Covers EPIC-013 FR-5. Done when: engine
units cover the state machine and scene-apply survival, the tag
panel toggle dims a mixed board correctly, and Escape drops the
lens without disturbing selection.

### Out of Scope

The §7.5 note-uses trigger surface (a later ticket wires the uses
list/chooser to the same API — this ticket only leaves the seam).
Fit-camera-to-matches (SHOULD, deferred until a consumer wants it).
Tag panel internals (071) beyond wiring its toggle.

### Design/Approach

Lens is renderer view state, not selection and not scene data: a
`lensSet: ReadonlySet<string> | null` held by the controller
beside selection, applied at draw time — non-members render with a
dim factor (engine constant, e.g. 0.25 alpha multiply or a scrim
pass over non-matches; pick whichever the renderer does cheaply and
uniformly for images, pins, and decorations), members render normal
plus an accent ring in the adornment pass (same stroke family as
selection but visually distinct — reuse the §7.5 language: outline/
halo). Scene reapply intersects the set with surviving placement
ids rather than clearing (pan/zoom/edit survival); an empty
intersection clears the lens. Escape clears it at the same priority
as selection-clear (before tool fallthrough); clicking neutral
canvas space does NOT auto-drop in Phase 1 (§4.8: survives until
Escape or the toggle). Host surface: `setLens/clearLens/onLensChanged`
on CanvasHostHandle, mirrored on `window.__ewGestureDebug` for e2e
introspection. The tag panel toggle computes the active canvas's
matching placement ids from its extended getTagView rows.

### Files to Touch

`packages/canvas-engine/src/` (controller + renderers): lens state,
dim pass, accent ring; feel-style constant for the dim factor.
`packages/canvas-engine/src/*.test.ts`: state units — set,
intersect-on-apply, clear-on-empty, Escape.
`apps/desktop/src/renderer/canvas/host.ts`: expose setLens/
clearLens; debug hook.
`apps/desktop/src/renderer/tags/TagPanel.svelte`: header toggle
wires the lens for the active tag on the current canvas.
`apps/desktop/e2e/tags.spec.ts`: lens toggle coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Engine lens state: setLens/clearLens/onLensChanged; draw pass
      dims non-members uniformly (images, pins, decorations) and
      rings members; dim factor is a named constant.
- [ ] Scene reapply intersects the lens set with surviving ids;
      empty intersection clears; units cover placement deletion and
      unrelated edits under an active lens.
- [ ] Pan and zoom leave the lens untouched (unit or e2e).
- [ ] Escape clears the lens without clearing selection when both
      are active — lens first, selection on the next press.
- [ ] Host handle + __ewGestureDebug expose lens state for tests.
- [ ] TagPanel toggle: on = setLens(matching placements on current
      canvas), off = clearLens; toggle state tracks onLensChanged
      so Escape unsets the toggle.
- [ ] e2e: mixed board, toggle on → debug hook reports the right
      set; pan; Escape drops it and the toggle resets.
- [ ] `pnpm -r build`, engine units, full gates green.

### Acceptance Criteria

**Scenario:** Isolating a tag's material on a busy board.
**GIVEN** a canvas with three placements, two carrying tag "ruins",
and the tag panel open on "ruins".
**WHEN** the user switches the header lens toggle on.
**THEN** the untagged placement dims, both carriers keep full color
with an accent ring, and panning/zooming changes nothing about the
lens.
**WHEN** the user presses Escape.
**THEN** the lens drops, the toggle shows off, and any prior
selection is still intact.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
