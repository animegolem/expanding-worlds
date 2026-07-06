---
node_id: AI-IMP-081
tags:
  - IMP-LIST
  - Implementation
  - import
  - gallery
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-014-gallery]]
confidence_score: 0.65
date_created: 2026-07-06
---

# AI-IMP-081-import-progress-strip

## Summary of Issue #1

A 300-file drop today runs with no feedback surface — imports are
per-file commands with individual toasts at best. §14.4: large
drops run as an INTERRUPTIBLE progress strip with a live
hash-dedupe count, never a modal. This ticket gives bulk drops a
batch identity through the staged pipeline, a progress strip in
the ongoing-state perch grammar (§8.6) counting imported ·
deduplicated · failed with a cancel affordance that stops
remaining files (finished ones stay — imports are already
committed records), and per-batch summary. Done when: a large
drop shows live progress, dedupe hits count visibly, cancel stops
the remainder without corrupting anything, and small drops stay
exactly as quiet as today.

### Out of Scope

The inbox mirror's second import (EPIC-015). Watched directories.
Retry UI for failed files (they list in the summary toast; §4.7
notices already exist per file). The gallery's own rendering of
arriving items (grid refreshes on ordinary pushes).

### Design/Approach

The import surface (drag/paste seams) already iterates files
through the staged pipeline one command at a time — keep that
(each file stays its own committed import; cancel therefore has
nothing to roll back). Add a renderer-side batch driver: when a
drop exceeds a small threshold (e.g. >5 files), wrap the iteration
in a batch context that feeds a progress store (total · done ·
deduped · failed · cancelled). Dedupe detection rides the existing
content-hash short-circuit result (the pipeline already recognizes
known hashes — surface that outcome in the per-file result if it
isn't already). UI: a strip in the §8.6 perch — progress text +
thin bar + ✕ cancel — engagement-fade EXEMPT while running,
collapsing to a summary toast on completion or cancel. Never a
modal, never blocks further drops (a second batch queues behind
the first in the same strip). e2e drives the seam directly (the
import-surfaces test pattern from 070) with a temp-dir file batch
including duplicates.

### Files to Touch

`apps/desktop/src/renderer/` import-surfaces seam + new
`chrome/import-progress.ts` store + strip component in the perch.
`packages/persistence` ONLY if the dedupe outcome isn't already
distinguishable in the import result (additive field).
`apps/desktop/e2e/import.spec.ts`: batch scenarios.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Batch driver over the existing per-file pipeline; threshold
      keeps small drops toast-quiet (e2e both sides of the
      threshold).
- [ ] Dedupe outcome surfaced per file and counted live (e2e with
      duplicate files in the batch).
- [ ] Progress strip in the perch: live counts, thin bar, ✕;
      fade-exempt while running; summary toast on completion;
      never a modal (e2e).
- [ ] Cancel stops remaining files; completed imports remain
      committed records; summary says how many were skipped
      (e2e).
- [ ] A drop during a running batch queues into the same strip
      (e2e).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** The big hoard drop.
**GIVEN** a folder of 40 files, 10 of them byte-duplicates of
already-imported assets.
**WHEN** the user drops them on the board.
**THEN** a progress strip counts up live, reports 10 deduplicated,
and never blocks the canvas.
**WHEN** the user clicks ✕ mid-run.
**THEN** remaining files are skipped, already-imported files stay,
and the summary toast reports imported/deduped/skipped.
**WHEN** the user drops 3 files.
**THEN** no strip appears — the quiet small-drop path is
unchanged.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
