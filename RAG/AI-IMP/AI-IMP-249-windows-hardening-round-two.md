---
node_id: AI-IMP-249
tags:
  - IMP-LIST
  - Implementation
  - ci
  - platform
  - windows
kanban_status: planned
depends_on: [AI-IMP-242]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-10
---


# AI-IMP-249-windows-hardening-round-two

## Summary of Issue #1

Windows-leg run 29063091560 (after the fsync fix cleared all 11
export/import failures): three survivors, each needing real
Windows-semantics work — retries alone did not cure them.

1. **invariants.spec "persists command metadata across reopen" —
   rm EPERM despite maxRetries.** A handle is genuinely held at
   cleanup: the test reopens the service mid-test; audit whether
   the REOPENED handle (or the raw `reader` Db) escapes the
   afterEach close (a leak invisible on POSIX, blocking on
   Windows).
2. **project.test "releases the lock when opening fails after
   acquisition" — rm EPERM.** The 227 guard closes the Db on
   failure — verify the FAILED open's -wal/-shm sidecars and the
   fault-injection artifact release their handles on Windows;
   node:sqlite may hold mappings briefly after close.
3. **lock-probe "exactly one live winner at staleAfterMs 0" —
   round 2 produced ZERO winners** (not two — zero; single-writer
   held, liveness failed). Hypothesis to verify first: a leaked
   reclaim-guard dir from round 1 (its holder EPERM'd mid-swap on
   Windows) blocks round 2's reclaim for RECLAIM_GUARD_STALE_MS
   (10s) while contenders exhaust MAX_ACQUIRE_ATTEMPTS spinning
   without sleep → everyone reports LOCKED. Check: does the
   acquire retry loop sleep between attempts? Does guard
   steal-then-remake handle EPERM on rmdir? Also verify
   holderIsDead's kill(pid,0) semantics on Windows.

Done means the Windows leg (branch ci/windows-leg) runs green and
merges to main, closing AI-IMP-242's last item — with each
survivor either fixed at the cause or documented as a
deliberately-accepted platform difference (none of the three looks
acceptable as-is; the probe's zero-winner round is a real
availability bug on Windows).

### Out of Scope

- The fsync fix (shipped, v0.19.0).
- Smoke e2e expansion (after the units are green).

### Design/Approach

Iterate on the ci/windows-leg branch (pushes are cheap; main never
sees red). For 1/2: instrument the failing cleanups to print open
handles (or use `process.report`), find the leak, close it — then
KEEP the retry options as belt. For 3: reproduce the probe locally
if a Windows box/VM is available, else instrument the probe to
emit per-worker attempt/guard state on failure and read it from CI
logs; likely fixes are a small sleep+jitter in the acquire retry
loop and EPERM-tolerant guard steal. Suits Codex (long-run,
CI-iteration loop, well-defined endpoint) — AGENTS.md governs.

### Files to Touch

`packages/persistence/src/lock.ts` (retry pacing / guard-steal
hardening if convicted), the three spec files, possibly
`project.ts` sidecar handling; `.github/workflows/ci.yml` merge at
the end.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Both rm-EPERM leaks root-caused and closed (not
      retry-papered).
- [ ] Lock-probe zero-winner round diagnosed; acquire loop paced/
      hardened; probe green on Windows across ≥3 CI runs.
- [ ] Windows leg green end to end; workflow merged to main;
      AI-IMP-242 closed.
- [ ] macOS/Linux suites stay green (no platform regression).

### Acceptance Criteria

**GIVEN** the Windows CI leg on three consecutive runs
**THEN** units + the lock probe pass — the tester's platform has a
green tripwire, and a Windows user racing a stale lock always gets
exactly one winner, never zero.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
