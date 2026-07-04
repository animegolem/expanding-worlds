---
node_id: AI-EPIC-001
tags:
  - EPIC
  - AI
  - renderer
  - spike
date_created: 2026-07-03
date_completed:
kanban_status: planned
AI_IMP_spawned:
  - "[[AI-IMP-001-spike-harness-and-scenario]]"
  - "[[AI-IMP-002-pixijs-spike-implementation]]"
  - "[[AI-IMP-003-konva-spike-implementation]]"
  - "[[AI-IMP-004-renderer-decision-report]]"
---

# AI-EPIC-001-renderer-spike

## Problem Statement/Feature Scope

RFC-0001 open question 14 leaves the canvas renderer undecided between
PixiJS (preferred) and Konva. Every canvas feature in Phase 1 sits
behind this choice, so it is the single largest unresolved technical
risk. RFC §12.3 defines the comparison workload; nothing has been
built or measured yet.

## Proposed Solution(s)

Build one throwaway spike application with a shared scenario harness,
then implement the identical RFC §12.3 workload twice — once in PixiJS,
once in Konva. The workload covers a 20,000×12,000 tiled map, 300
image placements, 1,000 lightweight pins, marquee selection,
multi-object drag with snapping and smart guides, resize/rotate,
pan/zoom, placement labels at varying zoom, highlight mode, canvas
swap-and-return with memory release, background operations, the full
decoration set, and one-durable-command-per-gesture simulation.
Instrument both for frame time and memory, then write a decision
report that weighs results against implementation effort and closes
open question 14 as a rev 0.6 edit to RFC §13.

## Path(s) Not Taken

No other renderers (raw WebGL/WebGPU, Fabric.js, DOM/SVG) enter the
comparison; RFC §12.3 fixed the two candidates. The spike does not
share code with the production app and is not refactored into it —
findings transfer, code does not.

## Success Metrics

- Both implementations run the full §12.3 scenario list without crashes.
- Frame-time and memory numbers captured for every scenario on the
  development machine, tabulated side by side.
- A written decision closes RFC open question 14, committed as an RFC
  §13 amendment, within this epic.
- Spike code stays isolated under `spike/` and is deletable afterward.

## Requirements

### Functional Requirements

- [ ] FR-1: A harness generates deterministic synthetic fixtures: tiled oversized map, 300 images, 1,000 pins, decoration sets.
- [ ] FR-2: The harness records frame time (avg/p95) and JS heap per scenario and exports a comparison table.
- [ ] FR-3: A PixiJS implementation covers every §12.3 scenario.
- [ ] FR-4: A Konva implementation covers the same scenarios with identical fixtures.
- [ ] FR-5: A decision report compares results and implementation effort and recommends one renderer.
- [ ] FR-6: The RFC is amended to record the decision (open question 14 closed).

### Non-Functional Requirements

- Throwaway code: no imports from or into future `packages/`; plain
  Vite + TypeScript app under `spike/`.
- Scenarios must be reproducible: seeded generation, no network.
- Comparable rendering settings (antialias, resolution, DPR) across
  both implementations.

## Implementation Breakdown

- [[AI-IMP-001-spike-harness-and-scenario]] — harness, fixtures, metrics — planned
- [[AI-IMP-002-pixijs-spike-implementation]] — PixiJS scenario build — planned
- [[AI-IMP-003-konva-spike-implementation]] — Konva scenario build — planned
- [[AI-IMP-004-renderer-decision-report]] — comparison, decision, RFC amendment — planned
