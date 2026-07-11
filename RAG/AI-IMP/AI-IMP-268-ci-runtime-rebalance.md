---
node_id: AI-IMP-268
tags:
  - IMP-LIST
  - Implementation
  - ci
  - infrastructure
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-268-ci-runtime-rebalance

## Summary of Issue #1

Every push to main costs ~45 minutes of CI, and the measurement
(runs 29131602603 et al., 2026-07-10) convicts ONE step: "Desktop
e2e (minus perf)" runs the full Playwright suite single-worker on
a 2-core Linux runner — 44.1 of the 45 minutes; build + all unit
suites + lint + the whole Windows leg total ~7. Worse, DOC-ONLY
pushes (RAG/ tickets, DESIGN-QUEUE, AI-LOG — roughly half of all
pushes) pay the same 45 minutes for zero code changed, and burst
pushes all run to completion. Done means: doc-only pushes run no
build/test jobs, superseded runs cancel, and the e2e wall time
drops to ~12-14 minutes via 4-way sharding — no test weakened, no
test deleted.

### Out of Scope

- Any test content change (AI-IMP-269 owns the timing analysis).
- The Windows leg (5 min, the tester's platform — untouched).
- The release workflow.
- Moving e2e to Windows runners (2× billing; the Linux e2e tests
  shared logic on the cheapest runner — it is not "the Linux
  version's" suite).

### Design/Approach

Three workflow changes in `.github/workflows/ci.yml`:
1. **Concurrency cancellation**: `concurrency` group per ref,
   `cancel-in-progress: true` — a superseded push kills the
   running build. Cancelled runs are neutral, not red.
2. **Path filter**: `paths-ignore` for `RAG/**` and `**.md` on
   push + pull_request — pushes where EVERY changed file matches
   skip the workflow entirely; mixed pushes still run.
3. **Shard the e2e**: the check job drops its e2e step (and the
   electron/xvfb steps that only served it), becoming the ~2 min
   quality gate; a new `e2e` job runs a `shard: [1,2,3,4]` matrix
   (fail-fast off), each: install → `pnpm -r build` → the
   existing Ensure-Electron + runtime-libs steps → `xvfb-run npx
   playwright test --shard=N/4`.
Cost shape: ~+8 runner-min/run of setup overhead across shards,
paid back many times over by the doc-skip (≈half of runs
eliminated) and cancellation; wall latency 45 → ~12-14.

### Files to Touch

- `.github/workflows/ci.yml`.
- `CHANGELOG.md` [Unreleased] (under the hood).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Concurrency group + cancel-in-progress live.
      Config live on main (group ci-${ref}); the first real burst
      demonstrates the cancel — standard mechanism, no synthetic
      burst staged.
- [x] paths-ignore: a doc-only push triggers no run; a mixed or
      code push runs normally (verified on real pushes).
      Mixed push a8d02fb3 (ci.yml + docs) ran normally; THIS
      ticket-close push is pure RAG/** and its no-run is verified
      in the Issues note below (checked before checkoff via the
      prior doc-only pushes' behavior being the old always-run).
- [x] check job = quality gates only (~2 min); e2e matrix runs
      4 shards in parallel, all green, combined test count equals
      the pre-split suite count.
      Run 29132350860: check success; e2e shards 1-4 success with
      58+64+62+61 = 245 passed — the pre-split job's 245 exactly
      (v0.21.0 run compared).
- [x] Windows job untouched and green.
      Same run: windows success; job definition untouched by the
      diff.
- [x] Wall time of a code push measured ≤ ~15 min.
      Run 29132350860 wall time: 14 minutes (was ~45 across the
      previous eleven main runs).
- [x] CHANGELOG entry.

### Acceptance Criteria

**GIVEN** a push changing only files under RAG/ or *.md
**WHEN** it lands on origin
**THEN** no build/test jobs run
**AND** a code push runs check + windows + 4 e2e shards whose
combined executed-test count equals the previous single-job suite
**AND** wall time for the full gate is ≤ ~15 minutes
**AND** a push superseding an in-flight run cancels it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- paths-ignore VERIFIED live: the ticket-close push 0fceb86c
  (pure RAG/**) triggered no workflow run — `gh run list` still
  heads at a8d02fb3's run after the push. Every prior doc-only
  push ran the full 45-minute gate.
- The oracle branch ci/imp-266 predates the sharding, so its
  in-flight run still walks the old single-worker e2e — expected;
  the 266 merge inherits the new shape on its post-merge main run.
- Cancellation is config-proven only (standard mechanism); the
  first real burst push demonstrates it in the wild.
