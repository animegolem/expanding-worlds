---
node_id: LOG-2026-07-03-renderer-spike
tags:
  - AI-log
  - development-summary
  - renderer-spike
  - delegation
closed_tickets: [AI-IMP-001, AI-IMP-002, AI-IMP-003, AI-IMP-004, AI-EPIC-001]
created_date: 2026-07-03
related_files:
  - spike/src/adapter.ts
  - spike/src/adapters/pixi/index.ts
  - spike/src/adapters/konva/index.ts
  - RAG/spike-reports/renderer-comparison.md
  - RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md
confidence_score: 0.95
---

# 2026-07-03-LOG-AI-renderer-spike-epic

## Work Completed

Executed AI-EPIC-001 end to end in one session, closing RFC-0001 open
question 14 with a decision for PixiJS 8. The lead built AI-IMP-001
directly: a throwaway Vite/TS spike app with a renderer-agnostic
RendererAdapter contract, seeded deterministic fixtures (tile pyramid,
300 images, 1,000 pins, decorations), ten scenario scripts covering
every RFC §12.3 bullet, frame/heap metrics with gesture-commit
assertions, a noop baseline adapter, and a Playwright smoke test.
AI-IMP-002 (PixiJS) and AI-IMP-003 (Konva) were delegated to two
parallel worktree agents working from identical normative op-semantics
briefs; both returned green, ticket-complete branches that passed
review (correct zoom-anchor math, lock handling, destroy paths, no
fenced-file violations) and merged with only the two expected
one-line conflicts. AI-IMP-004: review caught that headless Chromium
biases WebGL to SwiftShader, so both suites were re-run headed on real
GPU; decision written to RAG/spike-reports/renderer-comparison.md and
the RFC amended to rev 0.6. This session also validated the
delegation working model (worktree agents + lead review).

## Session Commits

- 1fabf71 AI-IMP-001 harness, fixtures, scenarios, metrics, noop baseline
- 15d61fe SPIKE_PORT env isolation for parallel worktree test runs
- b86895b (agent) AI-IMP-002 PixiJS adapter; merged 6e30eb7 after review
- 8f3401c (agent) AI-IMP-003 Konva adapter; merged a6ae543 after review,
  resolving registry/package.json overlap; worktree dirs unstaged and
  gitignored in the amended merge
- Final commit (this one): comparison report + data, RFC rev 0.6,
  ticket/epic closure, INDEX regeneration, this log

## Issues Encountered

- Headless Chromium runs WebGL on SwiftShader: PixiJS averaged
  12–25 ms headless but sits at the 8.33 ms vsync floor (p95 ≤ 9.3)
  on real GPU. Headless numbers alone would have inverted the
  decision — measurement environment is now a standing review check
  for benchmarks.
- Konva's Transformer semantics (group bbox about common anchor)
  could not express the spec's per-item transforms; its expected
  interaction savings largely evaporated. Its hit-graph double-paint
  showed p95 16.7 ms at 2,000 nodes even on GPU.
- PixiJS texture caching: global Texture.from cache can resurrect
  destroyed textures across scene swaps; the adapter bypasses it —
  carried forward as an EPIC-004 rule.
- First-ever Playwright invocation failed at page.evaluate (first-hit
  Vite transform latency suspected); never reproduced across many
  later runs.
- git add -A briefly staged the agent worktrees as embedded repos;
  fixed by unstaging and gitignoring .claude/worktrees/.

## Tests Added

- spike/tests/smoke.spec.ts — harness integrity on the noop adapter:
  all 10 scenarios complete, gesture-commit counts exact, fixture
  checksum stable for the fixed seed and divergent otherwise.
- spike/tests/pixi.spec.ts and spike/tests/konva.spec.ts (agents) —
  same assertions against each real adapter; all three pass together
  on merged master (3/3, ~38 s).

## Next Steps

EPIC-002 (workspace scaffolding) is now the front of the critical
path and can be worked immediately; EPIC-003 (domain/persistence
core) follows. Carry-forwards for EPIC-004 are recorded in RFC §12.3
and the comparison report (texture preload on canvas swap, BitmapText
or LOD for labels, explicit texture ownership, hardware-acceleration
minimum requirement). Read before continuing: RAG/INDEX.md,
RAG/spike-reports/renderer-comparison.md, and the epic files for 002
and 003. The delegation model (fenced worktree agents + lead review)
worked well and the user wants it documented in a root CLAUDE.md —
good first task for the next session.
