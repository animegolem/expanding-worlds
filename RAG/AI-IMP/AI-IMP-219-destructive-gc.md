---
node_id: AI-IMP-219
tags:
  - IMP-LIST
  - Implementation
  - persistence
  - gc
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-007-lifecycle-trash-undo]]
confidence_score: 0.6
date_created: 2026-07-09
---


# AI-IMP-219-destructive-gc

## Summary of Issue #1

Terra audit (2026-07-09, P2, lead-verified — an accepted-but-
never-backfilled §9.8 gap): `computeGcEligibleBlobs` (gc.ts)
exists and is correct, but NOTHING destructive ever runs — its
only consumer is the export active-only filter. Purged nodes,
failed imports, and import-then-undo all leave blobs on disk
forever; for the target user (an artist hoarding reference by the
thousand) the library only ever grows. Done means a lease-aware
destructive sweep exists per §9.8 — mark (the existing
eligibility query) → guard (in-flight imports, export leases,
trash-referenced assets) → sweep blobs to a recoverable holding
state or delete per the RFC's ruling — running at a deliberate
moment (End-Session/quit episode or explicit Settings action, NOT
ambient), with a dry-run count surfaced before the first
destructive pass. READ §9.8 FIRST and restate its exact
guarantees in this ticket before writing any code; where the RFC
is silent (holding period? user-visible reporting?), STOP and
bring the question to the owner rather than choosing.

### Out of Scope

- Import-flow atomicity/compensation (Terra's sibling finding —
  fold ONLY the orphan-cleanup share that the sweep naturally
  covers; a failed import's blob becoming sweep-eligible is this
  ticket, transactional import is not).
- Trash retention purge (AI-IMP-220 — coordinate: purge feeds GC
  eligibility).
- Export lease mechanics beyond the shipped exporter; its live inventory
  must guard this sweep.

### Design/Approach

Verify-first: reproduce an unreachable blob (import → undo →
blob still on disk). Then: a `runGc` command/utility op in the
persistence package (mark/guard/sweep with the §9.8 semantics),
invoked from the quit/End-Session episode alongside snapshots, and
a Settings backup-cluster fact showing reclaimable bytes. Deletion
itself follows whatever §9.8 says (if it specifies
a grace/holding dir, honor it; if silent, STOP per above). Every
sweep logs a manifest of removed hashes into the project log.

Pre-implementation correction and ruled guarantees (2026-07-12): rev
0.70 removes the manual action. Original blobs are eligible only while
truly unreferenced outside Trash, undo, active import/derivative work,
and export leases; first observation at an End Session boundary starts
a conservative 30-day clock. Snapshot precedes sweep; no production
mid-session trigger exists. `gc_eligibility_v1` is a deliberately
losable internal settings ledger (loss restarts clocks), compacted when
hashes are re-referenced or swept. Recovery's immediate orphan deletion
was a conflicting destructive path and is retired: filesystem-only
orphans use the same clock. Matured cleanup re-checks every guard,
transactionally removes derivative jobs and unreferenced Asset rows,
then deletes managed original/thumbnail files and appends a JSONL
receipt. A persisted pending-manifest receipt makes partial IO retryable.
The sweep yields to the quit deadline between hashes. Settings reads a
non-mutating matured-byte total beside backup size.

### Files to Touch

`packages/persistence/src/gc.ts` + a handler/utility op, main
quit-episode wiring, Settings row, unit + e2e coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] §9.8 guarantees restated here; silences escalated, ruled,
      and recorded before destructive code.
- [x] Mark/guard/sweep implemented; failed-import and
      import-undo blobs become reclaimable; guards proven by
      tests (in-flight import survives a sweep).
- [x] Deliberate trigger only + dry-run count; sweep manifest
      logged.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** an import undone and a node purged
**WHEN** the End Session / quit data half fires
**THEN** their blobs leave disk per §9.8's guarantees — and an
import in flight during the sweep is untouched.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- The existing recovery pass deleted filesystem-only canonical orphans
  immediately, contradicting the ratified grace; only transaction/temp
  reconciliation remains there.
- The export-lease stub was stale after export shipped. Service export
  now ref-counts its whole inventory across every awaited export phase.
- The first Settings e2e exposed the cleanup sentence accidentally
  patched into export-progress copy; the snapshot cluster now owns it.
