---
node_id: AI-IMP-026
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - snapping
  - feel
kanban_status: in-progress
depends_on: [AI-IMP-022]
parent_epic: [[AI-EPIC-009-canvas-feel-pass]]
confidence_score: 0.85
date_created: 2026-07-04
date_completed:
---

# AI-IMP-026-quiet-snapping

## Summary of Issue #1

Snapping works but is loud: guides render as solid opaque lines that
flash in and out as candidates come and go, and the hard 6px/zoom
threshold has no hysteresis, so a dragged item near an alignment
oscillates between snapped and unsnapped positions frame to frame —
perceived as stutter/tearing during drags. RFC §6.9 (rev 0.9) now
requires guides to be visually quiet (thin, dotted, reduced opacity),
shown only while a snap is actively engaged, and engagement to use
hysteresis (release at a larger distance than engage). Done means the
SnapProvider implements engage/release hysteresis with per-axis
engaged-state, only engaged guides are reported, and the guide
rendering helper draws them dotted at reduced opacity — all inside
`@ew/canvas-engine` with unit tests.

### Out of Scope

Host wiring beyond the exported helper (the lead integrates
`drawSnapGuides` into host.ts `renderGuides` at merge); threshold
constants exposed as settings; grid snapping (deferred, §6.9);
align/distribute; gesture drivers; any file outside
`packages/canvas-engine/`.

### Design/Approach

Extend the AI-IMP-022 SnapProvider (`snap-provider.ts`): track
engaged snap per axis; a candidate engages when distance <
SNAP_ENGAGE_PX (6/zoom, unchanged) and stays engaged until distance >
SNAP_RELEASE_PX (9/zoom), preferring the currently engaged candidate
over a marginally closer new one while engaged (stability beats
optimality mid-drag). `snap()` returns guides only for engaged axes —
no "approaching" previews. Keep the SnapProvider interface unchanged
so the controller and gesture drivers are untouched; hysteresis state
resets in `begin()`/`end()`. Add `drawSnapGuides(gfx, guides, view)`
in a new `snap-guides.ts`: manual dash segmentation (PixiJS has no
native dashed stroke), 1px screen-width lines (world width = 1/zoom),
~40% opacity, distinct-but-quiet color; export from index.ts. Unit
tests drive a scripted drag across a snap line and assert
engage/hold/release distances, no oscillation across the engage
boundary, and dash geometry counts.

### Files to Touch

`packages/canvas-engine/src/snap-provider.ts`: hysteresis +
engaged-state; report only engaged guides.
`packages/canvas-engine/src/snap-guides.ts`: new — dashed guide
drawing helper (Graphics, view-aware widths).
`packages/canvas-engine/src/snap-provider.test.ts`: hysteresis
scenarios.
`packages/canvas-engine/src/snap-guides.test.ts`: new — dash/opacity
geometry tests.
`packages/canvas-engine/src/index.ts`: export drawSnapGuides.
Forbidden: everything else — especially `apps/desktop/**`,
`controller.ts`, `gesture.ts`, `gestures/*`, `arrange.ts`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Add per-axis engaged-state with SNAP_ENGAGE_PX (6/zoom) and
      SNAP_RELEASE_PX (9/zoom) to snap-provider.ts; engaged candidate
      is sticky until release distance is exceeded.
- [x] Reset hysteresis state in begin()/end(); interface of
      SnapProvider unchanged (verify controller.ts compiles without
      edits).
- [x] Return guides only for engaged axes.
- [x] Unit tests: scripted drag toward/past/away from a snap line
      asserting engage at ≤6/zoom, hold through 6–9/zoom, release
      >9/zoom; a jitter sequence across 6/zoom produces no
      engaged-state flapping; zoom scaling respected.
- [x] New snap-guides.ts: drawSnapGuides(gfx, guides, view) with
      manual dashing, 1px screen-equivalent width, reduced opacity;
      export from index.ts.
- [x] Unit tests for drawSnapGuides: dash segment count/geometry for
      a known guide and view; opacity and width constants asserted.
- [x] Validation: `pnpm --filter @ew/canvas-engine test`,
      `pnpm -r build`, `pnpm lint` all green; no files outside
      packages/canvas-engine touched (`git status` proof in report).

### Acceptance Criteria

**Scenario:** Artist drags a placement near another's edge.
**GIVEN** two placements and an active move gesture
**WHEN** the dragged edge comes within 6px/zoom of the other's edge
**THEN** the position snaps and one dotted, reduced-opacity guide is
reported/drawn.
**WHEN** the pointer wobbles ±2px around the engage distance
**THEN** the snap stays engaged and the guide does not flicker.
**WHEN** the dragged edge moves beyond 9px/zoom
**THEN** the snap releases and the guide disappears.

### Issues Encountered

- `SNAP_THRESHOLD_PX` was removed in favor of `SNAP_ENGAGE_PX` /
  `SNAP_RELEASE_PX` (and `createSnapProvider(engagePx, releasePx)`
  replaces the single `thresholdPx` default parameter). Grep confirmed
  the constant was exported but imported nowhere outside the package;
  `pnpm -r build` (including apps/desktop) passes with the removal.
- Hysteresis correctness leans on an existing property of the move
  driver: `movingBounds` is recomputed each update from the RAW
  (unsnapped) pointer delta, so the snapped output never feeds back
  into the engage/release distance. Documented in the provider header;
  if a future driver ever passes snapped bounds, hysteresis would
  latch permanently.
- The pre-existing zoom-scaling test reused one provider across
  queries; with stateful hysteresis the second query would (correctly)
  hold the zoom-1 engagement. Restructured to a fresh provider per
  zoom level — an intended behavioral consequence, not a regression.
- Decision the ticket left open: a `disabled: true` query (snap
  modifier held) also clears engaged state, so re-enabling re-engages
  only inside the 6px radius rather than silently resuming a broken
  hold.
- Decision left open: guide styling constants chosen as
  SNAP_GUIDE_COLOR 0xc06a8e (muted rose — quieter than the host's
  current 0xf04a7d, distinct from selection blue 0x4a9df0), alpha 0.4,
  dash 4px / gap 4px screen-equivalent. `drawSnapGuides` assumes the
  Graphics lives under the camera-scaled world container (like
  ToolOverlay) — host.ts currently draws guides in SCREEN space via
  worldToScreen, so the lead's wiring must either reparent guidesGfx
  into the world plane or keep the old path. `snapGuideSegments` is
  exported as the pure geometry seam for tests and reuse.
- `RAG/INDEX.md` was NOT regenerated despite the ticket change: the
  index is shared mutable state across the parallel 026/027 agent
  branches and regenerating it here would guarantee merge conflicts;
  the lead should run `./RAG/scripts/generate-index.sh` at merge.
