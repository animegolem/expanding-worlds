---
node_id: AI-IMP-228
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - commands
  - P1
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-228-commit-result-isolation

## Summary of Issue #1

Sol audit CA-003 (P1, lead-verified): in `Dispatcher.execute`
(dispatcher.ts ~84-140) the subscriber loop runs INSIDE the same
try whose catch maps unknown errors to INTERNAL — but it runs
AFTER the transaction has durably committed. A throwing subscriber
(production's posts over the utility parent port, which can throw
during shutdown/transport failure) makes a committed mutation
report `INTERNAL`: the UI skips undo capture/success handling or
retries an already-applied action, and the change event may be
lost. The rollback comment is false for this path — a protocol lie
about durable state. Done means the committed result is decided
the moment the transaction returns; notification runs OUTSIDE the
transaction error mapping with per-subscriber isolation; delivery
failure surfaces as service-health/refresh debt, never as a
rewritten command result.

### Out of Scope

- Subscriber retry/queueing semantics (log + health signal is
  enough now).
- Event-ordering guarantees (unchanged).

### Design/Approach

Restructure: run the transaction, capture `{outcome, revision}`,
CLOSE the error-mapping scope, build the committed result. Then
notify: each subscriber in its own try/catch (log the failure,
count it on a service-health seam if one exists; else console +
a TODO'd health hook). Return the committed result regardless.
Port Sol's probe as a regression test: throwing subscriber +
valid command → result is `committed` AND the row/revision/log
entry exist AND the second subscriber still ran.

### Files to Touch

`packages/persistence/src/dispatcher.ts`, its spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Committed result immune to subscriber failure; per-
      subscriber isolation (one throw doesn't starve the rest).
- [x] Stale rollback comment corrected.
- [x] Regression test: throwing subscriber → committed result +
      durable rows + remaining subscribers notified.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a subscriber that throws during change notification
**WHEN** a command commits
**THEN** the caller receives `committed` with the real revision —
the protocol never lies about durable state.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The transaction and its error mapping now live in one `try` that
  assigns `committed = ctx.db.transaction(...)`; the RevisionConflict/
  DomainError/INTERNAL catch stays exactly as-is but every path
  returns, so TS control-flow analysis proves `committed` assigned
  past the block (no `!` needed). Subscriber notification moved into a
  new private `#notify(event)` called AFTER the try/catch, so it can
  never re-enter the error mapping.
- No service-health seam exists in persistence (recovery.ts's `healthy`
  is checkpoint-scoped, unrelated). Per the brief's fallback: each
  subscriber is isolated in its own try/catch and a throw is logged via
  `console.error` with command type + id + revision, tagged with a
  `TODO(service-health)` hook for when a health/refresh seam lands.
- The false rollback comment ("the transaction already rolled back")
  was on the INTERNAL branch. It is now accurate because that branch
  can only be reached by a pre-commit throw (resolve or in-transaction
  failure); reworded to "SQLite rolled it back (or it never began), so
  no durable state changed".
- Regression test spies on `console.error` (mocked silent) so the
  expected log does not pollute test output.
- Conflict/refusal/validation/mismatch paths untouched — only the
  post-commit notification moved out of the error-mapping scope.
- Gates all green: `pnpm -r build`; persistence 539 units (incl. the
  new test) + all packages; desktop vitest 335; `pnpm lint` clean; e2e
  4 shards 44 + 64 + 75 + 50 = 233 passed, 1 flaky (drop-ask-queue
  import timing, retried-green, unrelated to this change).
