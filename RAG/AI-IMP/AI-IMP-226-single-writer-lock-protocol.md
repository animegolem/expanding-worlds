---
node_id: AI-IMP-226
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - locking
  - P1
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-226-single-writer-lock-protocol

## Summary of Issue #1

Sol audit CA-001 (P1, lead-verified 2026-07-09 — RAG/CODE-AUDIT-
2026-07-09-CODEX-5-6.md): `ProjectLock.acquire` (lock.ts ~54-97)
reclaims a stale lock by rename-over + read-back verify. Rename is
atomic but NOT compare-and-swap ownership: every contender can
replace the path, and one can verify-and-return before a later
contender replaces it — Sol's 32-process probe produced 2-3 live
writers in 2 of 5 rounds AT PRODUCTION staleAfterMs. The AI-IMP-058
comment accepts this as "a vastly narrower window" — the probe
falsifies "narrow enough." Separately: reclaim only checks
heartbeat age + holder-not-dead, so a live writer whose JS event
loop stalls >30s (huge import, process suspension) is EVICTED while
its DB handle stays open. Done means single-writer holds under a
multi-process fault probe: an OS-backed exclusive primitive (or
equivalent single-winner protocol) replaces rename-verify, live
same-host PIDs are never evicted on heartbeat age alone, and the
probe joins the test suite.

### Out of Scope

- Cross-host locking semantics (same policy shape as today).
- The external .git/index.lock question (AI-IMP-218).
- Handle-close-on-failure (AI-IMP-227).

### Design/Approach

Single-winner options, builder picks and justifies: (a) `open` with
`O_EXCL` on a lock-OWNER file whose unlink is guarded by fd
identity; (b) `proper-lockfile`-style mkdir locking (mkdir is
atomic single-winner everywhere); (c) flock via an fs handle held
for the process lifetime (node's fs doesn't expose flock natively —
avoid new native deps; prefer (a)/(b)). Stale reclaim: takeover
requires BOTH heartbeat age exceeded AND holderIsDead(pid) — a
live same-host PID is never evicted (document the trade: a truly
hung-but-alive process now blocks until killed; that is the honest
single-writer behavior). Keep heartbeat for observability. Fault
tests: port Sol's synchronized N-process probe (spawn workers,
barrier, all acquire; assert exactly one winner across rounds at
staleAfterMs 0 and 30000); an eviction test asserting a live
holder survives a stale heartbeat.

### Files to Touch

`packages/persistence/src/lock.ts`, its spec + a new multi-process
probe test (child_process workers), callers only if the acquire
signature shifts.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Single-winner acquisition; probe (N≥16, ≥5 rounds, both
      staleAfterMs configs) asserts exactly one winner, in-suite.
- [x] Live same-host PID never evicted on heartbeat age; trade
      documented in code.
- [x] Existing lock tests green; stale-reclaim of a DEAD pid still
      works.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** N processes racing a stale lock
**THEN** exactly one ever holds a live lock — and a live writer
mid-stall is never evicted out from under its open database.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Mechanism chosen (mandatory justification).** Owner file created by
`O_EXCL` (`writeFileSync(..., { flag: 'wx' })`) as the sole ownership
arbiter — the kernel guarantees exactly one creator of an absent path,
so the uncontended acquire and every post-reclaim acquire are
single-winner by construction. No native dependency (option a/b of the
brief; flock rejected for needing a native binding). The bug was never
the create — it was the AI-IMP-058 reclaim that swapped a stale file in
by rename-over-then-verify, which is not compare-and-swap: N contenders
all overwrite, and one verifies before a later one overwrites, so
multiple returned live locks. Removing a stale owner file is likewise
NOT single-winner (a blind unlink can delete a fresh winner). So reclaim
is serialized behind an atomic `mkdir` guard directory
(`project.lock.reclaim`): exactly one contender may remove the owner
file at a time, and only after re-confirming under the guard that the
file is still a corpse — which cannot turn live under it, because
`O_EXCL` create is blocked while the corpse occupies the path and a
provably-dead holder emits no heartbeat. `mkdir` is the single-winner
primitive both for taking the guard and (via steal-then-remake) for
recovering a guard leaked by a reclaimer that crashed mid-swap. Reclaim
now requires the holder be provably gone: a dead same-host pid (any age,
AI-IMP-053 crash recovery preserved) OR a foreign-host stale heartbeat
(cross-host liveness unknowable — Phase 1 policy unchanged, out of
scope). A LIVE same-host pid is never evicted, even with a stale
heartbeat: a >staleAfterMs event-loop stall (huge import, SIGSTOP,
laptop suspend) would otherwise evict a writer whose SQLite handle is
still open. Documented trade in `isReclaimable`: a hung-but-alive holder
blocks new writers until killed — the honest cost of a real single
writer. `acquire()` stays synchronous with the same signature, so NO
caller changed (service.ts / project.ts untouched).

**Probe results.** New `src/lock-probe.spec.ts` spawns 16 child
processes (bundled worker importing dist) across 5 rounds at BOTH
`staleAfterMs` 0 and 30000, each round racing a pre-planted dead
same-host corpse behind a file barrier (all workers signal ready, parent
drops `go`), winner holds 400 ms so a fast release cannot hand off a
spurious second WIN. Every round asserts exactly one WIN. Result:
1 winner / 15 LOCKED in all 5 rounds at each config; stable across 6+
back-to-back runs. (For contrast, the pre-fix rename-verify produced 2-3
winners at staleAfterMs 30000 and 27-32 at 0.)

**Issues encountered / friction.**
1. First probe was flaky by its OWN barrier, not the lock: a
   wall-clock `startAt` let a slow-spawning straggler begin AFTER the
   winner released and legitimately acquire — a *sequential* second WIN.
   Replaced with a file barrier (readiness files + `go`) so the race is
   truly simultaneous; the lock was correct.
2. A real data-safety bug surfaced only at staleAfterMs 0 under max
   contention: a torn read of a live holder mid-`O_EXCL`-write returns
   null, and treating any unreadable owner file as reclaimable-and-
   unlinkable clobbered a live lock that was merely mid-write → two live
   writers. Fixed by distinguishing a torn write (microseconds, mtime
   ~now) from a genuinely corrupt crash leftover (durably unreadable):
   an unreadable file is only unlinked once it has stayed unreadable
   past `UNREADABLE_GRACE_MS` (1 s). Corrupt-file recovery preserved;
   torn-write clobber eliminated. Probe went green and stayed green.
3. Removed the AI-IMP-058 `renameHook`/`vi.mock('node:fs')` unit test —
   its interception point (rename-over of the owner file during reclaim)
   no longer exists. Replaced with a single-process test asserting a
   live same-host holder with an ancient heartbeat is NOT evicted
   (requirement 2), plus the multi-process probe as the real proof.
