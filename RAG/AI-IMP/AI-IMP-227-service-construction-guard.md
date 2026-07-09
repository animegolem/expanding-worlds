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

- [ ] Construction guard: any post-acquire throw closes handle
      fully (db, lock, heartbeat) then rethrows.
- [ ] Lower create/open paths close Db on every exceptional
      branch.
- [ ] Fault tests: fail-then-repair-then-reopen green for
      recovery, migration, derivative stages.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
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
