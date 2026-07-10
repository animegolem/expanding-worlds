---
node_id: AI-IMP-240
tags:
  - IMP-LIST
  - Implementation
  - spike
  - v2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
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

- [ ] Harness scene renders inside Tauri v2 on macOS; sweep JSON
      captured.
- [ ] Textures through the asset protocol; findings recorded.
- [ ] IPC echo measured at two payload sizes.
- [ ] Report shipped with the port-seam list.
- [ ] Repo untouched outside spike/ + the report + this ticket.

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
