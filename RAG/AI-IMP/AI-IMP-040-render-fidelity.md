---
node_id: AI-IMP-040
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - rendering
  - feel
kanban_status: completed
depends_on: [AI-IMP-039]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-040-render-fidelity

## Summary of Issue #1

Two owner-approved render-truth fixes. (1) Sub-pixel strokes
fragment: a stroke whose width × zoom < 1 device pixel rasterizes as
broken dashes (owner screenshot — "dotted line" diagnosis correct).
Fix: a render-only minimum — strokes never draw thinner than 1
screen pixel; data untouched ("the least hacky sub-pixel hinting").
(2) Draw previews lie: shape previews stroke without fill (the fill
pops in at commit), and the pen-arrow preview is a bare segment
without its head. Previews should render the expected final result.

### Out of Scope

Sub-pixel text (fontSize, not stroke); pre-creation text styling
(parked: chrome-era floating box per the Baseline UI Vision);
preview parity beyond fill/silhouette (colors/alpha convention
stays).

### Design/Approach

Minimum width: pure `renderStrokeWidth(world, zoom)` (new
stroke-render.ts, MIN_STROKE_SCREEN_PX = 1) returns max(world,
1/zoom). The host's existing per-camera cull pass applies it to
decorations whose data carries strokeWidth: each display object
tracks its applied render width, re-running the renderer's update
with substituted width only when the target drifts >20% from what's
applied (bounded redraws during continuous zoom; items mid-gesture
in the ephemeral map are skipped; scene-sync redraws at true width
self-correct on the next pass). A `__ewDebug.renderedStroke(id)`
probe makes it e2e-assertable. Preview parity: the ToolOverlay shape
branch fills (PREVIEW_ALPHA) before stroking, and the pen-arrow
preview draws through the line renderer's real drawSegment.

### Files to Touch

`packages/canvas-engine/src/stroke-render.ts` (new) + test.
`packages/canvas-engine/src/tools/draw-tools.ts`: overlay fill +
arrow silhouette preview.
`packages/canvas-engine/src/index.ts`: exports.
`apps/desktop/src/renderer/canvas/host.ts`: clamp pass + probe.
`apps/desktop/e2e/`: zoom-out clamp e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] stroke-render.ts helper + unit tests (below threshold clamps
      to 1/zoom, above passes through).
- [x] Host clamp pass in the cull rAF: drift-gated redraws, ephemeral
      items skipped, probe exposed.
- [x] Overlay previews: shapes fill; pen arrows show the real
      silhouette; unit-testable via preview data already (visual
      change only — covered by existing draw e2e staying green).
- [x] e2e: line at strokeWidth 2, camera zoom 0.05 → renderedStroke
      ≈ 20 world (1 screen px); zoom 1 → back to 2.
- [x] Full gates incl. §12.1 perf (300-decoration zoom workload
      exercises the drift gate).

### Acceptance Criteria

**Scenario:** Artist reviews annotations from fit zoom.
**GIVEN** thin strokes drawn while zoomed in
**WHEN** the camera zooms far out
**THEN** strokes render as continuous 1-pixel lines, never broken
fragments, and return to true width on zoom-in.
**GIVEN** the rect tool with a fill set
**WHEN** dragging out a shape
**THEN** the preview shows the filled result, not a wireframe.

### Issues Encountered

<!-- Filled out post-work. -->
Clean. The clamp interplays correctly with the arrow length-clamp
(a huge 1px-equivalent world width on a short arrow still bounds to
length/3) and skips ephemeral-gesture items so drags stay
gesture-owned. Scene-sync redraws at true width self-correct on the
next cull pass by design. Perf suite green with the 300-decoration
zoom workload exercising the 20% drift gate. Parked with the owner:
pre-creation text styling (floating box near placement, chrome era
per the Baseline UI Vision).
