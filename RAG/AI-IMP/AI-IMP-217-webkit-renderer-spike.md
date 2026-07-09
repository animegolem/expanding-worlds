---
node_id: AI-IMP-217
tags:
  - IMP-LIST
  - Implementation
  - spike
  - v2
  - performance
kanban_status: in-progress
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-217-webkit-renderer-spike

## Summary of Issue #1

The V2 iPad sketch (DESIGN-QUEUE) hinges on one unvalidated
assumption: that the canvas renderer (PixiJS/WebGL + our
canvas-engine) performs acceptably on WebKit — the engine we have
never run (desktop is Chromium everywhere). Owner greenlit the
spike 2026-07-09 ("testing a Tauri build is pretty straightforward
for us to consider"), and the hardware window is real: the 2020
iPad Pro (the V2 perf floor, alph's future device) leaves in ~2
months. Key insight: Safari IS WKWebView's engine, so the risk is
testable with ZERO Apple tooling — a standalone browser harness
served on the LAN reaches desktop Safari, the owner's iPhone 17,
and the iPad. Done means a `spike/webkit-renderer/` harness
exists that mounts the REAL canvas-engine rendering path with
seeded realistic content and live metrics; it runs green in
desktop Safari with numbers recorded; and a spike report ships
with the harness's LAN how-to so the owner can run the two device
passes by hand.

### Out of Scope

- Tauri shell, persistence, IPC, the full app (the spike is the
  ENGINE path only — synthetic scene, no gateway).
- iOS-specific input (PencilKit etc.) — pointer/wheel/pinch only.
- Any change under apps/ or packages/ (read-only consumers; if an
  engine seam blocks browser mounting, STOP and report — do not
  patch the engine).

### Design/Approach

`spike/webkit-renderer/`: a small vite app importing the BUILT
`@ew/canvas-engine` dist. Mount a canvas with a synthetic board:
parameterized N images (default 100) at realistic texture sizes
(1024–2048px, generated locally — gradients/noise, no network),
plus decorations and labels to exercise the same render paths.
Wire pan/zoom exactly like host.ts does (wheel 1:1 pan, ctrl-wheel
pinch zoom, pointer drag) — copy the minimal handlers, don't
import the desktop host. Metrics overlay: rolling FPS, frame-time
p95, texture memory where the API allows, device pixel ratio.
Scripted stress mode: an automated 30s pan/zoom sweep producing a
copyable JSON summary (the feel-dial "copy values" idiom). Serve
via `vite --host` on a dedicated port (SPIKE_PORT convention).
MEASUREMENT DISCIPLINE (the EPIC-004 lesson): numbers only from
REAL browsers on real hardware — never headless; record device,
browser, and DPR beside every number. Report template: Chromium
(baseline, owner's Mac) vs desktop Safari (same hardware — the
engine delta) vs iPhone 17 vs iPad Pro 2020 (owner's hands, the
floor). Findings → RAG/spike-reports/webkit-renderer.md; code is
throwaway per house rule.

### Files to Touch

`spike/webkit-renderer/**` (new, self-contained),
`RAG/spike-reports/webkit-renderer.md` (report + device how-to),
this ticket.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Harness mounts the real canvas-engine render path with
      parameterized synthetic content and a metrics overlay.
- [x] Automated stress sweep emits a copyable JSON summary.
- [ ] Chromium + desktop Safari numbers recorded on the dev Mac
      (the engine delta isolated on identical hardware).
      <!-- Chromium DONE (real M1 Pro Metal, 100/300/500 images). Safari
      is PENDING-OWNER — real Safari cannot be script-driven without
      admin auth (safaridriver --enable / Apple-Events JS toggle); a
      60-second manual pass, steps in the report. Left unchecked. -->
- [ ] Spike report shipped with LAN serve instructions for the
      iPhone/iPad passes (owner's hands; HUMAN-TESTING entry).
      <!-- Report shipped with dead-simple LAN how-to. The device passes
      and the HUMAN-TESTING.md append are owner's hands (MUST-NOT-TOUCH
      other RAG docs); suggested line is in the report. Left unchecked. -->
- [x] Engine seams that blocked or complicated browser mounting
      documented (input to the Tauri port scoping).

### Acceptance Criteria

**GIVEN** the harness served on the LAN
**WHEN** the owner opens it in Safari on the iPad Pro 2020 and
runs the stress sweep
**THEN** he gets a JSON summary he can paste back — and the report
already states the Chromium-vs-Safari delta on the dev Mac so his
numbers land in context.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Two-Pixi-instance crash (the load-bearing finding).** Mounting the
  built engine dist outside the pnpm workspace, the engine resolved its
  bare `pixi.js` import to the repo's hoisted copy while the harness
  resolved its own — two `Container` classes. Pixi's event-system
  `isInteractive` mixin lands on only one prototype, so the first
  pointer move threw `e.isInteractive is not a function` in
  `EventBoundary.hitTestMoveRecursive` and the frame loop died (the
  canvas silently froze; the sweep recorded only ~3 ticker frames). Fix:
  vite `resolve.alias` + `dedupe` pinning `pixi.js` to one instance.
  Documented as Tauri-port seam #1 — the port MUST dedupe pixi.
- **Synchronous cull corrupts Pixi render groups.** Running
  `culler.apply` on every `camera.set()` during the sweep threw
  `Cannot read properties of undefined (reading 'updateRenderable')`.
  The desktop host debounces culls to one rAF (`scheduleCull`); the
  harness had to copy that. Documented as seam #3.
- **Backgrounded browser voids the run.** A headed Playwright Chrome not
  in the OS foreground throttles rAF to ~1 Hz — the sweep recorded a
  handful of frames with misleadingly small deltas. The driver
  (`drive.mjs`) disables background throttling and calls
  `bringToFront`; device passes carry the same warning ("keep Safari
  foregrounded").
- **Safari not script-driven (accepted, not a failure).** Real desktop
  Safari needs `safaridriver --enable` (admin auth) or the Apple-Events
  JS toggle — neither safe to flip unprompted. Per the brief, Safari
  cells are PENDING-OWNER with exact manual steps. Playwright's bundled
  WebKit was deliberately NOT used as a proxy: it is a different build
  and a headless/proxy number is exactly what EPIC-004 warns against.
- **Gates green:** `pnpm -r build` (repo), `vite build` (harness) both
  pass; the Chromium sweep produced valid JSON on real Apple M1 Pro
  Metal GPU (never SwiftShader — verified via the `gl.renderer` string).
- **Out of scope, untested on WebKit (flagged in report seam #6):**
  tiled backgrounds, icon atlas, image-body treatment, adaptive grid,
  gesture/selection chrome. The harness renders placements +
  decorations + labels only.
