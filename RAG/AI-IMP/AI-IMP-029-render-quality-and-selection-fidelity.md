---
node_id: AI-IMP-029
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - rendering
kanban_status: completed
depends_on: [AI-IMP-024, AI-IMP-025]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-029-render-quality-and-selection-fidelity

## Summary of Issue #1

The owner's hardware pass surfaced three defects. (1) The Pixi
application initializes without `resolution`/`autoDensity`, so on
Retina displays the whole board renders at CSS-pixel resolution and
is bitmap-upscaled 2× — permanently soft, and the dominant visual gap
vs Miro/PureRef; textures also never generate mipmaps, so downscaled
images shimmer while the camera moves. (2) Decoration bounds ignore
stroke extents: strokes center on the geometry edge, so selection
outlines/hit areas miss the visual edge by strokeWidth/2 (1.5× on
block arrows). (3) Selection chrome double-draws on click: handles
are hidden during 'gesture-pending' (mousedown), so the outline
appears at pointer-down and handles pop in at pointer-up. Done means:
device-pixel rendering + mipmapped textures, visually-exact
decoration bounds, handles visible from mousedown, all gates green
including the §12.1 perf suite at the higher resolution.

### Out of Scope

Monitor-change DPR re-init (note only); tile pyramid changes beyond
mipmap flags; MSAA tuning; label text re-rasterization by zoom;
custom SVG shape import (owner idea, polish era).

### Design/Approach

host.ts init gains `resolution: window.devicePixelRatio || 1,
autoDensity: true` (screen coordinates stay CSS px — camera math,
culling, and e2e coordinates are unaffected); `loadTexture` and tile
textures set `autoGenerateMipmaps` on their sources. hit-test.ts
`decorationAABB` inflates by stroke extents: round-capped
segments/paths and centered shape strokes inflate exactly by
strokeWidth/2 (miter at 90° lands exactly on the inflated corner);
arrows compute exact bounds from the `arrowPolygon` silhouette.
gestures-ui `render()` treats 'gesture-pending' as idle-like so
handles draw at mousedown; a real gesture still hides them.

### Files to Touch

`apps/desktop/src/renderer/canvas/host.ts`: init options; mipmaps.
`packages/canvas-engine/src/hit-test.ts`: stroke-aware decoration
AABBs; arrow silhouette bounds.
`packages/canvas-engine/src/hit-test.test.ts`: new bounds tests.
`apps/desktop/src/renderer/canvas/gestures-ui.ts`: pending-state
handle rendering.
Existing tests that assumed geometry-only bounds: fix honestly.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] app.init with resolution/autoDensity; verify e2e coordinates
      and culling stats unchanged; note monitor-change limitation.
- [x] autoGenerateMipmaps on placement and tile textures.
- [x] decorationAABB: strokeWidth/2 inflation for shape/path/line/
      connector; arrowPolygon-derived bounds for arrows; text
      unchanged.
- [x] Unit tests: padded bounds per kind, arrow tip/barb bounds,
      zero-stroke text unaffected.
- [x] gestures-ui: handles render during gesture-pending; hidden
      during gesture/marquee/panning (existing behavior).
- [x] Full gates: `pnpm -r build`, unit suites, 18 desktop e2e, perf
      suite on hardware GL (p95 at device resolution), lint.

### Acceptance Criteria

**Scenario:** Artist inspects selection fit and sharpness.
**GIVEN** a thick-stroked rect, an arrow, and an image on a Retina
display
**WHEN** each is selected
**THEN** the selection outline hugs the visible outer edge (stroke
included, arrow barbs included).
**WHEN** the artist clicks a shape
**THEN** outline and handles appear together at mousedown with no
second draw at mouseup.
**WHEN** the camera pans over downscaled images
**THEN** content renders at device resolution without shimmer.

### Issues Encountered

<!-- Filled out post-work. -->
No surprises. The arrow AABB now derives from the exact arrowPolygon
silhouette rather than an inflated segment box, so outline, hit area,
marquee, snapping, and alignment all read the same visual bounds —
alignment by visible edges (stroke included) is a deliberate
behavioral change, consistent with what artists see. Existing tests
were unaffected because their fixtures carry no strokeWidth. Perf
suite passed on hardware GL at device resolution (4x fill) with
mipmapped textures. DPR is read once at mount; moving the window to a
monitor with a different DPR keeps the old resolution — recorded as a
known limitation, revisit if it ever bites.
