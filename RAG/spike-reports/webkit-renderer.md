---
node_id: SPIKE-REPORT-003
tags:
  - spike
  - renderer
  - webkit
  - performance
  - tauri
date_created: 2026-07-09
related: "[[AI-IMP-217-webkit-renderer-spike]]"
---

# WebKit renderer spike: does the canvas engine hold up on Safari?

The V2 iPad sketch (DESIGN-QUEUE) hinges on one unvalidated
assumption — that the real `@ew/canvas-engine` render path
(PixiJS 8 + WebGL) performs acceptably on WebKit, the engine we have
never shipped on (desktop is Chromium everywhere). Because **Safari IS
WKWebView's engine**, the risk is testable with zero Apple tooling: a
standalone browser harness served on the LAN reaches desktop Safari,
the owner's iPhone 17, and the 2020 iPad Pro (the V2 perf floor,
alph's future device, leaving in ~2 months).

The harness (`spike/webkit-renderer/`) mounts the ENGINE path only —
`createScenePlanes` → `SceneSync` → `createDefaultRegistry` →
`TextureBudget` → `Culler` → `Camera`, driven by host-equivalent
pan/zoom input — against a synthetic board of N locally-generated
1024–2048px textures (gradient + value-noise, no network) plus
decorations and labels. A scripted 30 s sweep (serpentine pan → zoom
oscillation → diagonal residency-thrash) emits a copyable JSON summary
with device/browser/DPR/GL beside every number.

**Measurement discipline (EPIC-004):** numbers only from real browsers
on real hardware; every run records its GL renderer string so a
software-GL run can be refused. The Chromium runs below are on real
Apple M1 Pro Metal (`ANGLE Metal Renderer: Apple M1 Pro`), never
headless SwiftShader.

## Status

- **Chromium baseline (dev Mac): DONE.** Real GPU, three scene sizes.
- **Desktop Safari (dev Mac): PENDING-OWNER.** Real Safari cannot be
  script-driven without `safaridriver --enable` (admin auth) or the
  "Allow JavaScript from Apple Events" toggle — neither is safe to flip
  unprompted. It is a 60-second manual pass (steps below). This is the
  single most important missing number: it isolates the engine delta on
  identical hardware.
- **iPhone 17 / iPad Pro 2020: PENDING-OWNER** (LAN passes, steps below).

## Numbers

Dev Mac: **Apple M1 Pro**, macOS, built-in Retina display **DPR 2**,
10 logical cores, 32 GB. Browser: **Google Chrome** (real, headed —
`chromium.launch({ channel: 'chrome', headless: false })`), viewport
1440×900. GL: `ANGLE Metal Renderer: Apple M1 Pro`. The display is
120 Hz, so **8.3 ms mean = the vsync floor** and **120 fps = the cap**;
headroom shows up in p95/p99/max and the long-frame count, not in mean
fps.

| Device / Browser | DPR | Images (items) | mean fps | p50 ms | p95 ms | p99 ms | max ms | long frames (>33ms) | peak resident tex |
|---|---|---|---|---|---|---|---|---|---|
| M1 Pro / Chrome | 2 | 100 (115) | 120.0 | 8.3 | 9.8 | 10.2 | 17.8 | 0 | 0.95 GB |
| M1 Pro / Chrome | 2 | 300 (345) | 119.7 | 8.3 | 9.7 | 10.2 | 17.7 | 0 | 2.86 GB |
| M1 Pro / Chrome | 2 | 500 (575) | 114.5 | 8.3 | 10.1 | 17.5 | 50.9 | 12 | 4.72 GB |
| M1 Pro / **Safari** | 2 | 100 | — | — | — | — | — | — | — · **PENDING-OWNER** |
| M1 Pro / **Safari** | 2 | 500 | — | — | — | — | — | — | — · **PENDING-OWNER** |
| **iPhone 17 / Safari** | ~3 | 100 | — | — | — | — | — | — | — · **PENDING-OWNER** |
| **iPad Pro 2020 / Safari** | 2 | 100 | — | — | — | — | — | — | — · **PENDING-OWNER** |

