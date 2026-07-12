---
node_id: AI-IMP-264
tags:
  - IMP-LIST
  - Implementation
  - lock
  - reliability
  - windows
kanban_status: completed
depends_on: [AI-IMP-263]
parent_epic:
confidence_score: 0.85
date_created: 2026-07-10
date_completed: 2026-07-12
---


# AI-IMP-264-lock-protocol-composite-hardening

## Summary of Issue #1

The standing post-AI-IMP-249 full-file review found four repair-round
interactions in `packages/persistence/src/lock.ts`. Two can weaken the
single-writer safety proof: `readHolder()` collapses I/O denial into the
same `null` as invalid content, which the unreadable-file path may unlink;
and `guardIsStale()` treats every `statSync` error as permission to steal a
possibly-live reclaim guard. Two more can strand or misdiagnose a project:
`release()` swallows persistent unlink failures after making itself
non-retryable, while guard-removal errors are discarded despite the
acquire path's honest-transient contract. Several comments still describe
pre-round-4 boolean/dead-path behavior.

This ticket hardens those seams only after AI-IMP-263 convicts and fixes the
probe fixture. Each behavior change requires a failure-injection regression
that proves both the error disposition and the no-unlink/no-split-brain
property. Live same-host holders remain non-reclaimable at every age.

### Out of Scope

- AI-IMP-263's probe-fixture identity and Windows three-green gate.
- Weakening or shortening the live-same-host, stale-guard, or heartbeat
  safety policies.
- Foreign-host/shared-filesystem semantics.
- Changing the heartbeat failure posture without a separate ruling.

### Design/Approach

Replace `readHolder()`'s nullable result with an internal discriminated
outcome: holder, absent, invalid content, or I/O error. Only absent paths
re-race creation; only content proven invalid and old enough enters corrupt
reclaim; transient I/O errors retry and persistent ones surface unchanged.
Validate every `LockHolder` field before applying PID/heartbeat policy.

Make guard stat/removal dispositions equally explicit. `ENOENT` means the
guard vanished; EPERM/EBUSY are retryable and preserved; an unknown stat
failure surfaces. Never infer "stale" from inability to inspect metadata.

Make release idempotent by outcome rather than suppression: ENOENT is
success, retryable removal errors receive bounded retries, persistent errors
surface, and a failed release remains retryable without restarting its
heartbeat. Preserve token verification before every unlink attempt.

Finally align comments/types with the current outcome-object implementation
and reachable timeout fallbacks. Keep each remediation reviewable with its
own injected-failure regression; do not combine this ticket with 263's
fixture fix.

### Files to Touch

- `packages/persistence/src/lock.ts`: explicit read/stat/remove/release
  outcomes and truthful comments.
- `packages/persistence/src/lock.test.ts`: fault-injection regressions for
  every convicted path and the live-holder fence.
- `RAG/AI-IMP/AI-IMP-264-lock-protocol-composite-hardening.md`: evidence,
  validation, and honest deviations.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Wait for AI-IMP-263's diagnostic run to convict and fix the probe
      fixture; rebase onto its merged main commit.
- [x] P1: inject a persistent `readFileSync` denial against an old live
      same-host lock; prove acquire surfaces the original error and never
      calls `unlinkSync`.
- [x] P1: validate parseable holder shape; prove invalid stable content is
      handled as corruption while a valid live holder is never evicted.
- [x] P1 candidate: inject guard `statSync` failure and a removable live
      guard; prove the current double-reclaimer path, then fix so no removal
      occurs without a confirmed stale timestamp.
- [x] P2: inject transient and persistent release-unlink failures; prove
      transient recovery, persistent surfacing, token safety, and a valid
      retry of the same lock object's release.
- [x] P2: inject persistent guard-rmdir failure; preserve and surface the
      filesystem error rather than fabricating `ProjectLockedError`.
- [x] P4: update reclaim outcome, release, unreadable-state, and timeout
      fallback comments to match executable behavior; remove dead wording.
- [x] `pnpm -r build` and `pnpm --filter='./packages/*' test` green; Windows
      lock probe and desktop smoke remain green.

### Acceptance Criteria

**GIVEN** a live same-host lock whose owner record cannot be read
**WHEN** acquisition retries exhaust
**THEN** the original filesystem error surfaces
**AND** the live owner file is never unlinked.

**GIVEN** a reclaim guard whose metadata cannot be inspected
**WHEN** another process attempts stale takeover
**THEN** it does not remove the guard or enter the reclaim critical section.

**GIVEN** the owning process releases through transient or persistent
Windows removal failures
**WHEN** bounded release handling completes
**THEN** transient failure converges to an absent lock
**AND** persistent failure is surfaced and remains retryable
**AND** a different holder token is never removed.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Ticket was cut from the accepted AI-IMP-263 standing full-file review and
implemented only after 263 convicted and repaired the probe fixture. The work
re-verified every finding against post-263 main. Holder reads
now distinguish absence, invalid content, valid holders, and filesystem
failure at acquire, heartbeat, reclaim, and release. Guard age and removal
likewise preserve filesystem dispositions. Release remains live and retryable
until token-verified removal succeeds. The focused fault suite is green at
20/20, including heartbeat read-denial surfacing and a fresh-winner race pin.
The first local 16-process probe passed 20/20 consecutive invocations
(200 rounds across both staleness policies), and `CI=true pnpm check` passed:
60 domain, 19 commands, 1 shared-ui, 1 protocol, 407 canvas-engine, 655
persistence, and 486 desktop unit tests, plus lint and spike typecheck. The
final 258-case desktop e2e run was green with 257 first-pass successes and one
unrelated `import.spec.ts` context-menu timeout that passed on configured retry;
the immediately preceding full run was 258/258 first-pass green.

The first Linux oracle then exposed a two-winner round. Timestamp
instrumentation reproduced overlapping ownership locally and convicted a
regression in the discriminated reclaim read: `absent` accidentally fell
through to `unlinkSync`, allowing a fresh O_EXCL winner created after that read
to be removed. Guarded absence now returns "already clear" without unlinking.
The deterministic regression installs a live replacement while the guarded
read reports ENOENT and proves zero unlink calls plus token preservation.
After that repair, the instrumented probe passed 20/20 consecutive invocations
and the exact-tip full gate passed, including 258/258 desktop e2e first try.
