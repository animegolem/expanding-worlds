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

CAUSES CONFIRMED by Codex source review (2026-07-10, supersedes
the lead's initial hypotheses — two corrected with citations):

1. **Definite test-handle leak** — invariants.spec.ts:571 opens a
   SECOND Db mid-test to query command_log and never closes it;
   Windows correctly refuses the fixture rm. Fix: close the
   temporary reader explicitly.
2. **Definite construction-path leak in PRODUCT code** —
   `Db.open` (db.ts:28) creates `DatabaseSync`, then the initial
   pragmas can throw BEFORE the wrapper exists; the raw connection
   stays open (surfaced by the invalid-database test). Fix:
   Db.open gets its own try/catch closing the raw handle before
   rethrowing. (Also retires the 227 agent's flagged db.ts
   close-idempotency debt — same family.)
3. **Lock liveness defect, corrected diagnosis** — the acquire
   loop ALREADY has 1-6ms jitter (lead's "unpaced" claim wrong);
   the real flaw is `reclaimUnderGuard()` catching a failed
   `unlinkSync` yet RETURNING SUCCESS — callers burn the
   200-attempt budget with no progress signal; failed guard
   removal is likewise suppressed, and a leaked guard's 10s
   staleness window far exceeds the budget. Fix: model reclaim
   outcomes honestly (failed unlink = retryable, never "cleared");
   retry long enough to outlive a leaked-guard stale window;
   diagnostics that dump lock/guard state on probe failure.
   EXPLICITLY REJECTED: swallowing EPERM or shortening the stale
   interval — no weakening of the protocol.
4. **Stale-guard liveness regression test** joins the suite; done
   requires THREE consecutive green Windows-leg runs.

The Windows runner's duplicate src/dist failures are the same two
cleanup roots, not extra defects.

**ROUND 3 (gate run 29070089859, post-merge — 1 failure, gate
reset):** a probe worker CRASHED (ERR, not LOCKED):
`EPERM: operation not permitted, open 'project.lock'` thrown by
`writeFileSync(path, …, { flag: 'wx' })` — the O_EXCL create
itself. LEAD HYPOTHESIS (unverified; the pre-implementation
review verifies before fixing): Windows DELETE_PENDING semantics —
while another process is mid-unlink of the same path, a create
reports EPERM/EACCES rather than EEXIST; acquire tolerates only
EEXIST at that site, so the worker dies instead of retrying.
Candidate fix if confirmed: treat EPERM/EBUSY on the O_EXCL create
as "path contended, retry within the window" — this does NOT
weaken single-winner (the create did not succeed; same disposition
as EEXIST). Note the failing config was staleAfterMs=30000, so it
is not stale-reclaim-specific; the unlink in play is likely the
winner's RELEASE. Verify against libuv semantics and the probe's
new diagnostics.

**ROUND 4 (gate run 29082725843, P2 fix aboard):** units + lock
probe GREEN — the P2 honest-diagnosis fix held. The failure moved
to the smoke e2e: all 7 shell specs died at `electron.launch` with
"Electron failed to install correctly" (missing dist/path.txt).
This was the FIRST execution of the smoke step on Windows (every
prior round failed at units, so the step never ran). CAUSE, with
in-repo precedent: the pnpm electron-postinstall husk is NOT
macOS-specific — the Linux job already treats the same disease
with its "Ensure Electron binary" workflow step (install.js
"succeeds" extracting one entry; the step fetches the zip then
extracts it itself and writes path.txt). The Windows job simply
lacks the equivalent step, and the playwright globalSetup repair
deliberately skips non-darwin. FIX: mirror the Linux step for
win32 (pwsh: install.js fetch → Expand-Archive →
`printf`-style no-newline path.txt = electron.exe → assert
electron.exe exists). Unverified assumption for the run to prove:
install.js leaves the zip in `%LOCALAPPDATA%/electron/Cache` as it
does under `~/.cache/electron` on Linux. repair-electron.sh's
"macOS-only" scope note is now known-stale for CI (workflow steps
own the CI repair; the script stays the local-dev path).

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
