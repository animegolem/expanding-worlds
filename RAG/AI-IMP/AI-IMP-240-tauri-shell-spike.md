---
node_id: AI-IMP-240
tags:
  - IMP-LIST
  - Implementation
  - spike
  - v2
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-240-tauri-shell-spike

## Summary of Issue #1

Owner greenlit (2026-07-09) the second V2 de-risk: desktop Safari
validates the ENGINE on WebKit (217), but three risks are only
testable inside an actual Tauri v2 shell — (1) the asset-loading
path (Tauri serves local files through a custom protocol; the
notorious pain point for image-heavy apps — our textures/blobs
must stream through it), (2) the IPC bridge shape (invoke/command
round-trip latency and payload limits vs Electron's
preload/utility split), (3) WKWebView as Tauri configures it
(which may differ from Safari defaults: JIT, memory limits,
gesture events). Done means `spike/tauri-shell/` hosts the 217
harness's scene in a minimal Tauri v2 app on macOS with textures
served through the asset protocol, the sweep runs, and the spike
report answers the three risks with numbers/facts plus the
seam list a real port would face. Throwaway code; findings
transfer.

### Out of Scope

- iOS build (needs Xcode signing — the macOS Tauri shell answers
  the engine-in-shell questions; iOS is the NEXT spike, owner
  hands).
- Persistence/IPC beyond a synthetic echo command.
- Modifying spike/webkit-renderer (COPY what you need — a sibling
  agent may be extending it).

### Design/Approach

`create-tauri-app` (vanilla-ts template) → copy the 217 harness
src → serve generated textures through Tauri's asset protocol
(convertFileSrc) rather than blob URLs where feasible, so the
real path is exercised; add one Rust `#[tauri::command]` echo and
measure round-trip at 1KB/1MB payloads. Run the 30s sweep in the
shell; record device/DPR/GL beside every number as always
(EPIC-004 discipline). Report → RAG/spike-reports/tauri-shell.md:
sweep table vs 217's Chromium/Safari columns, asset-protocol
findings (latency, caching, any size ceiling), IPC numbers, and
the port-seam list (what broke, what needed config — CSP,
protocol scope, dedupe per 217's two-Pixi lesson).

### Files to Touch

`spike/tauri-shell/**` (new, self-contained; Rust toolchain via
rustup if absent — document install steps),
`RAG/spike-reports/tauri-shell.md`, this ticket.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Harness scene renders inside Tauri v2 on macOS; sweep JSON
      captured. (100 & 500 images; `gl.renderer` = Apple GPU, DPR 2.)
- [x] Textures through the asset protocol; findings recorded.
      (`convertFileSrc` → `fetch`; raw read median 5 ms, no size ceiling
      to 128 MB.)
- [x] IPC echo measured at two payload sizes. (1 KB ≈ 1 ms, 1 MB ≈
      45 ms round-trip.)
- [x] Report shipped with the port-seam list.
      (`RAG/spike-reports/tauri-shell.md`, 10 seams.)
- [x] Repo untouched outside spike/ + the report + this ticket.

### Acceptance Criteria

**GIVEN** the spike report
**THEN** the V2 conversation can answer "what does the Tauri port
actually cost" from facts — engine numbers in-shell, the asset
path proven or convicted, IPC characterized.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Rust toolchain present** (`cargo 1.90.0`, aarch64-apple-darwin); no
  rustup install needed. `create-tauri-app` was not used — the shell was
  scaffolded by hand (vanilla-ts equivalent) to keep control of the pixi
  dedupe seam.
- **Build blocker (resolved), now seam #2:** first `cargo build` failed
  — enabling `assetProtocol` in `tauri.conf.json` requires the
  `protocol-asset` Cargo feature on the `tauri` crate; the allowlist
  mismatch aborts the build. Added the feature; green.
- **Default 2-minute background-command timeout killed the first run**
  mid-suite: first-pass texture painting (100 unique 1–2 K-px PNGs
  written via IPC) plus loadavg 69 exceeded 120 s. Reran with the 10-min
  cap; textures persist in the app cache so subsequent runs are fast.
- **⚠️ All timing numbers are `LOAD-SUPPRESSED`.** ~10 sibling agents
  were building/testing on the same M1 Pro during capture:
  `vm.loadavg ≈ 69` (100-img run) and `≈ 114` (500-img run) on 10 cores.
  fps/frame-time/IPC/scene-fetch are inflated; every report row is
  annotated and the lead must rerun decisive sweeps on a quiet box.
  Load-independent facts (resident-texture bytes: 0.948 GB @100 ≈ 217's
  0.95 GB; 4.39 GB @500 ≈ 217's 4.72 GB; protocol works; no size
  ceiling; IPC verified) are trustworthy.
- **Owner focus-steal constraint applied:** the Tauri window renders
  off-screen + unfocused (`x:4000, focus:false, visible:true` in
  `tauri.conf.json`). `visible:false` was avoided (WKWebView can pause
  hidden content). Cadence was real 60 Hz (not a 1 Hz throttle), but the
  stall tail could not be cleanly split from machine load — flagged for
  the quiet rerun (on-screen vs off-screen frame-count control).
- **CSP disabled (`"csp": null`) for the dev spike** (seam #6): a real
  port must author a CSP allowing the asset scheme in `img/connect-src`
  and `worker-src blob:` for Pixi's decode workers. Non-trivial; flagged,
  not solved.
- **Dev-mode only:** no `.app` bundle built (signing/entitlement wall
  not tested; ticket allows dev numbers). Render/asset/IPC hot paths are
  identical in a bundle.
