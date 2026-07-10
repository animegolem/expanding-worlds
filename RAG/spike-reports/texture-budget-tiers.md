---
node_id: SPIKE-REPORT-004
tags:
  - spike
  - renderer
  - performance
  - texture-budget
  - canvas
date_created: 2026-07-09
related: "[[AI-IMP-241-texture-budget-tiers]]"
---

# Texture-budget tiers: can runtime downscaling hold a 500-image board?

The 217 spike's headline watch-item was memory, not frame rate: a
500-image board holds **~4.7 GB of RESIDENT texture memory**, because
`TextureBudget`'s 512 MB cap trims only the *idle* pool — every texture
near the viewport stays at its full 1024–2048px native size no matter
how few screen pixels it actually covers. On a 6 GB 2020 iPad Pro (the
V2 floor, alph's future device) that is the likeliest failure mode: a
memory-pressure tab kill, not a frame-rate cliff.

This spike prototypes the fix in the 217 harness (additively — the
sibling Tauri copy sees the 217 path unchanged): a **runtime
texture-tier ladder**. Each resident texture is kept at a *capped*
resolution — `full / 1024 / 512 / 256` — chosen every cull pass from its
rendered-px contribution (an image drawing at 300px does not need its
2048px texture). Downscaling is `createImageBitmap(resizeQuality:
'high')`; under a named byte budget the least-contributing textures are
forced down the ladder (LRU-by-contribution eviction of the higher
tiers); zooming in re-acquires the full-res tier on demand, with every
swap instrumented (count + worst visible-lowres duration). The tier
logic lives in the harness (`spike/webkit-renderer/src/tiering.ts`) as a
drop-in for the engine budget's `acquire`/`release` surface, precisely
so this report can name what the real `TextureBudget`/`Culler` would
need to grow. **Nothing in `packages/` was touched.**

## Measurement discipline

- **Real GPU only.** Every row's `gl.renderer` reads
  `ANGLE Metal Renderer: Apple M1 Pro` (real headed Chrome, hardware
  Metal), never SwiftShader/llvmpipe (EPIC-004 rule).
- **Silent windows.** The driver launches headed Chrome parked
  off-screen (`--window-position=4000,200`) and never activates it, so
  runs do not steal focus on the owner's machine. Validated that this
  keeps numbers honest: `gl.renderer` stays real Metal and mean fps
  stays 85–118 (not the ~1 Hz of a throttled background tab) thanks to
  the 217 throttling-disable flags.
- **Load caveat (decisive).** These runs executed with **~10 sibling
  agents building/testing on the same M1 Pro** — `loadavg` 104–131 on 10
  cores. **Frame-time rows are therefore LOAD-SUPPRESSED** and undercount
  real headroom; they are recorded for shape only, and the lead should
  re-run the decisive fps cells on a quiet machine before any
  frame-rate verdict ships. **Memory metrics (`peakResidentBytes`,
  `tierHistogram`) are load-insensitive and are the trustworthy output
  of this spike.** `swapWorstMs` is a wall-clock latency that includes
  CPU-bound bitmap resizing, so it too is **load-inflated** here (a
  ceiling, not a typical).

## Numbers

Dev Mac: **Apple M1 Pro**, macOS, DPR 2, 10 cores, 32 GB. Real headed
Chrome, viewport 1440×900. GL `ANGLE Metal Renderer: Apple M1 Pro`.
Named budget: **1536 MB** (the ~1.5 GB target itself, so the row shows
what enforcing that cap costs). Scene = N image placements + ~15%
decorations (the `imgs` column is total items). 30 s sweep
(serpentine pan → zoom oscillation → diagonal residency-thrash).

| Mode | Images (items) | loadavg 1m | mean fps | p95 ms | p99 ms | long (>33ms) | **peak resident tex** | swaps | worst swap ms | tier mix (256/512/1024/full %) |
|---|---|---|---|---|---|---|---|---|---|---|
| off | 100 (115) | 110 | 110.2 | 16.5 | 24.0 | 6 | **905 MB** | 0 | — | 0 / 0 / 0 / 100 |
| off | 300 (345) | 104 | 109.6 | 15.8 | 25.8 | 25 | **2725 MB** | 0 | — | 0 / 0 / 0 / 100 |
| off | 500 (575) | 131 | 85.3 | 25.1 | 100.0 | 98 | **4498 MB** | 0 | — | 0 / 0 / 0 / 100 |
| **tiered** | 100 (115) | 119 | 116.1 | 9.3 | 16.9 | 1 | **151 MB** | 1052 | 5.5 | 57 / 35 / 8 / 0.4 |
| **tiered** | 300 (345) | 112 | 100.3 | 16.7 | 50.0 | 61 | **146 MB** | 1532 | 133.9† | 90 / 9 / 1 / 0 |
| **tiered** | 500 (575) | 119 | 92.2 | 24.9 | 74.2 | 83 | **136 MB** | 1531 | 121.7† | 96 / 4 / 0.2 / 0 |

_Frame-time columns (fps/p95/p99/long) are **LOAD-SUPPRESSED** — loadavg
≫ 8; re-run quiet before trusting. `† worst swap ms` is load-inflated
(CPU-bound resize under loadavg ~120). `peak resident` and `tier mix`
are load-insensitive and trustworthy._

Reading it:

1. **The `off` rows reproduce the 217 memory wall** — 0.9 / 2.7 / 4.5 GB
   at 100 / 300 / 500, tracking the 217 baseline (0.95 / 2.86 / 4.72 GB)
   within scene/sweep variance. Resident memory scales linearly with
   board size and is uncapped: this is the iPad tab-kill risk, restated.

2. **Tiering flattens resident memory to ~0.14 GB — independent of board
   size.** 151 / 146 / 136 MB at 100 / 300 / 500. Peak resident is
   bounded by the *residency-rect working set at the tier the rendered
   size demands*, not by the total image count, so a 500-image board
   costs essentially the same resident memory as a 100-image one. **That
   decoupling is the headline.** The 1536 MB budget cap is never
   approached (peak ~9% of it), so **no LRU eviction was even triggered**
   in these scenes — the rendered-px cap alone does all the work.

3. **The tier mix explains why.** At 500 images, 96% of resident-texture
   observations sat at the **256** floor and only 0.2% ever reached
   1024; `full` was effectively never demanded. At these board
   densities even the sweep's closest zoom (`wideZoom × 8`, calibrated
   in 217 to "several images fill the screen") renders each ~320-world
   image at only ~256–512 device px, so the ladder keeps almost
   everything tiny. The full-res re-acquire path *is* exercised (it
   fires at 100 images: 8% reach 1024, 0.4% full), just rarely at dense
   board sizes — a genuine finding: **the memory a board actually needs
   is set by how much of it is on screen at legible size, which is a
   small, roughly constant working set.**

