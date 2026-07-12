---
node_id: SPIKE-REPORT-001
tags:
  - spike
  - renderer
  - decision
date_created: 2026-07-03
related: "[[AI-EPIC-001-renderer-spike]]"
---

# Renderer comparison: PixiJS vs Konva

Closes RFC-0001 open question 14. Evidence from AI-IMP-001..003:
identical seeded fixtures (seed 20260703), identical op streams, ten
scenarios covering every RFC §12.3 bullet, run four ways — each
renderer in headless Chromium (SwiftShader software GL) and headed
Chromium (real GPU via ANGLE/Metal). Raw JSON in `data/`. The test
display runs at 120 Hz, so 8.33 ms average = vsync floor; the noop
baseline confirms zero harness overhead.

## Decision

**PixiJS.** EPIC-004's Canvas Controller builds on PixiJS 8.

## Frame time (avg ms; p95 in parentheses for GPU runs)

| Scenario | pixi headless | pixi GPU | konva headless | konva GPU |
|---|---|---|---|---|
| map-pan-zoom | 12.63 | 8.33 (8.4) | 8.33 | 8.94 (9.3) |
| images-300 | 8.90 | 8.33 (8.5) | 8.33 | 8.34 (9.3) |
| pins-1000-labels | 20.08 | 8.33 (8.5) | 9.96 | 9.41 (16.7) |
| marquee-select | 12.45 | 8.34 (8.9) | 8.33 | 8.33 (9.1) |
| multi-drag-snap | 9.30 | 8.33 (8.9) | 8.41 | 8.33 (9.0) |
| resize-rotate | 8.88 | 8.33 (8.7) | 8.40 | 8.33 (9.0) |
| highlight-matches | 25.41 | 8.33 (8.4) | 8.41 | 8.33 (8.7) |
| background-ops | 20.74 | 8.33 (8.8) | 8.33 | 11.69 (9.0) |
| decoration-suite | 20.45 | 8.33 (9.3) | 8.40 | 8.33 (8.9) |
| swap-and-return | 11.59 | 9.40 (9.3) | 8.75 | 8.33 (8.9) |

Memory (swap-and-return, GPU): pixi 30.3→27.1→27.6 MB; konva
10.5→18.9→19.2 MB. Pixi's worst single frame is the 108 ms texture
re-upload spike when the 300-image scene remounts; Konva's worst is
9.4 ms.

## Reading the numbers

1. **On real GPU, PixiJS is at the vsync floor on every scenario with
   the tightest p95 in the field (≤ 9.3 ms).** Its poor headless
   numbers measure SwiftShader, not PixiJS.
2. **Konva is CPU-bound Canvas2D and already shows its ceiling at
   spike scale**: p95 16.7 ms on the 2,000-node pin scene even with a
   GPU (the hit-graph paints a second hidden canvas of all content
   every frame), and background-ops averages 11.69 ms. §12.1's targets
   are a floor, not a goal; real boards grow past them.
3. **Software-GL machines are Pixi's honest weak spot** (VMs, remote
   desktop, GPU-blocklisted drivers): 12–25 ms averages where Konva
   stays at floor. Electron ships its own Chromium and the target user
   is an artist on a GPU workstation, so this is accepted and recorded
   rather than decision-driving.

## Implementation effort (the deciding qualitative input)

RFC §12.3's rule: Konva wins only if it materially reduces
implementation risk. The spike showed it does not, for this app's
semantics:

- Konva's flagship Transformer could not express per-item
  scale/rotate-about-own-center (it transforms a group bounding box
  about a common anchor); the agent hand-wrote all transform math
  anyway and kept only the handle chrome.
- Region (marquee) queries had to be hand-rolled in both — Konva's hit
  graph only answers point queries.
- Both adapters landed at ~600–700 lines with roughly the same ~70%
  share of hand-built editor semantics. The expected Konva savings
  evaporated; what remains is its hit-graph tax and Canvas2D ceiling.
- Pixi costs: 245 kB gzip renderer chunk (Konva ~185 kB), explicit
  texture lifecycle discipline (a workaround was needed to bypass the
  global `Texture.from` cache so destroyed textures cannot resurrect),
  and the swap-time re-upload spike.

## Carry-forwards into EPIC-004

- Preload/async-upload textures on canvas swap to kill the 108 ms
  remount spike (§12.2's lazy loading requirement).
- Pin labels need BitmapText or LOD; per-pin rich Text was the only
  headless-visible cost that lingers structurally.
- Keep explicit texture ownership out of `Texture.from`'s global
  cache, exactly as the spike adapter does.
- Document a minimum requirement of hardware-accelerated graphics; no
  Canvas2D fallback renderer is planned.

## Konva revival conditions

Reopen only if EPIC-004 hits a PixiJS blocker of comparable weight:
untenable interaction-layer complexity, texture-memory instability on
real projects, or a hard requirement to support software rendering.
