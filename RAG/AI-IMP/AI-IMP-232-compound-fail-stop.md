---
node_id: AI-IMP-232
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - commands
  - P2
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.7
date_created: 2026-07-09
---


# AI-IMP-232-compound-fail-stop

## Summary of Issue #1

Sol audit CA-007 (P2, lead-spot-checked): several compound user
acts ignore intermediate CommandResults — move-and-frame
(host.ts ~1179-1208) can capture/release/arrange after
TransformContent FAILED; frame load (board-tooling ~286-309)
arranges after a failed capture; import (import-surfaces
~299-305) ignores a transform result then awaits a bare
`whenSceneApplied()` — an unqualified next-refresh wait with no
target, timeout, or cancellation, so a failed prerequisite can
hang the import (and its undo group, amplifying CA-006) forever
or resolve it against an unrelated event. Done means every
compound flow inspects each result and STOPS on failure (with the
user-visible refusal the first command would have shown), and the
bare waits become target-aware: keyed to canvas + revision or
required item IDs with try-now and bounded cancellation — the
AI-IMP-113 waitForItems discipline, never a hand-rolled wrapper.

### Out of Scope

- New wait primitives beyond what the host already exposes —
  EXTEND waitForItems/whenSceneApplied with targets if needed,
  in-place (that seam is CLAUDE.md-governed; keep it the one
  copy).
- Undo group identity (231).

### Design/Approach

Sweep the three named sites first, then grep every multi-command
flow for un-inspected `await execute`/`gateway.execute` chains
(list the full inventory in the ticket). Pattern: `const r =
await …; if (r.status !== 'committed') { surface + return }`.
For the import wait: whenSceneApplied gains an optional target
(revision or ids) OR import switches to waitForItems(ids) — pick
whichever the host already supports most cleanly. E2e: inject a
transform failure (revision conflict is the cheap injector) into
move-and-frame → no membership change, no arrange, refusal
surfaced; import with a failing transform → completes cleanly
(no hang), group closed.

### Files to Touch

`canvas/host.ts` (flow + wait seam), `canvas/board-tooling.ts`,
`canvas/import-surfaces.ts`, e2e for the injected failures.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Full inventory of un-inspected compound chains recorded;
      all fail-stop with surfaced refusals.
- [ ] No bare untargeted scene waits remain in compound flows;
      bounded cancellation everywhere.
- [ ] Injected-failure e2e for move-and-frame and import.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a compound gesture whose first command fails
**THEN** nothing downstream executes, the refusal is visible, and
nothing waits forever.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
