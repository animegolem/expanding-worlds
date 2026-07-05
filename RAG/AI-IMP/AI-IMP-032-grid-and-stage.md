---
node_id: AI-IMP-032
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - background
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-022, AI-IMP-029]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed:
---

# AI-IMP-032-grid-and-stage

## Summary of Issue #1

Two owner-approved decisions (RFC rev 0.11). (1) Backgroundless
canvases get PureRef's recursive grid: an adaptive multi-scale grid
where zooming reveals ever finer subdivisions — display only,
snapping stays content-edge. (2) A background image becomes a
**stage**: today it's just pixels floating in infinity,
indistinguishable from a big locked image. The extent it defines
should hide the grid, render a distinct void beyond itself, become
the zoom-to-fit/home target, normalize on set (canonical 2048-unit
stage width from file; preserve the placed rect from selection;
replace fits the prior extent — closing RFC Q7), and the camera
should EASE to frame a newly set background. Done means all of the
above ship presentation-only (no domain schema/invariant changes),
gated and e2e-covered.

### Out of Scope

Grid snapping (deferred, §6.9); camera clamping or placement
restrictions in the void (never — presentation only); grid style
settings; per-canvas grid toggle UI (constant defaults first);
navigation/home framing (EPIC-006 consumes the extent later).

### Design/Approach

Scene: `getCanvasScene` background gains assetWidth/assetHeight (join
the background asset) so the extent {x, y, w·scale, h·scale} is
synchronously computable everywhere. Camera: extract pure
`fitTarget(bounds, viewport, padding)` from fitBounds; new
`CameraFlight` (engine) tweens x/y linearly and zoom in log space
with ease-out over ~250ms via a `step(deltaMS)` the host drives from
the ticker; any pointerdown/wheel cancels. Host: a `stage` container
at world index 0 (under the background plane); per camera change it
draws either the adaptive grid (pure `gridLines(camera, viewport)`
seam + draw wrapper, two levels sized to keep screen spacing legible,
finer level alpha-faded) or the stage treatment (renderer background
switches to a void color; a stage-colored rect renders under the
image extent). `handle.flyTo(bounds)` exposes the flight;
board-tooling routes zoomToFit/zoomToSelection through it, zoomToFit
targeting the extent when a background exists. Background ops:
from-file decodes dims client-side and commits normalized settings
(scale = 2048/width, extent centered on the current view center),
then flies to the extent; from-selection preserves the placement's
world rect (fixing today's identity-settings behavior); replace fits
the new image into the prior extent; reset returns to the normalized
default at the origin. `__ewDebug` gains grid/stage probes.

### Files to Touch

`packages/persistence/src/queries-structure.ts` (+ scene-query test):
background asset dims.
`packages/canvas-engine/src/types.ts`: SceneBackground dims.
`packages/canvas-engine/src/camera.ts`: pure fitTarget.
`packages/canvas-engine/src/camera-flight.ts` (new) + test.
`packages/canvas-engine/src/background-grid.ts` (new) + test: grid
levels/lines, stage extent helper, STAGE_WIDTH constant.
`packages/canvas-engine/src/index.ts`: exports.
`apps/desktop/src/renderer/canvas/host.ts`: stage container, grid/
void drawing, flight stepping + cancel, handle.flyTo, debug probes.
`apps/desktop/src/renderer/canvas/board-tooling.ts`: normalized set/
replace/reset, preserved from-selection, eased fits, extent target.
`apps/desktop/e2e/board-tooling.spec.ts`: stage e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] getCanvasScene background carries assetWidth/assetHeight;
      SceneBackground type updated; scene-query test asserts dims.
- [ ] camera.fitTarget extracted (fitBounds delegates); CameraFlight
      with log-zoom ease-out, step/cancel; unit tests (midpoint is
      between endpoints, terminal state exact, cancel stops).
- [ ] background-grid.ts: STAGE_WIDTH = 2048; gridLines(camera,
      viewport) returns two fading levels with screen-legible
      spacing; extentOf(background) helper; unit tests for level
      selection across zooms and extent math.
- [ ] host: stage container under the background plane; grid drawn
      on camera change for backgroundless canvases; void renderer
      color + stage rect when a background exists; flight stepped on
      the ticker and cancelled by pointer/wheel input;
      handle.flyTo(bounds); __ewDebug.stage() probe (grid visible,
      extent, void active).
- [ ] board-tooling: from-file normalizes (2048/width, centered on
      view) and flies to the extent; from-selection preserves the
      placed world rect; replace fits the prior extent; reset
      returns to the normalized default; zoomToFit targets the
      extent when present; both zoom buttons ease.
- [ ] e2e: set an 8px background from file → settings.scale 256 and
      camera settles on the extent; edit scale then replace with a
      16px image → scale preserves the edited extent (not
      renormalized); set-from-selection preserves the placement
      rect; grid probe flips hidden/visible with background
      presence.
- [ ] Full gates: `pnpm -r build`, unit suites, desktop e2e, §12.1
      perf, lint.

### Acceptance Criteria

**Scenario:** Artist turns a small dungeon map into a board.
**GIVEN** an empty canvas showing the adaptive grid
**WHEN** the artist zooms in or out
**THEN** finer or coarser grid subdivisions fade in, indefinitely.
**WHEN** the artist sets an 800px map image as the background from a
file
**THEN** the stage spans 2048 world units, the camera eases to frame
it, the grid disappears, and beyond the map a distinct void renders.
**WHEN** the artist replaces the map with a higher-resolution export
**THEN** the stage extent (and every pin position on it) is
unchanged.
**WHEN** the artist promotes an already-placed, already-sized image
to background
**THEN** it keeps its world rect exactly.

### Issues Encountered

<!-- Filled out post-work. -->