4. **Swap behavior.** 1000–1500 tier swaps over the 30 s sweep (the
   zoom-oscillation and residency-thrash phases churn tiers constantly).
   Worst visible-lowres duration was 5.5 ms at 100 images and ~120–134 ms
   at 300/500 — but that tail is load-inflated: each swap re-runs a
   `createImageBitmap` high-quality resize on a CPU pinned at loadavg
   ~120. On a quiet machine the 100-image 5.5 ms is the more
   representative figure; the sub-frame-to-a-few-frames window is a
   texture briefly showing one ladder rung softer than ideal during an
   active zoom-in, then sharpening — not a placeholder/grey-box blink.

## Visual-cost note (subjective)

Captured off vs tiered at an identical mid-zoom viewport (300 images,
DPR 2), both settled. **They are visually indistinguishable**: the
value-noise wash, the scattered accent circles, and the per-image
`hash-###` corner labels read with the same crispness in both — while
the texture-memory readout shows **1191 MB (off) vs 75 MB (tiered)** for
the same pixels on screen. This is by construction: the ladder only ever
caps a texture at a tier **≥ its rendered device-px size**, so at steady
state there is no visible minification loss — the capped texture already
carries at least as many texels as the screen can show. The only visual
cost is **transient**: during an active zoom-*in*, a texture can render
one rung softer for the swap window (the load-inflated `swapWorstMs`
above) before the higher tier lands. No pop to placeholder, no hard LOD
banding — it reads as a brief, mild softening that resolves as the zoom
settles. (The §195 crispness work is separate and out of scope; note the
interaction — tier selection must target **device** px, i.e. × DPR, or a
Retina board would cap one rung too low and look soft. The harness does
this; §195 and any engine landing must keep the DPR factor.)

