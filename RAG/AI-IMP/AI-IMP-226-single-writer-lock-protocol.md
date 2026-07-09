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

- [ ] Single-winner acquisition; probe (N≥16, ≥5 rounds, both
      staleAfterMs configs) asserts exactly one winner, in-suite.
- [ ] Live same-host PID never evicted on heartbeat age; trade
      documented in code.
- [ ] Existing lock tests green; stale-reclaim of a DEAD pid still
      works.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
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
