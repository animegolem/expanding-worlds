---
node_id: SPIKE-REPORT-004
tags:
  - spike
  - tauri
  - shell
  - webkit
  - asset-protocol
  - ipc
  - performance
date_created: 2026-07-09
related: "[[AI-IMP-240-tauri-shell-spike]]"
follows: "[[SPIKE-REPORT-003]]"
---

# Tauri shell spike: what does hosting the engine in Tauri v2 actually cost?

The V2 iPad sketch needs the app to leave Electron for a Tauri v2 shell
eventually. AI-IMP-217 proved the `@ew/canvas-engine` render path holds
up on WebKit *as a browser* (Safari IS WKWebView's engine). Three risks,
though, only exist *inside a real Tauri shell* and 217 could not touch:

1. **Asset loading** — Tauri serves local files through a custom
   protocol (`convertFileSrc` → `asset://`); the folklore pain point for
   image-heavy apps. Our textures/blobs must stream through it.
2. **IPC bridge** — `invoke`/`#[tauri::command]` round-trip latency and
   payload behaviour vs Electron's preload/utility split.
3. **WKWebView as Tauri configures it** — may differ from Safari
   defaults (rAF cadence, JIT, gestures, CSP, memory).

This spike (`spike/tauri-shell/`) wraps a **copy** of the 217 harness
scene (planes → SceneSync → default registry → TextureBudget → Culler →
Camera, host-equivalent pan/zoom) in a minimal Tauri v2 macOS app. The
one deliberate change from 217: every texture is a **real PNG on disk**,
painted in the WebView, written via a Rust command, and streamed back
through the **asset protocol** — so risk #1 runs on the true path. One
`#[tauri::command] echo` is measured at 1 KB and 1 MB. The 30 s sweep
runs in-shell and the summary JSON is posted back to Rust for headless
capture.

## Measurement discipline (EPIC-004) — READ FIRST

- **Real GPU, verified.** `gl.renderer = "Apple GPU"` (WebKit's generic
  Apple-GPU string; not SwiftShader/llvmpipe). WebGL on real Metal.
- **Dev mode, not a bundle.** Numbers are from `tauri dev` (WKWebView +
  the real Rust IPC + the real asset protocol). A signed `.app` bundle
  was not built — see seam #7. Per the ticket, dev-mode numbers are
  acceptable; nothing in dev vs bundle changes the render/asset/IPC hot
  paths measured here.
- **⚠️ EVERY TIMING ROW BELOW IS `LOAD-SUPPRESSED`.** The runs executed
  with **~10 sibling agents building/testing on the same M1 Pro**;
  `vm.loadavg ≈ 69 / 71 / 49` on a **10-core** machine (7× saturation,
  far past the >8 gate). Frame times, IPC latency, and the scene-fetch
  numbers are all inflated by CPU contention. **The lead must rerun the
  decisive sweeps on a quiet machine.** The *memory* numbers
  (resident-texture bytes) and the *pass/fail facts* (protocol works, no
  size ceiling, IPC verified) are load-independent and trustworthy.
- Device: **Apple M1 Pro**, macOS, DPR **2**, 10 cores. Window rendered
  **off-screen + unfocused** (`x:4000, focus:false`, owner's
  focus-steal constraint) — see the cadence note under the table.

## Sweep numbers — Tauri WKWebView vs 217's Chromium baseline

Same synthetic board, same 30 s serpentine-pan → zoom-oscillate →
diagonal-thrash sweep, same M1 Pro.

| Device / Shell | DPR | Images (items) | mean fps | p50 ms | p95 ms | p99 ms | max ms | long (>33ms) | peak resident tex | loadavg |
|---|---|---|---|---|---|---|---|---|---|---|
| M1 Pro / **Chrome** (217, quiet) | 2 | 100 (115) | 120.0 | 8.3 | 9.8 | 10.2 | 17.8 | 0 | 0.95 GB | ~quiet |
| M1 Pro / **Chrome** (217, quiet) | 2 | 500 (575) | 114.5 | 8.3 | 10.1 | 17.5 | 50.9 | 12 | 4.72 GB | ~quiet |
| M1 Pro / **Tauri WKWebView** | 2 | 100 (115) | 58.8 | 17 | 20 | 40 | 100 | 7 | **0.948 GB** | 69 · `LOAD-SUPPRESSED` |
| M1 Pro / **Tauri WKWebView** | 2 | 500 (575) | 50.2 | 17 | 36 | 100 | 100 | 44 | **4.39 GB** | 114 · `LOAD-SUPPRESSED` |

Reading it (with the load caveat front of mind):

1. **The load-independent cross-check is the strong signal: peak
   resident texture bytes at 100 images = 0.948 GB, vs 217's 0.95 GB on
   Chrome — essentially identical.** Memory is memory regardless of CPU
   load, so this confirms the engine's `TextureBudget`/residency
   behaviour is byte-for-byte the same in WKWebView. At 500 images the
   peak was **4.39 GB** vs 217's 4.72 GB on Chrome — same ballpark, the
   small delta just residency-timing noise. The 217 report's headline
   worry (resident-texture ceiling on a 6 GB iPad) transfers unchanged;
   the shell does not add or remove texture memory. **This — not fps —
   is the number that convicts or clears the iPad target.**
2. **p50 8.3 ms → 17 ms is mostly the display-link cap, not engine
   slowness.** WKWebView drives rAF at **60 Hz** (16.7 ms floor); Chrome
   used the 120 Hz ProMotion panel (8.3 ms floor). A *quiet* WKWebView
   would still read p50 ≈ 16.7 ms and mean ≈ 60 fps — that is the honest
   ceiling of this engine on this shell, and 60 fps is the target
   anyway. Do **not** read the 120→59 fps drop as a 2× regression; it is
   a 120 Hz-vs-60 Hz cap plus load.
3. **The tail (p99 40 ms, max 100 ms, 597 frames over 30 s wall) is
   contention, not the engine.** Only 7 frames breached 33 ms, but each
   stall is clamped by Pixi's `maxElapsedMS` to a recorded 100 ms while
   the real freeze was multi-second — so `meanFps` (58.8) over-reports
   and wall-clock cadence was ~20 fps. Seven discrete multi-second
   freezes during a sweep, on a box at loadavg 69, is the shape of CPU
   contention from sibling builds, not a steady off-screen-throttle
   (which would depress *every* frame uniformly). **Flagged for the
   quiet rerun to settle throttle-vs-load; a brief on-screen control
   there would confirm.**

**Off-screen cadence honesty.** The window ran off-screen + unfocused to
respect the owner's focus-steal constraint. WKWebView *can* throttle
fully-hidden content, so `visible:false` was avoided; off-screen-visible
is the honest middle. The 60 Hz p50 shows rAF was *not* collapsed to a
1 Hz throttle — cadence is real — but the stall tail cannot be cleanly
split from machine load here. The quiet rerun should compare on-screen
vs off-screen frame *counts* to close this.

## Asset protocol — the headline verdict: NOT the pain point (here)

Two separate measurements, because they answer different questions:

**(a) Raw protocol read latency** — a dedicated probe fetching 100
distinct on-disk PNGs (~2.5 MB each) sequentially through
`convertFileSrc` + `fetch`, cold then warm:

| | n | min | median | p95 | max | mean |
|---|---|---|---|---|---|---|
| **cold** (first fetch) | 100 | 2 | **5** | 10 | 15 | 5.64 |
| **warm** (immediate refetch) | 100 | 1 | 4 | 10 | 14 | 4.92 |

Median **5 ms** to serve a 2.5 MB local image through the asset protocol
— **even under loadavg 69**. That is the number that matters for risk #1
and it is excellent. The folklore ("Tauri asset protocol is slow for
image-heavy apps") does **not** reproduce for local-file reads on macOS.

- **Caching:** warm ≈ cold (4 vs 5 ms). WKWebView is *not* heavily
  caching decoded responses (and we didn't ask it to) — but the read is
  so cheap it doesn't matter. No cache-header tuning needed for
  correctness; a real port may add `Cache-Control` if it wants to skip
  re-decode, but latency is not the driver.
- **Size ceiling:** none found. Raw binary blobs through the same
  protocol: **8 MB → 12 ms, 32 MB → 38 ms, 128 MB → 256 ms** — linear at
  ~0.5 GB/s, no cap, no failure. A single asset far larger than any real
  texture streams fine.

**(b) End-to-end texture readiness under a cold-open burst** — the
engine's actual `TextureBudget.acquire` during `loadScene`, which fires
~100 texture loads *concurrently* and folds in `createImageBitmap`
decode of 1–2 K-px PNGs:

| | n | min | median | p95 | max | mean | total |
|---|---|---|---|---|---|---|---|
| scene fetch+decode | 100 | 15 | 716 | 1266 | 1270 | 750 | 252 MB |

The gap between 5 ms (isolated read) and 716 ms (in-scene) is **decode +
100-way concurrency + loadavg 69**, *not* protocol latency. Real boards
load textures lazily via residency (a few at a time), not 100 at once on
open, so the isolated-read number is the more representative one. Still,
this says: **on a cold board-open, texture *decode* — not the asset
protocol — is the cost to watch**, and it compounds hard under CPU load.
(The 217 report's thumbnail-pyramid deferral would cut this directly.)

## IPC — `#[tauri::command] echo`, round-trip

| payload | iters | min | median | p95 | max | mean | verified |
|---|---|---|---|---|---|---|---|
| **1 KB** | 100 | 0 | **1** | 4 | 6 | 1.69 | ✓ |
| **1 MB** | 50 | 40 | **45** | 60 | 68 | 46.36 | ✓ |

(Both `LOAD-SUPPRESSED`; payloads verified round-tripped intact.)

- **1 KB round-trip ≈ 1 ms** — a command call is cheap; a
  persistence/command bridge built on `invoke` pays ~1 ms/call even
  under heavy load. Fine for the RFC's command-per-mutation shape.
- **1 MB round-trip ≈ 45 ms** is the number to respect. Tauri v2's
  default IPC serializes args/returns as **JSON strings**, so a 1 MB
  payload pays string-encode on both legs. **Port seam:** anything large
  crossing IPC (a pasted image blob, a bulk export) should use Tauri
  v2's **raw request / `Response` byte channel** or a `Channel`, not a
  JSON string arg — Electron's structured-clone `postMessage` is faster
  for big binary. Small command calls need no such care.

## Port-seam list — every config/CSP/dedupe/protocol issue hit

The primary deliverable for V2 scoping. In the order a real port meets them:

1. **Pixi single-instance dedupe (inherited from 217, still mandatory).**
   The engine dist imports `pixi.js` as a bare specifier; a fresh
   Vite/Tauri app resolves its own copy → two `Container` classes →
   Pixi's event mixin lands on one prototype → first pointer move throws
   and the canvas silently freezes. Fixed here exactly as 217: Vite
   `resolve.alias` + `dedupe: ['pixi.js']` pinning one instance. The
   desktop app gets this free from pnpm hoisting; **a Tauri port will
   not** — pin it. (Consider making the engine treat `pixi.js` as a peer
   dep + re-export the surface the host needs.)

2. **`assetProtocol.enable` in config REQUIRES the `protocol-asset`
   Cargo feature — and the build fails loudly if they drift.** First
   `cargo build` died with *"tauri dependency features do not match the
   allowlist … add the `protocol-asset` feature."* Config and
   `Cargo.toml` features must move in lockstep. (Running through the
   `tauri` CLI auto-injects it; a bare `cargo build`, or any hand-rolled
   feature list, does not.)

3. **Asset-protocol scope is mandatory and path-specific.** Textures are
   written to `app_cache_dir()`; the config scopes the protocol to
   `"$APPCACHE/**"`. Files outside the scope are refused. A real port
   must scope every dir it serves assets from (managed-blob cache, import
   staging) and keep the Rust write-path and the scope glob in sync.

4. **The engine has no default asset loader — the host wires it (from
   217).** `RendererResources.loadTexture` / `textures.acquire` are
   host-injected; the engine never fetches. This port supplies a loader
   that resolves `ew-asset://<hash>` → disk path (`convertFileSrc`) →
   `fetch` → `createImageBitmap` → mipmapped `Texture`. Clean seam, but
   "mount the engine" always means "wire a loader first."

5. **Cull debounce is load-bearing (from 217).** Synchronous
   `object.renderable` toggling on every `camera.set()` during the sweep
   storm corrupts Pixi 8 render groups. Copied the host's rAF-debounced
   `scheduleCull` verbatim. Any new host must replicate it.

6. **CSP was disabled (`"csp": null`) for the dev spike — a real port
   MUST author one, and it is non-trivial.** Left to a follow-up so the
   spike could measure without fighting Vite HMR + Pixi worker blobs.
   The production CSP must at minimum allow: `img-src`/`connect-src` the
   asset scheme (`asset:` on macOS / `http://asset.localhost`) so `fetch`
   and `<img>` reach textures; `worker-src 'self' blob:` (Pixi 8 spins
   texture-decode workers from blob URLs — the build emits a
   `webworkerAll` chunk); `script-src 'self'` (+ `'wasm-unsafe-eval'`
   if any Pixi WASM path is enabled). This is a real port task, not a
   one-liner — flagged, not solved.

7. **No `.app` bundle built (signing/entitlement wall not tested).**
   Stayed in `tauri dev` per the ticket's allowance. A distributable
   bundle needs codesigning/entitlements (and, on Tahoe, the unsigned
   xattr dance already in the release docs). Out of scope here; the
   render/asset/IPC paths measured are identical in a bundle.

8. **Large-payload IPC wants the byte channel, not JSON args** (seam
   from the IPC section) — 45 ms/MB on the default string IPC.

9. **WKWebView UA is headless-looking** (`AppleWebKit/605.1.15` with no
   `Version/` token) — the harness labels it `WKWebView (Tauri)`. Any
   UA-sniffing (feature detection, analytics) must not assume a
   `Version/x Safari/y` shape. Minor.

10. **Not exercised (deliberate, carried from 217):** tiled backgrounds
    / `BackgroundSync`, the icon atlas, image-body treatment, adaptive
    grid, gesture/selection chrome. Placements + decorations + labels
    only. Each needs its resources wired through the same loader seam;
    none looked structurally different, but all are untested in-shell.

## Friction notes (candid)

- **First-run texture painting is the slow part of *setup*, not the
  product.** The board paints N unique PNGs and writes them via IPC on
  first run (100 files ≈ tens of seconds; under loadavg 69 the initial
  run blew the default **2-minute** background-command timeout and was
  killed mid-suite). Files persist in the app cache, so reruns are fast.
  Lesson for the lead: give in-shell runs a generous timeout and expect
  a cold first pass.
- **Headless capture worked well.** Autorun → suite → post JSON to a
  Rust `report_result` command writing to a known dir is a clean pattern
  for a non-script-drivable WKWebView; no `safaridriver`, no clicking.
- **The machine load made the fps/IPC numbers provisional.** This is
  called out on every row; it is not a harness defect. The harness is
  ready to produce clean numbers on a quiet box in one command.

## Suggested HUMAN-TESTING line (owner to append)

> AI-IMP-240 — Tauri shell spike, **quiet-machine rerun** (all sibling
> agents idle): `cd spike/tauri-shell && npm install && (cd ../.. &&
> pnpm -r build) && EW_SPIKE_IMAGES=100 pnpm tauri dev` — the suite
> auto-runs (asset probe → IPC echo → 30 s sweep) and writes
> `results/sweep-100.json`; repeat with `EW_SPIKE_IMAGES=500`. Confirm
> `vm.loadavg` < ~4 and `gl.renderer` = Apple GPU before trusting the
> row. Optionally set the window on-screen+focused
> (`x/y`/`focus:true` in `tauri.conf.json`) for one control run to
> confirm off-screen cadence matched on-screen (throttle-vs-load check).
> Watch the 500-image resident-texture peak — the iPad memory ceiling
> is the real risk, and it is shell-independent.

## Run it yourself

```
cd spike/tauri-shell
npm install                       # standalone npm project (not a workspace member)
(cd ../.. && pnpm -r build)       # the harness imports the BUILT engine dist
EW_SPIKE_IMAGES=100 pnpm tauri dev   # auto-runs the suite, writes results/sweep-100.json
```

Env knobs (read by the Rust `sweep_config` command): `EW_SPIKE_IMAGES`
(default 100), `EW_SPIKE_AUTORUN` (`0` to disable headless auto-run and
drive the buttons by hand), `EW_SPIKE_RESULT` / `EW_SPIKE_RESULTS`
(result filename / dir). Rust toolchain was already present
(`cargo 1.90.0`); no rustup install was needed. Spike port **5200**
(distinct from 217's 5199); override with `SPIKE_PORT` and match
`devUrl` in `tauri.conf.json`.

Throwaway code per the house rule; this report is the product.