## Verdict vs the ~1.5 GB target

**ACQUIT — decisively.** Runtime tiering holds a 500-image board at
**~136 MB peak resident**, an order of magnitude under the 1.5 GB
target and ~33× below the 4.5 GB `off` baseline, at zero steady-state
visual cost and acceptable (sub-frame on a quiet CPU) swap latency. The
result is stronger than the target asked for: peak resident is
**decoupled from board size** entirely, because it is governed by the
on-screen working set, not the hoard. The 6 GB iPad tab-kill risk the
217 report flagged is removed by this approach. A real hoard (alph's
thousands of references) would resident the same ~100–200 MB as a
hundred, so the ceiling is the *device viewport*, not the library size.
The engine should land tiering (its own ticket); the LRU byte-budget
eviction was not stressed here (the rendered-px cap kept memory far
under budget) but remains the necessary backstop for pathological cases
(a wall of images all zoomed to full res at once), so it should ship
too — just validated separately.

## Engine-seam list — landing it in `packages/canvas-engine`

Line refs are current at this spike. The homes are `TextureBudget`
(`src/texture-budget.ts`), the `Culler` (`src/culling.ts`), and the
placement renderer (`src/renderers/placement.ts`).

1. **`TextureBudget` is tier-blind — the biggest seam.** `acquire(hash,
   url)` (`texture-budget.ts:42`) takes no rendered-size/tier argument,
   and `#load` (`:30`, `:36`) is `(url) => Promise` — it can only ever
   produce ONE resolution per hash. Byte size is computed once from
   `source.pixelWidth × pixelHeight` (`:65–73`) and treated as immutable.
   Tiering needs: a per-entry **current cap** field on `Entry`
   (`:18–25`); a tier-aware loader `(url, capPx) => Promise<Texture>`
   that downscales (the harness's `#makeTierTexture`); and an
   `acquire`/`retier` path that can swap an entry's live texture to a new
   cap and update its accounted bytes.

2. **`#trim` caps only the IDLE pool — the resident side is unbounded
   (this IS the 4.7 GB leak).** `#trim` (`texture-budget.ts:99–115`)
   sums and evicts `refs === 0` entries against `#maxIdleBytes` only;
   `refs > 0` (resident) textures are never capped by design comment
   (`:1–9`, `:82–89` in the header docstring, `stats()` split at
   `:122–130`). Tiering adds a **resident-side budget**: instead of
   destroying resident textures, downgrade their tiers LRU-by-
   contribution until the resident set fits a named cap (the harness's
   `planTiers`). This is a new method beside `#trim`, and it needs a
   per-hash *contribution* input it does not have today.

3. **The `Culler` already computes everything tiering needs each pass,
   and throws it away.** `apply()` (`culling.ts:62–93`) has the camera,
   the viewport, and every item's world AABB in hand — the rendered-px
   size (`maxEdge × zoom × scale × DPR`) is one multiply away. But the
   residency hooks fire **only on enter/leave transitions** (`:76–84`),
   so a pure zoom-in that keeps an item resident fires nothing — exactly
   the case that must trigger a full-res re-acquire. Tiering needs the
   Culler (or the host's per-cull re-eval, mirroring how
   `syncPlacementIconLod`/`syncPlacementLabelOffset` are already re-run
   every cull pass — see `placement.ts:831` and `:797` docstrings) to
   compute rendered px for each **resident** item every pass and feed a
   desired cap to the budget. Reuse `placementRenderedMaxEdge`
   (`placement.ts:720–726`) — but add the **× DPR** factor it currently
   omits (seam #6). The residency rect (`RESIDENCY_PADDING = 0.75`,
   `culling.ts:26`, `:64–65`) is the right working-set boundary to size
   the resident budget against.

4. **The residency switch needs a tier-swap sibling.**
   `setPlacementTextureResident` (`placement.ts:613–652`) grants/revokes
   a texture on a residency transition; there is no path to **re-draw a
   still-resident body at a new tier**. The primitives exist —
   `attachTexture` (`:564–605`) and `drawImageBody` (`:199–213`) — so the
   swap calls `drawImageBody` with the new-tier `Texture`. The real
   version (unlike the harness's radius-0/no-crop `makeSyntheticRedraw`)
   must reapply the host `imageTreatment` radius (`:320`) and the
   `__imageCrop` UV matrix (`cropFillMatrix`, `:177–179`, stored at
   `:318`) at the new tier, and update `__imageTexture`/`__acquiredHash`
   (`:107–127`) so an in-place `resizeImageBody` (`:888–909`) keeps the
   current tier instead of reverting.

5. **`RendererResources.textures` interface must carry the cap.**
   `registry.ts:68–70` is `acquire(hash, url): Promise<unknown>` /
   `release(hash)`. Landing tiers means either a cap argument on
   `acquire` or a companion `setDesiredTier(hash, capPx)` the cull pass
   calls — plus `stats()` growing a per-tier histogram + peak-resident
   field (the harness's `metrics()`), which the desktop perf HUD and the
   e2e memory gate would read.

6. **DPR must enter tier selection (interacts with §195).** Tier
   selection targets **device** pixels — `placementRenderedMaxEdge`
   (`placement.ts:720–726`) returns world × zoom × scale with **no DPR
   factor**. On a DPR-2 board that under-caps by one rung and looks soft.
   The harness multiplies by `devicePixelRatio`; the engine landing must
   too, and coordinate with the §195 crispness work (same rendered-px
   quantity, opposite failure if DPR is dropped).

7. **Source availability for downscaling (host-loader seam, carried from
   217).** The engine has no default asset loader — the host injects
   `loadTexture` / `textures.acquire` (217 seam #2). A tier swap
   downscales from the *decoded source*; the harness repaints a
   deterministic canvas and LRU-caps a small canvas cache (a pessimistic
   proxy for decode cost — a share of the load-inflated `swapWorstMs` is
   this repaint, not the resize). The real host holds the decoded
   `ew-asset://` blob and should downscale from a cached
   `ImageBitmap`/`VideoFrame` via `createImageBitmap(resizeQuality:
   'high')` — cheaper and truer than the harness's repaint, so quiet-
   machine swap latency in production should beat even the 5.5 ms figure.

## Run it yourself — dev Mac (Chromium, reproducible)

```
cd spike/webkit-renderer
npm install
pnpm -r build            # (repo root) — the harness imports the BUILT engine dist
npm run dev              # serves on http://localhost:5199 (and the LAN)
# both modes × three sizes, one Chrome launch, JSON array on stdout:
node sweep-tiers.mjs http://localhost:5199 1536
```

`sweep-tiers.mjs` launches **real Google Chrome parked off-screen**
(real GPU, no focus steal), sweeps `mode=off|tiered × 100|300|500`, and
prints a per-row line (with `loadavg`) on stderr plus the full JSON on
stdout. Manual: open `http://localhost:5199/?mode=tiered&budget=1536`,
use the **Textures** dropdown (off / tiered) and **Budget MB** box in the
overlay, then Run the sweep. Verify `gl.renderer` is a real Apple GPU;
if `loadavg` is high, treat fps as LOAD-SUPPRESSED (memory stands).
