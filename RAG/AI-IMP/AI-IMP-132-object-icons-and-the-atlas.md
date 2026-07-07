---
node_id: AI-IMP-132
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - icons
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-132-object-icons-and-the-atlas

## Summary of Issue #1

The six icon appearances (star · pin · flag · heart · bolt · leaf)
have never been designed pixels: the renderer draws ONE generic
diamond for all of them, and the appearance switcher shows unicode
glyphs. Rev 0.55's doctrine makes node icons the flagship world
OBJECTS: top-light gradients, restrained gloss, soft stroke (SVG
masters ship in Design System 1.0 `assets/icons/`). Done means:
each icon kind renders its own object glyph on the board via a
texture atlas, degrades to the plain dot below the shared furniture
threshold, tints from the same color token as its dot, and the
switcher popover previews the real objects.

### Out of Scope

- Painterly/commissioned art (recorded upgrade path).
- Pixel-glyph theme variant (parked).
- The shrink-ladder CONSTANTS unification (AI-IMP-133; consume
  `EW_FURNITURE_MIN_PX` if 133 landed, else a local ~8px constant
  flagged for 133 to absorb).

### Design/Approach

Bake the six SVG masters to a texture atlas at 2–3 raster sizes
(build-time script into resources, or first-run bake — prefer
build-time for determinism; record the choice). Normalize gloss to
`--ew-obj-gloss` at bake. Renderer: the placement `icon` branch
samples the atlas sprite for the node's icon id, tinted per the
§4.6 color association (one token tints dot and icon alike — the
gradient pairs are per-icon-color, resolved at bake or via
multi-channel tint; keep it simple: bake per-color variants if
tinting gradients proves fiddly, atlas stays small). Below ~8px
rendered size swap to the existing dot draw. The switcher popover
(charms-ui) shows the atlas sprites at chrome size in place of
unicode. Mind §12.1: atlas upload once, sprites share the texture;
the perf suite must stay green.

### Files to Touch

`scripts/` or `apps/desktop/resources/icons/` bake step + masters
copied from the kit.
`packages/canvas-engine/src/renderers/placement.ts` (+ test):
icon branch → atlas sprite + dot fallback.
`packages/canvas-engine/src/resources.ts` (or texture home):
atlas load/registration.
`apps/desktop/src/renderer/canvas/charms-ui.ts`: switcher
previews.
`apps/desktop/e2e/`: switcher shows six distinct icons; an icon
node at deep zoom renders the dot (via __ewDebug or cull stats
seam); perf suite untouched and green.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Atlas bakes from the kit masters (gloss normalized to the
      token); loads once; six kinds render distinctly.
- [ ] Dot degradation below the furniture threshold; unit or e2e
      proof at two zooms.
- [ ] One color token tints dot and icon alike (switch a node's
      color: both presentations follow).
- [ ] Switcher popover previews the objects at chrome size.
- [ ] Perf: §12.1 suite green locally (GPU gate).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (do the
      objects read as designed art over real boards; gloss level).

### Acceptance Criteria

**GIVEN** six nodes wearing the six icon appearances
**THEN** each renders its own object glyph, tinted by its color
association
**AND** zooming out past the threshold swaps each to its dot.
**GIVEN** the appearance switcher
**THEN** the icon row previews the real objects.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
