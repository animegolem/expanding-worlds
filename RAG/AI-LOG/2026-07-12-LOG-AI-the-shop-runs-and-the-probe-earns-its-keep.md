---
node_id: 2026-07-12-LOG-AI-the-shop-runs-and-the-probe-earns-its-keep
tags:
  - AI-log
  - development-summary
  - delegation
  - undo
  - locks
closed_tickets:
  - AI-IMP-231
  - AI-IMP-221
  - AI-IMP-270
  - AI-IMP-220
  - AI-IMP-219
created_date: 2026-07-12
related_files:
  - .codex/ASSIGNMENT-gr-wave.md
  - .codex/outbox/locks-wave.md
  - apps/desktop/src/renderer/undo/undo-store.ts
  - packages/persistence/src/gc.ts
  - packages/persistence/src/retention.ts
confidence_score: 0.9
---

# 2026-07-12-LOG-AI-the-shop-runs-and-the-probe-earns-its-keep

## Work Completed

THE AUTONOMOUS WAVE DAY (owner out; the two-model shop ran on
briefs, verdicts, and a hash-watch): Codex loaded the
wave-orchestration skill in its own env and goal-looped the queued
briefs sequentially, pausing on my verdicts; my side held a
settle-debounced inbox watcher (hash-based — round rewrites reuse
filenames) so submissions woke me in ~seconds.

TRUST WAVE (231→221→270) MERGED + CLOSED: round-1 review
corrected real scope (bulk place was N fire-and-forget commits;
re-selection needed a receipt seam; 270 had SIX surfaces).
Verdict rulings that now bind: group order reserves at gesture
START (⌘Z on a still-open newest group DECLINES by name);
Codex's proposal to capture solo trash was AMENDED — solo stays
exempt (owner ruling 182 stands), bulk gestures capture as one
group via the group-only policy class (THE SURFACE DEFINES THE
CONTRACT — flagged to owner for possible later unification);
RestoreRecord captured; purge clears redo, stays exempt; tokens
are renderer-local SYMBOLS (structurally unserializable into
envelopes, test-proven). RestoreAndAttachNote makes
create-and-attach redo honest.

SWEEPS WAVE (220→219) MERGED + CLOSED: retention at open through
the one purge path, perch gains GENERIC action/dismiss metadata;
GC eligibility is the verdict-ratified LOSABLE settings ledger
(gc_eligibility_v1, compacted per pass; loss = clocks restart =
more conservative); round 1 found a SHIPPED GRACE VIOLATION
(recovery deleted filesystem orphans immediately at open) —
retired into the 30-day clock; export leases became real;
teardown is transactional with a durable receipt and yields to
the quit budget between hashes.

LOCKS WAVE (264+244): round 1 found 244's fix ALREADY LANDED
(fa2f0111, ticket never closed — review prevented duplicate work)
+ one ruled-in sibling (process.spec exit→close). Round 2 merged
locally, local gate + probe 5/5 green — and THE CI ORACLE FAILED:
Linux probe round 3 admitted TWO WINNERS (different tokens; the
single-writer invariant). ROLLED BACK from main; AMEND verdict
posted with the diagnostic fork (sequential double-win = probe
hold-barrier gap vs concurrent = guard-serialization hole /
split-brain; must be PROVEN, assertion stays strict). Awaiting
round 3.

ALSO: skill rev 2 adopted after the owner's fresh-eyes review
(protocol fence contradiction fixed at source: accepted-verdict
no longer tells the implementer to delete its own worktree; round
ARCHIVE replaces delete — channel replayable); validate-tickets.sh
landed and its first run found 27 real record defects — all
repaired, corpus 335/0, source templates fixed. The skill's
canonical home moved OUT to the owner's _tooling_ repo; the
project keeps the live process.

## Issues Encountered — TWO LEAD FAILURES, rules extracted

1. Main was pushed BEFORE the oracle's conclusion was READ (the
   close chain gated on output-file readability, not the verdict).
   RULE: the oracle conclusion is read and QUOTED before any main
   push.
2. The first rollback reverted the WRONG merge (the locks branch
   had fast-forwarded; `--merges -1` found yesterday's audit
   merge; the audit + kit zip briefly vanished from main). The
   permission classifier correctly blocked a force-push repair;
   forward reverts restored everything. RULE: reverts name their
   target sha EXPLICITLY, never by position.
   Also: one sweeps gate run failed in persistence and never
   reproduced (2 full reruns + 8 isolated runs green) — recorded
   as environmental; the close WAITED for green. The source-panel
   e2e flake is now three-for-three across wave gates → noted
   into AI-IMP-269's scope. Background watchers were externally
   killed several times; restarts were cheap and the
   UserPromptSubmit hook is the fallback wake.

## Tests Added

Via merges: trust wave (gateway token-envelope proof, policy
matrix diff updates, caption/panels full round trips, receipt
seam pins), sweeps wave (retention/GC suites incl. pending-
receipt + expired-budget retry proofs, gc.spec e2e), locks wave
tests exist on the amend branch only. Every wave gate reproduced
locally (counts, not exit codes) + Windows oracle per wave.

## Next Steps

LOCKS ROUND 3 is the live thread: Codex diagnosing the
double-winner with instrumentation; on ACCEPT the same
merge/gate/oracle discipline applies — oracle conclusion QUOTED
before push. Then the GR WAVE (279-282, brief queued;
rebase-from-current-main note stands), then the world wave
(283/284/285) wants briefs cut. Owner-pending: the solo-vs-bulk
trash unification call (221 notes); kit 1.3 lock + design-dir
reorg commit (audits→RAG/audits still uncommitted on disk);
v0.24.x patch-tag call (captions/cursor/updater all unshipped to
testers); HUMAN-TESTING flushes (trust-wave script, sweeps
script, update perch, deliberate cursor). Cleanup owed (lead):
/private/tmp clones — trust-wave, sweeps-wave, locks-wave (HOLD
until amend resolves), loc-audit worktree + hardlink remnant,
loc-review-ledger clone. Read first: this log, the locks amend
verdict (.codex/outbox/locks-wave.md), RAG/INDEX.md kanban.
