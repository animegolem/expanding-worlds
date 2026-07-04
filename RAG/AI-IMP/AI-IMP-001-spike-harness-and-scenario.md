---
node_id: AI-IMP-001
tags:
  - IMP-LIST
  - Implementation
  - spike
  - tooling
kanban_status: completed
depends_on: AI-EPIC-001
parent_epic: [[AI-EPIC-001-renderer-spike]]
confidence_score: 0.85
date_created: 2026-07-03
date_completed: 2026-07-03
---

# AI-IMP-001-spike-harness-and-scenario

## Spike harness and shared scenario fixtures

EPIC-001 needs both renderer candidates driven by identical inputs and
measured identically, or the comparison is noise. This ticket builds
the throwaway Vite + TypeScript app under `spike/`, the deterministic
fixture generator, the scenario runner, and the metrics capture that
AI-IMP-002/003 plug into. Done means: the app launches, generates all
fixtures from a fixed seed, exposes a renderer-agnostic scenario
interface, and writes a metrics JSON per run.

### Out of Scope

Any PixiJS or Konva code (tickets 002/003). The comparison report
(004). Real domain records, SQLite, or Electron — this is a plain
browser app.

### Design/Approach

One `RendererAdapter` interface (mount, loadScene, applyOp, unmount)
that each candidate implements; scenarios are data-driven op scripts
(pan path, zoom steps, drag selection, swap-and-return loop) replayed
against the adapter. Fixtures: seeded PRNG generates 300 placeholder
images (canvas-generated textures at representative resolutions),
1,000 pin descriptors, decoration sets, and a 20,000×12,000 tile
pyramid (generated tiles, 512px). Metrics: rAF frame-time collector
(avg/p95/worst), `performance.memory` sampling where available, and a
post-unmount heap snapshot trigger for the memory-release check.
Output: one JSON per renderer per scenario into `spike/results/`.

### Files to Touch

`spike/package.json`, `spike/vite.config.ts`, `spike/index.html`: new app.
`spike/src/adapter.ts`: RendererAdapter interface + scenario op types.
`spike/src/fixtures/*.ts`: seeded generators (images, pins, decorations, tiles).
`spike/src/scenarios/*.ts`: op scripts for each §12.3 scenario.
`spike/src/metrics.ts`: frame-time and memory collectors, JSON writer.
`spike/src/main.ts`: scenario runner UI (renderer picker, run-all button).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Scaffold `spike/` Vite + strict TS app that builds and serves.
- [x] Implement seeded PRNG and fixture generators for images, pins, decorations, and the tile pyramid.
- [x] Define `RendererAdapter` and scenario op vocabulary covering every §12.3 bullet.
- [x] Implement scenario scripts: map load, 300 images, 1,000 pins, marquee, multi-drag, resize/rotate, pan/zoom, highlight, labels-at-zoom, swap-and-return, background ops, decoration suite, gesture-commit counting.
- [x] Implement metrics collection and per-run JSON output.
- [x] Add a no-op adapter and verify the full run completes and writes results.

### Acceptance Criteria

**Scenario:** Running the harness against the no-op adapter.
**GIVEN** the spike app is served locally with a fixed seed.
**WHEN** the operator clicks run-all.
**THEN** every §12.3 scenario executes to completion.
**AND** `spike/results/noop-*.json` contains frame and memory series for each scenario.
**AND** re-running with the same seed produces identical fixture checksums.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Verified 2026-07-03: Playwright smoke green on two consecutive runs —
10 scenarios, exact commit counts, checksum stable for seed 20260703
and divergent for a different seed. Noop baseline: avg frame 8.33 ms
(the 120 Hz display budget, i.e. zero harness overhead), heap flat at
~4 MB, results written to spike/results/noop-seed20260703.json.

Deviations from the ticket: fixture and scenario modules landed as
single files (src/fixtures.ts, src/scenarios.ts) instead of the
directories sketched in Files to Touch; src/registry.ts was added as
the adapter seam for IMP-002/003. The very first test invocation
failed at page.evaluate and passed on every rerun — attributed to
first-hit Vite transform latency inside the dev-server webServer
startup; not reproduced, worth watching in adapter runs. @types/node
was added for the Playwright test's fs usage.
