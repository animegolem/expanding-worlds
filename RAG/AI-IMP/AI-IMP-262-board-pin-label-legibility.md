---
node_id: AI-IMP-262
tags:
  - IMP-LIST
  - Implementation
  - canvas-engine
  - rendering
  - field-report
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.5
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-262-board-pin-label-legibility

## Summary of Issue #1

alph, v0.20.0, 2026-07-10 ("major bug" per owner): board pins on
Home render as large ring outlines whose NAME LABELS are "all
blurry and tiny" — illegible enough that he initially read his own
boards as "weird artifacts" and deleted one. He explicitly wants
Home-as-worlds-view to work ("I'd like this as a way to view the
different starting worlds"), so label legibility on board pins is
the load-bearing part. Screenshots show: large ring (the board
pin), two small charms inside it, and a label beneath at a tiny
size with soft/blurred glyphs. LEAD HYPOTHESES (unverified —
pre-implementation review supersedes): (a) the label texture is
rasterized for one zoom and scaled up at another (the AI-IMP-216
label family — check the label-resolution policy against the
pin-ring's own scale); (b) the New-board verb's default placement
size and the label's world-size don't agree — the ring is sized
generously while the label stays at note-card label size; (c) a
DPR/resolution miss on Windows display scaling (alph's box) that
mac testing wouldn't show. The review must reproduce at alph's
approximate zoom and record which. Done means: a board pin's name
is crisp and readable at the zooms Home is actually used at, on
both platforms.

### Out of Scope

- Whether Home should be a launcher/grid (DESIGN-QUEUE cluster —
  and note alph now endorses spatial Home).
- Ring VISUAL design (charms, proportions) — legibility only,
  unless the review proves the ring scale is itself the label bug.
- Untitled-board display names (parked naming debate).

### Design/Approach

Pre-implementation review first: reproduce with a board pin on
Home at several zooms; inspect the label render path in
canvas-engine (texture resolution vs camera zoom vs DPR); check
whether pin-ring labels share the placement-label pipeline of
AI-IMP-216 ("labels fade with their art") or a separate one; test
on a >1 DPR display profile. Fix at the cause the review convicts
— likely re-rasterizing label textures at an effective-resolution
bucket (zoom × DPR) the way crisp text on canvas is normally kept,
or aligning the board-pin label size with the ring's world scale.
Regression: a perf-conscious unit/e2e that asserts the label
texture resolution tracks the effective scale bucket.

### Files to Touch

(Census in review; expected:)
- `packages/canvas-engine/src/` label/adornment renderers.
- Possibly the New-board default placement sizing.
- `RAG/HUMAN-TESTING.md`: alph re-check at his real zoom + display.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Pre-implementation review: reproduction + convicted cause
      (texture resolution / size mismatch / DPR) recorded here.
      LEAD'S SOURCE PASS (2026-07-10, narrows but does not
      convict): DPR is handled — the Pixi renderer takes
      `devicePixelRatio` (host.ts:378), so pure display-scaling
      blur is unlikely. Live suspects: (a) labels rasterize ONCE
      at world-proportional fontSize (`labelBasis(item).height ×
      LABEL_HEIGHT_RATIO`, placement.ts:771-781) and scale under
      camera zoom with no re-raster bucket — upscale blur when
      zoomed in past raster size; (b) `labelBasis` fallback chain
      (`height ?? width ?? assetHeight ?? DEFAULT_DOT_RADIUS*2`,
      placement.ts:661-665) vs whatever placement size the
      New-board verb mints — if the ring draws large while the
      basis lands on a small fallback, the label is tiny relative
      to its ring. Runtime reproduction decides; both may hold.
      REVIEW VERDICT (2026-07-10, runtime repro in vitest against
      a placement shaped exactly as the New-board verb mints it —
      `CreatePlacement` with no width/height/appearance,
      NewBoardPalette.svelte:102-108): **suspect (a) convicted;
      suspect (b) does NOT hold.** Measurements: the pin renders
      the `bare-node` ring at radius `DEFAULT_DOT_RADIUS`=12
      (placement.ts:389-396), drawn extent 26×26 world (24 + 2px
      stroke); `labelBasis` falls to the same
      `DEFAULT_DOT_RADIUS*2`=24 (placement.ts:663) → fontSize
      24×0.14 = **3.36 world units** — ring and basis AGREE, the
      0.14 body:label ratio is the designed one, so there is no
      basis/ring mismatch to fix. The blur: a Pixi `Text` rasters
      at `fontSize × resolution` device px where auto-resolution
      is the RENDERER's resolution (DPR) — pixi re-rasters only
      when `text:styleKey:resolution` changes
      (pixi.js 8.19 CanvasTextPipe.js:35, AbstractText.js:348);
      camera zoom appears in neither term, and camera glides run
      no renderer update at all (host.ts:1522-1546 re-derives
      only offset/LOD/stroke). So the board-pin label is one
      ~6.7-device-px raster (3.36 × DPR 2) upscaled ×3 at zoom 3
      and ×8-20 at the fit-view zooms Home reaches on a board of
      24-world-unit pins — "blurry and tiny" exactly. DPR itself
      confirmed handled (auto-resolution = renderer DPR), so (c)
      stays dismissed; Windows display scaling only changes the
      constant, not the unbounded zoom-upscale. Fix shape: the
      ticket's re-raster bucket — quantized effective-scale
      (zoom × |placement scale| × DPR) as `Text.resolution`,
      re-derived in the existing cull-pass hook
      (`syncPlacementLabelOffset`), assignment guarded so a
      re-raster happens only on bucket change.
- [x] Fix at the convicted cause; labels crisp at Home-use zooms.
      `labelTextResolution` (placement.ts): the label's
      `Text.resolution` is re-derived on the existing cull-pass
      hook (`syncPlacementLabelOffset`, host.ts:1526-1546 already
      re-runs it on every camera motion) as the effective scale
      (zoom × |placement scale| × DPR) quantized UP to the next
      power of 1.5 — glyphs are only ever downscaled (< one
      bucket), floored at the DPR (zoom-out never rasters below
      today's static default), capped at a 192-device-px glyph em
      (large labels keep today's raster exactly; no memory
      blowup at MAX_ZOOM 64). Assignment is guarded (the setter
      re-rasters unconditionally) and skipped while the AI-IMP-216
      ceiling has the label hidden.
- [x] Resolution-tracking regression test.
      placement.test.ts "label raster resolution (AI-IMP-262)":
      raster ≥ on-screen scale at zooms 1.2/3/8/20 × DPR 1/2,
      DPR floor, bucket-exact epsilon, large-label cap, the
      cull-pass hook tracking buckets on a New-board-shaped pin
      (re-raster only on bucket change), hidden-label skip.
- [x] Full desktop units + relevant e2e shard green.
      `pnpm -r build` clean; packages: canvas-engine 397 passed
      (29 files), persistence 602 passed (55 files), protocol 1,
      shared-ui 1 — no failures; apps/desktop vitest 404 passed,
      1 skipped (48 files); e2e shard `e2e/[s-z]*` 52 passed.
- [x] HUMAN-TESTING entry for alph (Windows display scaling).

### Acceptance Criteria

**GIVEN** boards placed on Home as ring pins
**WHEN** the user views Home at ordinary zooms (fit-view through
mid-zoom)
**THEN** each board's name renders crisp (no upscaled blur) and at
a readable size relative to its ring
**AND** the behavior holds on a Windows display-scaled monitor.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- Reproduction was headless-analytic, not pixel-rendered: node
  vitest cannot run the GPU text pipe, so "raster size" was derived
  from pixi 8.19's own dispatch (CanvasTextPipe.js:35 uses
  renderer resolution for auto-resolution; the re-raster key
  AbstractText.js:348 is `text:styleKey:resolution` — zoom absent
  from both). The derivation is deterministic, but the crispness
  itself still needs the human pass queued in HUMAN-TESTING.
- Suspect (b) was affirmatively cleared, not just unproven: the
  bare-node ring and `labelBasis` read the SAME
  `DEFAULT_DOT_RADIUS*2` fallback, so ring and label agree at the
  designed 0.14 ratio. The "tiny" in the field report is the blur
  plus the pin's small 24-world-unit default — the label:ring
  proportion matches every other placement. If alph still reads
  the CRISP label as too small relative to the ring, that is a
  ring-design question (explicitly out of scope here).
- `globalThis.devicePixelRatio` needed a cast — canvas-engine's
  tsconfig has no DOM lib, so the DPR default is typed via
  `(globalThis as { devicePixelRatio?: number })`. In the node
  test env it is undefined → 1, which keeps the unit tests
  deterministic.
- Not done: a bucket-boundary hysteresis. A camera resting
  EXACTLY on a bucket edge could in theory re-raster on alternate
  frames, but zoom deltas are multiplicative (wheel/pinch) and the
  guard compares exact values, so oscillation requires a zoom
  oscillation — accepted as a non-risk; noted in case a glide
  profiler ever shows re-raster churn.
