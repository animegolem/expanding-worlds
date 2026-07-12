---
node_id: AI-EPIC-024
tags:
  - EPIC
  - AI
  - color
  - integration
date_created: 2026-07-07
date_completed:
kanban_status: deferred
AI_IMP_spawned:
---

# AI-EPIC-024-color-analysis

## Problem Statement/Feature Scope

The first tester co-designed a sibling tool, Color Tool
(`animegolem/color-tool-kmeans`, MIT): k-means clustering in OKLab
that shows a painter how an image is built — dominant colors on a
polar hue×chroma chart, a cluster histogram, hue×lightness scatter,
value/notan studies. Today that analysis lives in a separate app: he
must export from the board, open the other tool, analyze, export a
chart, and drag it back. Reference boards are exactly where palette
studies want to live — pinned next to the image they explain.

## Proposed Solution(s)

An "Analyze colors…" verb on image placements (§8.4 context-menu
grammar). It opens a takeover overlay (chrome — terminal, instant)
showing the core chart suite for that image with one or two curated
presets, not the full parameter surface. Every chart card carries a
plus charm: pressing it renders the chart to SVG, rasterizes to PNG
(~2x), and imports it as an ORDINARY asset placed beside the source
image — no new node kind, no new domain semantics; trash, undo,
export, and gallery all work unchanged.

Implementation shape (validated by repo recon, 2026-07-07): Color
Tool's chart/export layer is pure TypeScript in Svelte 5 (`tauri-app/
src/lib/exports/` — polar-chart, histogram, hue-lightness, svg/png
compositors) and vendors cleanly; it is our code (MIT, owner-designed)
and the tool is feature-stable, so a vendored copy is acceptable —
parity drift is a non-issue so long as the OKLab math is correct.
Only the compute is Rust (`kmeans.rs` behind the Tauri bridge, which
has a clean `analyze(dataset, params) → AnalysisResult` seam): port
k-means++/OKLab sampling to a TS web worker for Electron (single
stills at preset sampling quality run in seconds; WASM-compiling the
Rust is the fallback if the port disappoints). Results need not be
bit-identical to the standalone tool (seeded, different runtime) —
document, don't chase.

## Path(s) Not Taken

- Video analysis, batch/composite palettes, notan/value studies:
  v1 is stills-only, colors-only. Values are the natural second
  slice if the first earns its keep.
- The full parameter surface (cluster count, sampling quality,
  merge threshold, three polar modes): a second app's worth of
  chrome. Presets + an "open in Color Tool" escape hatch instead.
- Live/linked analysis objects that re-run when the asset changes:
  over-engineering; the embed is a snapshot.
- Near-real-time chart playback over live video is a COLOR-TOOL
  ambition the owner may pursue there someday (noted 2026-07-07,
  explicitly not now); this epic never depends on it.

## Success Metrics

- From a reference image on a board to a placed palette-study
  object in ≤3 interactions (verb → overlay → plus charm), no
  export/import round-trip through another app.
- The embedded chart is a plain asset: appears in gallery/exports,
  trashes and restores, undoes as one placement — proven by the
  standard e2e patterns, no special-cased paths.
- The first tester uses it on real reference boards and keeps the
  results pinned (HUMAN-TESTING validates feel before the epic
  closes).

## Requirements

### Functional Requirements

- [ ] FR-1: "Analyze colors…" verb on image-placement context menus
      (grammar per §8.4; disabled-with-reason on non-image kinds).
- [ ] FR-2: TS-worker compute: k-means++ over OKLab samples of the
      placement's asset, preset-driven (ported from `kmeans.rs`;
      correctness pinned by fixture images with known clusters).
- [ ] FR-3: Takeover overlay with the core charts (polar hue×chroma,
      cluster histogram, hue×lightness) rendered from the vendored
      chart code; one or two presets only.
- [ ] FR-4: Plus charm per chart card: SVG → PNG (~2x) → ordinary
      asset import + placement beside the source image, one undo
      entry.
- [ ] FR-5: "Open in Color Tool" escape hatch (external launch with
      the asset path) for the full instrument.

### Non-Functional Requirements

- Analysis of a typical still (≤4k) completes in low single-digit
  seconds on the reference hardware; the worker never blocks the
  renderer thread.
- Vendored chart code lands as a fenced package with an
  ATTRIBUTION note (MIT) and its own tests; no reach-ins from the
  canvas engine.
- All chrome obeys the two-materials doctrine and theme tokens (no
  raw hex; overlay is chrome, embeds are world).

## Implementation Breakdown

Deferred — no IMP tickets cut. When activated: recon-refresh the
Color Tool repo state first (owner is mid-UI-pass there), then
roughly: vendor+port compute (worker) · overlay+charts · embed
pipeline · menu verb + e2e.
