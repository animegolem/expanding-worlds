---
node_id: AI-IMP-241
tags:
  - IMP-LIST
  - Implementation
  - spike
  - performance
  - canvas
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-241-texture-budget-tiers

## Summary of Issue #1

The 217 spike's headline: 500 images = 4.7GB RESIDENT texture
memory (the TextureBudget's 512MB cap trims only the idle pool) —
the 2020 iPad has 6GB total, and a desktop board with alph's real
hoard will hit the same wall. Owner greenlit the de-risk spike:
prototype DOWNSCALE/EVICTION TIERS in the 217 harness — resident
textures degrade to capped resolutions by screen contribution
(an image rendering at 300px doesn't need its 2048px texture),
with the full-res texture re-acquired on zoom-in — and measure
the ceiling vs visual cost. Done means the harness has a tiering
mode (off / tiered), the sweep reports peak resident bytes and a
visual-integrity note for both modes at 100/300/500 images, and
the spike report states whether tiering holds 500 images under a
named budget (target: <1.5GB) with acceptable swap latency —
plus the seam list for landing it in the real engine
(TextureBudget/Culler are the homes).

### Out of Scope

- Landing tiering in packages/canvas-engine (the spike CONVICTS
  or ACQUITS the approach; a real ticket follows).
- Tile-pyramid/mipmap-file formats (runtime downscale only).
- The 195 crispness work (separate; note interactions).

### Design/Approach

In the harness (spike/webkit-renderer — coordinate: a sibling
agent COPIES from it for Tauri; you may MODIFY it, additively):
a tier ladder (e.g. full / 1024 / 512 / 256) chosen per texture
from rendered-px contribution each cull pass; downscale via
createImageBitmap(resizeQuality high) or canvas draw; evict the
higher tier when the budget demands (LRU by contribution);
re-acquire full on demand with the swap instrumented (count +
worst-case visible-lowres duration). Extend the sweep JSON:
peakResidentBytes, tierHistogram, swapCount, swapWorstMs. Run
both modes × three sizes in Chromium; report the table +
subjective visual note + engine-seam list.

### Files to Touch

`spike/webkit-renderer/**` (additive), `RAG/spike-reports/
texture-budget-tiers.md`, this ticket.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Tiering mode in the harness; ladder + eviction + re-acquire
      instrumented.
- [x] Both modes × 100/300/500 measured in Chromium; table in the
      report.
- [x] Verdict vs the named budget + engine-seam list.
- [x] Repo untouched outside spike/ + report + this ticket.

### Acceptance Criteria

**GIVEN** the spike report
**THEN** we know whether runtime tiering holds a 500-image board
under ~1.5GB resident with acceptable swap behavior — and what it
costs to land in the engine.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Verdict: ACQUIT, decisively.** Tiered 500 images = **~136 MB peak
  resident** vs the `off` baseline **4498 MB** — an order of magnitude
  under the 1.5 GB target. Peak resident came out **decoupled from
  board size** (151 / 146 / 136 MB at 100 / 300 / 500), governed by the
  on-screen working set, not the hoard. Full report + mode×size table +
  engine-seam list in `RAG/spike-reports/texture-budget-tiers.md`.

- **Additive to the 217 harness (sibling-copy safe):** all tier logic
  is a NEW module `spike/webkit-renderer/src/tiering.ts`
  (`TieredTextureBudget`) + a NEW driver `sweep-tiers.mjs`; existing
  files got flag-only edits (`?mode=/&budget=` query + UI dropdown in
  `main.ts`/`index.html`, one additive export in `textures.ts`). The
  `off` path — what the Tauri sibling copies — is byte-for-byte the 217
  baseline. `packages/**` untouched.

- **Swap-latency bug caught mid-spike:** the first run reported
  `swapWorstMs = 0` because the completion timestamp reused the
  request-time `now` (measuring request→request-detection ≈ 0). Fixed to
  stamp `performance.now()` when the higher tier actually lands
  on-screen; re-ran. Honest worst was then 5.5 ms (100 imgs) to ~120 ms
  (500 imgs) — but that tail is **load-inflated** (see below).

- **Measurement environment (LOAD-SUPPRESSED frame times):** ~10 sibling
  agents were building/testing on the same M1 Pro during the sweep —
  `loadavg` 104–131 on 10 cores. Per the coordinator note, `loadavg` is
  recorded beside every row and **fps/p95/p99/long rows are marked
  LOAD-SUPPRESSED** (undercount headroom; lead to re-run quiet before any
  frame-rate verdict). `swapWorstMs` is likewise **load-inflated** (it
  includes CPU-bound `createImageBitmap` resizing). **`peakResidentBytes`
  and `tierHistogram` are load-insensitive and are the decisive,
  trusted output.**

- **Owner focus-steal fix applied:** driver launches headed Chrome
  parked off-screen (`--window-position=4000,200`) and never calls
  `bringToFront`. Validated silence keeps numbers honest — `gl.renderer`
  stayed real `ANGLE Metal Renderer: Apple M1 Pro`, mean fps 85–118 (no
  ~1 Hz background-throttle), thanks to the 217 throttling-disable flags.

- **The LRU byte-budget eviction was implemented but NOT stressed:** the
  rendered-px cap alone kept peak resident at ~9% of the 1536 MB budget,
  so the eviction backstop never fired in these scenes. It remains
  necessary for pathological cases (a wall of images all at full res)
  and should ship with the engine landing, validated separately.

- **Full-res re-acquire path exercised but rarely demanded at density:**
  at 100 images 8% of observations reached the 1024 tier and 0.4% full;
  at 500 images 96% sat at the 256 floor and `full` was effectively never
  demanded — because even the sweep's closest zoom keeps ~320-world
  images at ≤512 device px on a dense board. A genuine finding, not a
  gap: the memory a board needs is set by on-screen legible-size working
  set, which is small and roughly constant.

- **Visual cost: none at steady state** (off vs tiered screenshots at an
  identical mid-zoom viewport are indistinguishable — same crispness,
  1191 MB vs 75 MB live), because the ladder only ever caps a texture at
  a tier ≥ its rendered size. Transient one-rung softening during an
  active zoom-in only. DPR factor is load-bearing for tier selection
  (interacts with §195 crispness — flagged in the report, out of scope).

- **Validation run:** `pnpm -r build` green; harness `npx tsc --noEmit`
  clean; `vite build` green (769 modules); both-mode × three-size sweep
  emitted valid JSON with real-GPU `gl.renderer` on every row.
