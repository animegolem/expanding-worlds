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
confidence_score: 0.95
date_created: 2026-07-10
date_completed:
---


# AI-IMP-263-lock-probe-zero-winner-main

## Summary of Issue #1

Two of the four initially cited post-merge Windows runs failed the
lock probe, not four. The corrected evidence table is normative:

| Run | Actual Windows failure |
| --- | --- |
| 29092991723 | Package units green (55 files / 600 tests); desktop `anchored-placement.test.ts` adoption guard failed on Windows path separators. |
| 29093719134 | Lock probe zero-winner: round 4, `staleAfterMs=0`, all 16 honestly `LOCKED`. |
| 29094024841 | No probe failure; `invariants.spec.ts` and `queries-structure.test.ts` setup hooks timed out at 10s. |
| 29094412192 | Lock probe zero-winner: round 2 in dist at `staleAfterMs=0` and source at `30000`; all 16 honestly `LOCKED`. |

The genuine signature is a lock present at ~500–760ms age with no
guard, under either staleness configuration. The same lock/probe/
worker files were 3/3 green on pre-merge leg runs 29085480598,
29088182117, and 29090452643.

## Pre-implementation review correction (2026-07-10)

The lead's prior-winner orchestration hypothesis is contradicted by
the current probe. `runWorker` resolves only on child `close`, the
winner calls `release()` before `process.exit()`, and `runRound`
awaits all 16 outcomes before returning (`lock-probe.spec.ts:75-118`,
`lock-probe-worker.mjs:35-40`). A new round also synchronously
overwrites `project.lock` with its planted corpse before spawning the
race (`lock-probe.spec.ts:59-70,103-108`), so a prior winner's file
cannot directly explain the next round.

The diagnostic target from pre-implementation review was fixture PID
reuse. Each staleness test created one dead same-host PID and reused it
across all five rounds while each round started 16 new processes
(`lock-probe.spec.ts:22-23,129-133` at the diagnostic commit). Windows
could recycle that PID into another runner process, at which point every
contender correctly refused the apparently-live same-host
`probe-corpse`. The original diagnostic omitted holder token/PID, so the
first round added that evidence before any behavior change; the result
below convicted this target.

`ProjectLock.release` swallowing unlink failures is a separately
convicted full-file-review defect (`lock.ts:206-216`), but it is not
yet the probe diagnosis. Done means the probe evidence convicts the
surviving holder, the fix lands at that cause without weakening
reclaim, and the Windows job is green on main across 3 consecutive
pushes.

## Convicted cause (Windows run 29105643600)

The diagnostic run convicted fixture PID reuse and exonerated the lock
protocol. In round 0 at `staleAfterMs=0`, worker 8244 won and reported
`postReleaseLock=unavailable(ENOENT)`, proving release removed its lock.
In round 1, all 16 workers reported the still-planted
`token=probe-corpse`, `holderPid=3568`, at ~724-791ms with no guard.
PID 3568 matched none of those workers: another runner process had
recycled the fixture's once-dead PID. Every contender then correctly
refused a genuinely live same-host PID as AI-IMP-226 requires.

The fixture now obtains and verifies a fresh exited-child PID for every
round. Because Windows can recycle even that PID between verification
and acquisition, a zero-winner round rechecks it. The round is replanted
and retried once only when the planted `probe-corpse` lock survived and
its PID is no longer provably dead. A random surviving token, a corpse
still returning `ESRCH`, any split-winner result, or a second zero-winner
fails loudly with attempt history. An impossible PID was rejected because
it would stop exercising the real provably-dead same-host path.

### Out of Scope

- Any loosening of the reclaim policy (live same-host pids are
  NEVER evicted — the AI-IMP-226 invariant stands).
- The full-file lock.ts review (same session, separate
  deliverable — see the session brief).

### Design/Approach

Diagnostics report worker PID plus holder PID/token on every `LOCKED`
outcome, post-release lock/guard state on every `WIN`, and prior-round
history on failure. Run 29105643600 convicted the planted corpse rather
than release. Use a freshly verified exited-child PID per round and the
single invalid-round retry described above. No reclaim-policy change is
permitted.

### Files to Touch

- `packages/persistence/src/lock-probe.spec.ts` (orchestration /
  diagnostics).
- `packages/persistence/test-fixtures/lock-probe-worker.mjs`
  (holder/release diagnostics).
- `RAG/AI-IMP/AI-IMP-263-lock-probe-zero-winner-main.md`
  (evidence and convicted cause).
- `packages/persistence/src/lock.ts` ONLY if release is convicted.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Diagnostic branch reports planted holder identity, worker
      identities, and prior winner post-release state on Windows.
- [x] Cause convicted with cited probe evidence (fixture vs release),
      recorded here.
- [x] Fix at the cause; reclaim policy untouched.
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

The lead's initial orchestration diagnosis and four-identical-failures
premise were both corrected during pre-implementation review. The first
diagnostic Windows run then showed the fixture's reused corpse PID had
become live in an unrelated runner process; release was clean. The lead
withdrew an impossible-PID suggestion because it would evade the path the
probe exists to test. Round 2 instead uses a fresh real exited PID per
round plus one bounded retry when post-round evidence proves the fixture
became invalid. Local pnpm initially hit its documented no-TTY modules
purge guard after rebase; validation was rerun with `CI=true`.