Reading the Chromium baseline:

1. **At 100 images the M1 Pro is not stressed** — pinned to the 120 Hz
   vsync floor, p95 9.8 ms, zero long frames. This is the default
   scene and the realistic board size.
2. **The path bends around 500 images**: p99 jumps to 17.5 ms and 12
   frames exceed 33 ms, all during the diagonal residency-thrash phase
   (textures uploading as images cross the resident band). Still
   smooth, but the headroom is visibly gone on the strongest hardware
   in the test — a useful reference for what the iPad floor will show.
3. **Texture memory is the real watch item, not fps.** Peak *resident*
   (in-use, GPU) texture bytes reached **4.7 GB at 500 images** and
   2.9 GB at 300. `TextureBudget`'s 512 MB cap trims only the *idle*
   pool; resident textures near the viewport are uncapped by design.
   On a 6 GB 2020 iPad Pro this is the likeliest failure mode — a
   memory-pressure tab kill, not a frame-rate cliff. The synthetic
   board uses near-full-res 1024–2048px textures with no downscaled
   thumbnails; real boards with a thumbnail pyramid (deferred in the
   RFC) would resident far less. **Flag for the Tauri-port scope:
   validate resident-texture ceiling on the iPad before committing.**

The Chromium-vs-Safari delta on this Mac is the deliverable this report
cannot yet fill. Once the owner runs the two Safari cells above (same
hardware, same DPR 2), the delta is a direct read across the M1 Pro
rows.

## Run it yourself — dev Mac (Chromium, reproducible)

```
cd spike/webkit-renderer
npm install
pnpm -r build            # (repo root) — the harness imports the BUILT engine dist
npm run dev              # serves on http://localhost:5199 (and the LAN)
# then either open http://localhost:5199 and click "Run 30s sweep",
# or drive real Chrome and print the JSON:
node drive.mjs http://localhost:5199 [imageCount]
```

`drive.mjs` launches **real Google Chrome headed** (real GPU) with
background-throttling disabled and Retina DPR 2, runs the sweep, and
prints the JSON. Port **5199** is the documented spike port (override
with `SPIKE_PORT`).

## Run it yourself — desktop Safari (dev Mac, the engine delta) — PENDING-OWNER

1. With the dev server running (`npm run dev` in `spike/webkit-renderer`),
   open **`http://localhost:5199`** in Safari.
2. Leave the image count at 100. Click **Run 30s sweep** and don't
   switch tabs (a backgrounded tab throttles rAF and voids the run).
3. When it finishes, click **Copy JSON** (or long-press the text box →
   Select All → Copy) and paste it back.
4. Repeat with the image count set to **500** (type 500, click Rebuild
   scene, then Run). Paste both.

Check the `gl.renderer` line in the JSON — on real Safari it reads an
Apple GPU string (or a generic "Apple GPU"); if it ever says
SwiftShader/llvmpipe the number is void.

## Run it yourself — iPhone 17 & iPad Pro 2020 (LAN) — PENDING-OWNER

Dead simple, no cables:

1. On the dev Mac: `cd spike/webkit-renderer && npm run dev`. Vite
   prints two lines like:
   ```
   ➜  Network: http://192.168.0.15:5199/
   ```
   Use the **Network** URL (the one starting `192.168.` — today it was
   `http://192.168.0.15:5199/`; it can change between sessions, so read
   it fresh each time). Phone/iPad must be on the **same Wi-Fi**.
2. On the device, open that URL in **Safari**.
3. Tap **Run 30s sweep**. Keep Safari in the foreground the whole 30 s
   (don't lock the screen or switch apps — iOS throttles background
   tabs hard).
4. Tap **Copy JSON**, or long-press the box → Select All → Copy, and
   paste it back (Notes/Messages to yourself, then to the thread).
5. Optional heavier pass: set images to **500**, tap **Rebuild scene**,
   then **Run** again.

The JSON already carries `device.browser`, `device.dpr`,
`device.userAgent`, and `gl.renderer`, so a pasted result is
self-labelling — it lands next to the Chromium baseline with no
guessing about which device produced it.

