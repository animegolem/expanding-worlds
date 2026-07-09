---
node_id: AI-IMP-218
tags:
  - IMP-LIST
  - Implementation
  - snapshots
  - main
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-218-index-lock-age-gate

## Summary of Issue #1

Terra audit (2026-07-09, P1, lead-verified and downgraded to a
real-but-narrow race): `sweepStaleIndexLock` (main/snapshot.ts
~221) removes `.git/index.lock` unconditionally at snapshot start.
The AI-IMP-120 rationale ("a lock at snapshot start is stale by
construction — the engine serializes its own git ops") holds only
while nothing EXTERNAL touches the repo, but snapshot-push invites
exactly that (a user inspecting the backup repo, a GUI git tool
pointed at it). Sweeping a LIVE lock permits concurrent index
writes — index corruption in the backup, the one place corruption
must never reach. Done means the sweep is age-gated: remove the
lock only when its mtime exceeds a named threshold (e.g. 10 min —
generous over any real commit); a younger lock defers the snapshot
with the existing logged-error path (the next episode retries),
and the orphan-recovery goal (multi-GB first commit killed by
quit) is preserved because orphans age past any threshold.

### Out of Scope

- The snapshot engine's own serialization (correct).
- Push/remote behavior.

### Design/Approach

`statSync(lock).mtimeMs` vs `Date.now() - STALE_LOCK_MS` (named
constant beside the function, rationale comment updated to name
the external-git caveat). Younger → log warn "index.lock present
and fresh; deferring this snapshot" and return a defer signal the
caller already handles as a skipped episode. Unit-test both
branches with a temp dir (touch a lock, backdate via utimesSync).

### Files to Touch

`apps/desktop/src/main/snapshot.ts`, its unit spec.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Age gate with named constant; fresh lock defers (episode
      retries), old lock sweeps; comment tells the truth.
- [ ] Unit tests: fresh-defers, aged-sweeps.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards (snapshots specs especially).
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an external git operation holding a fresh index.lock in
the project dir
**WHEN** a snapshot episode fires
**THEN** the snapshot defers without touching the lock — and an
orphaned lock from a killed commit is still swept once aged.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
