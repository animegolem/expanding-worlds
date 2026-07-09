---
node_id: AI-IMP-227
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - P1
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-227-service-construction-guard

## Summary of Issue #1

Sol audit CA-002 (P1, lead-verified): `openProjectService`
(service.ts ~127-185) acquires the writable handle (lock +
heartbeat already ticking), then runs recovery, handler/query
registration, and thumbnail enqueue with NO construction guard —
a throw anywhere leaves the handle open and the heartbeat
REFRESHING THE LOCK FOREVER; Sol's probe showed the retry failing
ProjectLockedError against the wedged first attempt's own PID.
The lower create/open paths also release the lock without
consistently closing an already-open Db on late failure. Done
means every construction-failure path closes the handle (db +
lock + timer) before rethrowing, the lower paths close Db on all
exceptional branches, and fault tests cover recovery-throw,
migration-throw, and derivative-enqueue-throw each ending with
the project reopenable.

### Out of Scope

- The lock protocol itself (AI-IMP-226).
- Recovery semantics (§11.4, correct).

### Design/Approach

Wrap everything after handle acquisition in try/catch →
`handle.close()` (verify close is idempotent and closes db then
releases lock then clears timer, in that order) → rethrow.
Audit `createProject`/`openProject` exceptional paths for opened-
Db-not-closed before lock release; fix ordering. Fault tests per
the probe recipe: plant an unreadable recovery artifact, assert
open throws AND a retry after repair succeeds (no
ProjectLockedError); same shape for a migration failure and a
derivative failure.

### Files to Touch

`packages/persistence/src/service.ts`, `project.ts`, their specs.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Construction guard: any post-acquire throw closes handle
      fully (db, lock, heartbeat) then rethrows.
- [x] Lower create/open paths close Db on every exceptional
      branch.
- [x] Fault tests: fail-then-repair-then-reopen green for
      recovery, migration, derivative stages.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a project whose open fails partway through construction
**WHEN** the user fixes the cause and retries
**THEN** the project opens — no lock wedge, no leaked handle
blocking repair or delete.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Exceptional-path inventory (project.ts, pre-fix):**

- `createProject`: after `Db.open`, throws from `migrate`, the seed
  `db.transaction`, or `makeHandle` (root row/canvas missing) all
  landed in the single `catch` that ran `lock.release()` only — the
  opened Db leaked on every one. FIXED: track `opened`, `opened?.close()`
  before `lock.release()`.
- `openProject` writable branch: same shape — `migrate` and
  `makeHandle` throws released the lock without closing the Db. The
  `EW_SCHEMA_AHEAD` branch closed the Db *inline then threw*, so the
  `catch` would have double-closed (node:sqlite `close()` throws on a
  second call) had the catch also closed. FIXED: unified on one close
  path — the ahead branch now just throws; the `catch` does
  `opened?.close(); lock.release()`.
- `openProject` read-only branch: already correct (`catch` did
  `db.close()`); left unchanged.
- `makeHandle().close()`: was NOT idempotent — `db.close()` throws on a
  second call, so the service guard closing after a caller already
  closed would itself throw. FIXED: added a `closed` guard;
  `lock.release()` was already idempotent. Order confirmed: db first,
  then lock release (which clears the heartbeat timer and unlinks).

**service.ts:** wrapped everything after handle acquisition (recovery,
handler/query registration, `new Dispatcher`, `enqueueMissingThumbnails`,
and the returned object literal) in one `try` whose `catch` calls
`handle.close()` then rethrows the original error.

**Fault tests** (`service-construction-guard.spec.ts`, 5 tests, all
green): recovery-throw (genuine — plant `cache/import-tmp` as a FILE so
`sweepImportTemp`'s `readdirSync` throws ENOTDIR); migration-throw and
derivative-enqueue-throw (hoisted-flag module mocks — the guard is what
is under test, not the fault); a two-consecutive-faults retry to prove
each release is clean; and a read-only open whose Dispatcher construction
throws (no lock held, but the Db must still close). Each asserts the open
throws, the lock file is gone (writable) / never existed (read-only), and
a repaired retry opens with NO ProjectLockedError.

**Validation:** `pnpm -r build` clean; `pnpm --filter='./packages/*'
test` = 548 persistence tests (incl. the 5 new); desktop `npx vitest run`
= 335; `pnpm lint` exit 0; e2e four shards 45 / 63 (1 pre-existing
import-batch flake, passed on retry) / 75 / 50 = 233 + 1 retried = 234.

**Assumption re AI-IMP-226 (sibling agent owns lock.ts):** I consumed
only `ProjectLock.acquire`, `.release()`, `ProjectLockedError`,
`LOCK_FILENAME`. My guard relies on `release()` being idempotent AND
clearing the heartbeat timer — both true in the current lock.ts. If 226
changes the release/acquire contract, the LEAD reconciles at merge.
