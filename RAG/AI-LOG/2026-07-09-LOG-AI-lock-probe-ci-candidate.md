---
node_id: 2026-07-09-LOG-AI-lock-probe-ci-candidate
tags:
  - AI-log
  - development-summary
  - ci
  - test-harness
closed_tickets: []
created_date: 2026-07-09
related_files:
  - packages/persistence/src/lock-probe.spec.ts
  - RAG/AI-IMP/AI-IMP-244-lock-probe-stream-close.md
confidence_score: 0.95
---

# 2026-07-09-LOG-AI-lock-probe-ci-candidate

## Work Completed

Investigated the red Linux CI run 29060392548. The AI-IMP-226
single-writer probe was reporting an empty child result because its
parent consumed stdout on `exit`, which precedes guaranteed stdio
drain. The candidate changes that lifecycle observation to `close`.

## Session Commits

- Pending Fable review: AI-IMP-244 lock-probe stream-close candidate.

## Issues Encountered

- GitHub CLI authentication had expired; the owner reauthenticated it
  during the investigation.
- A separate Windows-workflow experiment (not in current main) showed
  `fsync` EPERM failures in export tests. It is deliberately not folded
  into this Linux CI-harness candidate.

## Tests Added

No new test case was necessary: the existing 16-process contention
probe is the regression test. Its observation point now waits until
the worker's stdout/stderr have closed.

## Next Steps

- Fable should review the narrow `exit` → `close` change and merge if
  accepted.
- Confirm the next Linux CI run passes the lock probe.
- If the Windows CI job is reintroduced, ticket its `fsync` portability
  failure separately rather than weakening export durability implicitly.
