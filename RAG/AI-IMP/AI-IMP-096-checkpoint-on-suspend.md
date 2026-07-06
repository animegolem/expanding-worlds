---
node_id: AI-IMP-096
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - electron
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.85
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-096-checkpoint-on-suspend

## Summary of Issue #1

The §11.4 end-session ritual protects cloud-synced project dirs,
but discipline fails: laptops sleep mid-session and cloud daemons
sync a live WAL (Gemini review point, 2026-07-06 — accepted). Done
= the app automates rest: on `powerMonitor` suspend/lock-screen
and on window blur (debounced ~30s), flush editor buffers (the
existing app:flush seam) and checkpoint the WAL
(`PRAGMA wal_checkpoint(TRUNCATE)`), so the SQLite file is at rest
as often as possible with zero user action. The ritual keeps its
lock-release/vault semantics; this is the involuntary half.

### Out of Scope

- Any change to the end-session surface (rev 0.23/0.24 scope).
- Detecting cloud-synced dirs (checkpointing is cheap; do it
  everywhere).

### Design/Approach

Main listens to powerMonitor + browser-window blur; requests the
renderer flush (existing quit-flush seam, bounded timeout), then a
new checkpoint verb to the utility (service runs the PRAGMA).
Debounce blur so tabbing to reference doesn't thrash; suspend/lock
fire immediately.

### Files to Touch

`apps/desktop/src/main/index.ts` (listeners + verb call),
`packages/protocol` (checkpoint verb), `apps/desktop/src/utility/
index.ts`, `packages/persistence/src/service.ts` (+unit); e2e
where cheap (verb round-trip; power events are untestable in CI).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Checkpoint verb: service → PRAGMA wal_checkpoint(TRUNCATE);
      read-only services no-op; unit.
- [x] Main: suspend/lock-screen → flush + checkpoint; blur →
      debounced same; never blocks quit or crashes on a dead
      utility.
- [x] e2e: verb round-trip shrinks/zeroes the -wal file after
      writes.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** an open project with recent edits
**WHEN** the OS suspends (or the window blurs and 30s pass)
**THEN** pending note bursts commit and the WAL checkpoints —
the db file is complete at rest without user action.

### Issues Encountered

Opus-built, lead-transcribed. Blur debounce arms once and focus
clears (no reset-thrash); suspend/lock bypass it. The e2e rides the
EW_TEST_HOOKS seam end-to-end (burst of real edits → wal > 0 →
verb → wal == 0 → data survived). Read-only services no-op; the
writable library secondary checkpoints too. FOLLOW-UP flagged by
the agent: readonly.test.ts fires a malformed CreatePin envelope it
never asserts (commandId not UUIDv7) — its "owner has data"
precondition may not hold; fix with the next persistence touch.
Gates: 450 persistence (3 new) / 37 desktop units, lint, 8 e2e on
the branch + 35 combined post-merge.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
