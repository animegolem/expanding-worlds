---
node_id: AI-IMP-263
tags:
  - IMP-LIST
  - Implementation
  - ci
  - windows
  - lock
kanban_status: planned
depends_on: [AI-IMP-249]
parent_epic:
confidence_score: 0.5
date_created: 2026-07-10
date_completed:
---


# AI-IMP-263-lock-probe-zero-winner-main

## Summary of Issue #1

Since the Windows leg merged to main, all four main pushes have
failed the Windows job at the lock probe (runs 29092991723,
29093719134, 29094024841, 29094412192) — while the SAME lock.ts
was 3/3 green on the leg pre-merge. NEW failure signature, not the
round-3 ERR crash: in round 2, all 16 workers report an HONEST
`LOCKED` — lock file present at ~500–650ms age, guard absent
(ENOENT) — under BOTH staleAfterMs 0 and 30000; assertion
`expected 0 to be 1` winners (lock-probe.spec.ts:140). LEAD
HYPOTHESIS (unverified; the session's pre-implementation review
supersedes): a probe-orchestration race, not a protocol break —
round N's winner has not yet released/exited when round N+1's
workers sample, so its live same-host pid correctly refuses every
reclaim (staleAfterMs 0 still respects a live pid by design,
AI-IMP-226). Merged main runs a larger persistence suite before
the probe (the C10 batch + codec tests), shifting timing/load
enough to surface it. Counter-hypothesis to rule out: the winner's
release genuinely failing on Windows (unlink swallowed in
`ProjectLock.release`), stranding a live-pid lock. Done means: the
cause is convicted with probe diagnostics, fixed at the cause
(probe orchestration OR release path — never by weakening
reclaim), and the Windows job is green on main across 3
consecutive pushes.

### Out of Scope

- Any loosening of the reclaim policy (live same-host pids are
  NEVER evicted — the AI-IMP-226 invariant stands).
- The full-file lock.ts review (same session, separate
  deliverable — see the session brief).

### Design/Approach

Reproduce/diagnose from CI (the probe already dumps lock/guard
state on failure — extend if the winner's release outcome isn't
visible). Establish: does round N's winner exit before round N+1
opens, and is its release unlink succeeding on Windows? If
orchestration: make the probe's round boundary wait for the prior
winner's release/exit (deterministic join, not sleep). If release:
fix the release path honestly (surface the unlink failure,
retry-within-window like acquire). Iterate on a `ci/` branch; the
windows job runs on every branch push.

### Files to Touch

- `packages/persistence/src/lock-probe.spec.ts` (orchestration /
  diagnostics).
- `packages/persistence/src/lock.ts` ONLY if release is convicted.
- Nothing else.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Cause convicted with cited probe evidence (orchestration vs
      release), recorded here.
- [ ] Fix at the cause; reclaim policy untouched.
- [ ] Windows job green on the working branch, then 3 consecutive
      green main pushes after merge.
- [ ] macOS/Linux persistence suite stays green.

### Acceptance Criteria

**GIVEN** the merged main tree on the Windows runner
**WHEN** the 16-process probe runs its rounds under both staleness
configs
**THEN** every round admits exactly one live winner
**AND** a live same-host holder is still never evicted.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
