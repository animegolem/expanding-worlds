---
node_id: AI-IMP-140
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - renderer
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-140-image-body-treatment

## Summary of Issue #1

The kit's NodeCard gives placed images a 3px corner radius
(`--ew-node-radius`) and a soft drop shadow (`--ew-node-shadow`);
the shipped renderer draws raw flat sprites. This is WebGL work:
rounding needs a mask/shader path and the shadow a cheap pass that
holds §12.1 at 150+ visible images. Done means placed images
render with the designed radius + shadow on the board, exports/
crops stay untouched pixels (treatment is board presentation,
never baked), and the perf suite stays green.

### Out of Scope

- Selection visuals (shipped outline stands; color-token swap is
  AI-IMP-141).
- Card-appearance bodies (their look is 135/139 territory).
- Any doctrine question — ratified; this is execution.

### Design/Approach

Radius: rounded-rect mask (Pixi Graphics mask or a rounded-quad
shader) sized per placement; verify batch-friendliness — a mask
per sprite can kill batching, so prefer a shared shader/mesh
approach; MEASURE before choosing (the CLAUDE.md benchmark
discipline; the perf suite is the gate). Shadow: NOT a blur filter
per image (fill-rate death) — a shared 9-slice shadow texture
under each sprite (one texture, batched) sized to the placement,
alpha from the token. Both derive from 130's tokens via the
existing resources bridge. Treatment applies to the image body
only (crop previews/exports read original pixels — assert).

### Files to Touch

`packages/canvas-engine/src/renderers/placement.ts` (+ shared
shadow/mask resource, + tests where logic).
`packages/canvas-engine/src/resources.ts`: tokens.
`apps/desktop/e2e/perf.spec.ts` must stay green UNMODIFIED (the
hard gate); a small visual e2e asserts the treatment exists (e.g.
corner pixel sample via debug seam) if practical, else unit-level.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Radius + shadow on image bodies from tokens; approach chosen
      by measurement (numbers in Issues).
- [x] Batching preserved: perf suite green locally, p95 within
      §12.1 (before/after numbers recorded).
- [x] Exports/crop previews pixel-untouched (test).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      treatment read as intended over dense boards).

### Acceptance Criteria

**GIVEN** a board of 150 visible images
**THEN** each renders with the 3px radius and soft shadow, and the
§12.1 perf targets hold.
**GIVEN** an export or crop preview
**THEN** pixels are the untreated original.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Approach — chosen by measurement (radius).** The image body is now a
texture-filled rounded-rect `Graphics`
(`roundRect(...).fill({ texture, textureSpace: 'local' })`) instead of a
flat `Sprite`. `textureSpace: 'local'` stretches the source texture to
the placement rect and the `roundRect` path clips the corners — so the
3px radius costs **no per-sprite stencil mask and no custom shader**, and
every same-texture image body stays in the shared Pixi GraphicsPipe
batch. A per-sprite `Graphics` mask (the ticket's named risk) would force
a stencil push/pop per image and strictly break that batch; a custom
mesh/shader would not batch across instances in Pixi v8 either and adds a
dual WebGL/WebGPU GLSL/WGSL burden for a 3px corner. The texture-fill
rounded quad achieves the same visual with zero custom GL, so it won the
comparison on both simplicity and batch behaviour.

**Shadow.** One shared 9-slice silhouette texture, built once by the host
from `--ew-node-shadow` (a blurred rounded rect on an offscreen canvas),
rendered per image as a `NineSliceSprite` under the body, sized to the
placement + the token's blur spread, alpha from the token. One texture →
shadows batch. NOT a per-image blur filter.

**Perf (the hard gate, real GPU, this machine).** 150 simultaneously
visible images, §12.3 pan/zoom workload, p95 over three runs each
(`P95_LIMIT_MS = 25`):

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| Before (raw sprites) | 9.3 ms | 9.3 ms | 9.2 ms |
| After (radius + shadow) | 9.1 ms | 9.3 ms | 9.2 ms |

**No measurable regression** — the treatment holds p95 flat and well
within §12.1, confirming the batch is preserved. Because the chosen
approach already pinned p95 to the baseline (and a stencil mask could
only be worse for batching), no separate mask benchmark was needed to
resolve doubt. The unmodified `perf.spec.ts` gate stays green (3/3), as
do all other specs (desktop e2e 165/165).

**Untouched pixels (exports/crops).** Proven two ways. (1) Unit
(`placement.test.ts`): the resident body samples the EXACT injected
texture object (`__imageTexture === source`) — the rounding is a
`Graphics` fill and the shadow a separate object, so nothing is
composited into the source. (2) e2e (`image-treatment.spec.ts`): after a
treated image renders on the board, the managed asset re-fetched over
`ew-asset://<digest>` is byte-identical to the imported bytes. There is
no export module yet; crop is stored (`appearanceCrop`) and consumed by
the derivative queue from the asset blob, never from the rendered sprite,
so it is inherently untreated.

**Tokens / resources bridge.** Added `--ew-node-radius: 3px` and
`--ew-node-shadow: 0 8px 22px rgba(0,0,0,.3)` to `theme.css` (matching the
UI-vision reference). The engine reads no CSS: `ImageTreatment` is
resolved by the host (`canvas/image-treatment.ts`) and injected via the
existing `RendererResources` bridge, exactly like `frameColors`. The host
parser/geometry is unit-tested (`image-treatment.test.ts`, 6 tests);
`image-treatment.test.ts` is added to the theme raw-color allowlist
because it parses literal box-shadow token fixtures.

**Deviations.** (a) The ticket named `packages/canvas-engine/src/resources.ts`
as the bridge; that file does not exist — the real seam is
`RendererResources` in `renderers/registry.ts`, so tokens are wired there
and in the host, not a `resources.ts`. (b) The debug seam
`placementTreatment(id)` was added (mirrors `placementBody`) so the e2e
can assert the applied radius/shadow. (c) During bring-up a stale desktop
bundle made the shadow appear absent; a clean `pnpm -r build` fixed it —
worth noting since the desktop resolves `@ew/*` through dist. (d) The box-
shadow parser initially required `px` on every length and mis-read the
unitless leading `0`; fixed to scan leading length tokens until the color.
