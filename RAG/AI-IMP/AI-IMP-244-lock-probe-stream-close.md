---
node_id: AI-IMP-244
tags:
  - IMP-LIST
  - Implementation
  - ci
  - persistence
  - test-harness
kanban_status: in-progress
depends_on:
  - AI-IMP-226
parent_epic:
confidence_score: 0.95
date_created: 2026-07-09
---


# AI-IMP-244-lock-probe-stream-close

## Summary of Issue #1

Linux CI run 29060392548 failed AI-IMP-226's 16-process lock probe:
one child was reported as `worker produced "" (stderr: )`. The probe
read captured stdout on the child process's `exit` event. Node permits
that event before stdio pipes drain, so a valid final `WIN` or `LOCKED`
line can be lost under the contention burst. Done means the parent
reads the protocol only at `close`, after its captured streams close.

### Out of Scope

- The production single-writer lock protocol (the failing result was a
  test-harness observation race, not evidence of a second writer).
- The separate, non-main Windows workflow experiment and its fsync finding.

### Design/Approach

Keep the worker protocol and 16-process barrier unchanged. Replace the
parent's `exit` listener with `close`; retain stdout/stderr collection
and the existing strict `WIN`/`LOCKED` assertion. `close` is Node's
documented stream-drained lifecycle event, so it removes the false
empty-output verdict without weakening the single-winner probe.

### Files to Touch

`packages/persistence/src/lock-probe.spec.ts`: wait for child stdio
closure before evaluating its reported protocol line.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Parent consumes worker output on `close`, not `exit`, with the
      reason recorded beside the lifecycle callback.
- [x] Focused lock probe passes locally.
- [x] CI-equivalent build, non-desktop units, lint, and spike typecheck pass.
- [ ] Fable reviews and merges the candidate; CI confirms the Linux
      contention probe on GitHub Actions.

### Acceptance Criteria

**GIVEN** the 16-worker lock contention probe on Linux CI
**WHEN** a worker writes its final `WIN` or `LOCKED` outcome and exits
**THEN** the parent reads that line only after stdout/stderr close,
without a false empty-output failure.

### Issues Encountered

- The audit worktree needed `CI=true` for pnpm's no-TTY dependency
  guard and `npm ci --prefix spike --ignore-scripts` to reproduce the
  CI workflow's separate spike typecheck setup.
