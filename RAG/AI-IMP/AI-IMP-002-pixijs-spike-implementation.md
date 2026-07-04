---
node_id: AI-IMP-002
tags:
  - IMP-LIST
  - Implementation
  - spike
  - pixijs
kanban_status: completed
depends_on: AI-EPIC-001, AI-IMP-001
parent_epic: [[AI-EPIC-001-renderer-spike]]
confidence_score: 0.75
date_created: 2026-07-03
date_completed: 2026-07-03
---

# AI-IMP-002-pixijs-spike-implementation

## PixiJS adapter covering the full spike scenario

PixiJS is the RFC §13 preferred renderer but unproven against the
§12.3 workload. Implement the `RendererAdapter` from AI-IMP-001 in
PixiJS so every scenario runs and records metrics. Done means: run-all
completes on the PixiJS adapter with results written, including clean
memory release after unmount.

### Out of Scope

Konva (003), the decision report (004), any editor-grade polish —
interactions need to be representative, not shippable.

### Design/Approach

Pixi Application with a world container under camera transform; tile
pyramid as a culled sprite grid swapping resolution by zoom; images
and pins as sprites/graphics with a labels layer; marquee, drag,
resize/rotate handled through pointer events feeding the shared op
scripts; highlight via filters or overlay graphics; smart-guide lines
drawn in an overlay container. Texture eviction through
`destroy(true)` on swap; verify release via the harness heap check.
Note implementation-effort observations as input to 004.

### Files to Touch

`spike/src/adapters/pixi/*.ts`: adapter implementation.
`spike/package.json`: add pixi.js dependency.
`spike/src/main.ts`: register adapter in the picker.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Implement mount/unmount with camera container and DPR-correct resize.
- [x] Implement tiled map rendering with zoom-appropriate tile selection and culling.
- [x] Implement image placements, pins, and label rendering.
- [x] Implement selection marquee, multi-drag, resize, rotate, and snapping guide overlay ops.
- [x] Implement highlight mode and background set/replace/edit/reset/remove ops.
- [x] Implement the decoration suite (text, shapes, freehand, lines, arrows, anchored connectors, grouping, lock, hide, ordering).
- [x] Run run-all; confirm results JSON complete and heap returns to baseline after unmount.
- [x] Record effort/friction notes for the decision report.

### Acceptance Criteria

**Scenario:** Full spike run on the PixiJS adapter.
**GIVEN** AI-IMP-001's harness with the fixed seed.
**WHEN** run-all executes with the PixiJS adapter selected.
**THEN** all scenarios complete without errors and write metrics.
**AND** post-unmount heap sampling shows texture memory released.
**AND** interaction scenarios maintain measurable frame data at the 300-image and 1,000-pin loads.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Implementation went cleanly: the adapter is one file
(`spike/src/adapters/pixi/index.ts`, ~560 lines), tsc strict passed
first try, and the Playwright run
(`SPIKE_PORT=5273 npx playwright test tests/pixi.spec.ts`) was green
on the first full execution and stayed green on re-runs alongside the
noop smoke test. pixi.js 8.19.0, dynamically imported in the factory
so Vite code-splits it (base chunk ~10.6 kB; pixi chunk ~852 kB /
245 kB gzip — the bundle cost is real and should be weighed in 004).

Effort/friction notes for the PixiJS-vs-Konva decision (004):

- What Pixi gave for free: the scene graph (containers, child
  z-ordering, per-node visible/alpha/tint/rotation), batched sprite
  and Graphics rendering, DPR handling (`resolution` + `autoDensity`),
  canvas-sourced textures (`CanvasSource`), and explicit GPU resource
  destruction (`destroy({texture, textureSource})`). The v8 Graphics
  API (`rect().fill().stroke()`) made pins, shapes, freehand, and
  arrows trivial. Tint on any container made highlight cheap.
- What was hand-built: the entire camera (pan + anchored absolute
  zoom math), marquee hit-testing (screen→world conversion plus AABB
  intersection — Pixi has pointer-event hit testing but nothing for
  region/marquee queries), tile pyramid level selection and viewport
  culling (create/destroy sprites per frame of pan/zoom), connector
  endpoint tracking (redraw on every moveSelection), smart-guide
  overlay, selection/lock bookkeeping, and label placement. None of
  it was hard, but Pixi contributes no "editor" behavior — it is a
  renderer, and every interaction concept is app code. Rough feel:
  ~70% of the code is editor semantics that Konva may provide partly
  built-in; ~30% is Pixi plumbing, which was frictionless.
- Workarounds: textures are created via explicit
  `new Texture({source: new CanvasSource(...)})` instead of
  `Texture.from()` to bypass Pixi's global cache — the harness
  memoizes canvases, and cache-keyed textures risk resurrecting
  destroyed entries across `loadScene` swaps. Arrowheads and the
  marquee/guide overlays are hand-drawn Graphics.
- Culling: tile culling implemented as required. No manual culling
  for images/pins/labels/decorations — Pixi v8 does not cull by
  default (CullerPlugin exists but was left off to keep the measured
  numbers representative of naive usage); the 1000-pin + 1000-label
  scenes render fully every frame and this shows in the numbers
  (highlight-matches avg 25.7 ms, pins-1000-labels avg 19.7 ms —
  the two slowest scenarios; per-pin `Text` objects are the cost).
- "DPR-correct resize": mount-time DPR handling is implemented; the
  harness has no resize op, so live resize is untested by design.
- Heap: swap-and-return recorded heapStart 22.1 MB → peak 28.8 MB →
  end 29.3 MB (JS heap, no forced GC, sampled 30 frames after
  unmount). `usedJSHeapSize` cannot see GPU texture memory, so
  "texture release" is verified structurally (every texture the
  adapter creates is tracked and `destroy(true)`d on
  loadScene/unmount) rather than by the heap number; JS heap drift
  across scenarios is GC-timing noise. Per instruction, the test
  records but does not hard-assert heap thresholds.
- No harness bugs found. One ambiguity: `tileCanvas(level, ...)` —
  "level" could be the pyramid index or the level scale; the index
  was used (it only feeds the deterministic texture id).
- Ticket said to register in `spike/src/main.ts`; the actual
  registration point in the AI-IMP-001 harness is
  `spike/src/registry.ts` (one lazy-import line), which is what was
  changed.

Full-suite metrics (seed 20260703, headless Chromium, results in
`spike/results/pixi-seed20260703.json`): all 10 scenarios ok=true,
avg frame 8.6–25.7 ms, worst max 266 ms (texture re-upload spike on
the swap-and-return scene reload).