## Engine seams that blocked or complicated browser mounting

This is the primary input to the Tauri-port scoping — every friction
point hit while mounting the real engine outside Electron/Chromium.

1. **Single-Pixi-instance is mandatory and silently fatal if violated
   (the big one).** The engine dist imports `pixi.js` as a *bare
   specifier*. A bundler that lets the engine resolve `pixi.js` from
   one place (the repo's pnpm-hoisted copy) while the app resolves it
   from another (the app's own `node_modules`) produces **two
   `Container` classes**. Pixi's event system installs its
   `isInteractive` hit-test method on only one prototype, so the first
   pointer move throws `e.isInteractive is not a function` deep in
   `EventBoundary.hitTestMoveRecursive`, the frame loop dies, and the
   canvas silently freezes. The fix in the harness is a vite
   `resolve.alias` + `dedupe` pinning `pixi.js` to one instance. **The
   Tauri port MUST dedupe pixi** (today the desktop app gets this for
   free from pnpm workspace hoisting; a fresh vite/Tauri app will not).
   Worth considering: have the engine treat `pixi.js` as a peer
   dependency and document the dedupe requirement, or re-export the
   Pixi surface the host needs so there is a single import path.

2. **The engine assumes a host-provided asset loader; there is no
   default.** `RendererResources.loadTexture(url)` and the
   `textures.acquire/release` budget hooks are injected by the host —
   the engine never fetches. The desktop host fetches `ew-asset://`
   over a custom Electron protocol. A browser/Tauri port must supply
   its own loader (the harness generates textures locally from the
   `ew-asset://<hash>` URL). Clean seam, but it means "mount the
   engine" always requires wiring a loader first — not a drop-in.

3. **Culling must be debounced to one pass per frame, not run on every
   camera write.** Toggling `object.renderable` synchronously on each
   `camera.set()` during a rapid pan/zoom storm corrupts Pixi 8's
   render-group state mid-frame (`Cannot read properties of undefined
   (reading 'updateRenderable')`). The desktop host already funnels
   culls through a rAF-debounced `scheduleCull`; the harness had to
   copy that exactly. Any new host embedding the `Culler` must
   replicate the debounce — it is load-bearing, not an optimization.

4. **DPR is read once at mount.** Following the host, the harness sets
   Pixi `resolution` from `devicePixelRatio` at init and never updates
   it. Fine for a fixed device; a note for the port that moving a
   window across monitors (or iPad Stage Manager scaling) keeps the
   old DPR until remount. Not a blocker for the iPad target.

5. **No engine seam blocked input.** Pan/zoom mount cleanly from the
   `Camera` API (`panByScreen`, `zoomAt`, `applyTo`) with plain DOM
   wheel/pointer listeners, exactly as the desktop host wires them —
   the engine does not require Pixi's own event system for camera
   input, so the harness leaves it at Pixi's defaults. (This is only
   safe once seam #1 is fixed; the crash there was Pixi events, not
   engine input.)

6. **Not exercised here (deliberately out of scope, flag for the
   port):** tiled backgrounds (`BackgroundSync`/`loadTileSource`), the
   icon atlas, image-body treatment (shadow/radius), the adaptive grid,
   and gesture/selection chrome. The harness renders placements +
   decorations + labels only. A full Tauri port must wire the
   background/atlas/treatment resources too; none looked structurally
   different from the loader seam, but they are untested on WebKit.

## Suggested HUMAN-TESTING line (owner to append)

> AI-IMP-217 — WebKit renderer spike: `cd spike/webkit-renderer && npm
> install && (cd ../.. && pnpm -r build) && npm run dev`. (a) Open
> `http://localhost:5199` in **desktop Safari**, run the 30 s sweep at
> 100 then 500 images, paste both JSONs. (b) Open the printed
> `Network:` LAN URL in Safari on the **iPhone 17** and the **2020 iPad
> Pro** (same Wi-Fi, keep Safari foregrounded), run the sweep, paste
> the JSON. Watch for judder and any tab reload (memory kill) on the
> iPad especially.
