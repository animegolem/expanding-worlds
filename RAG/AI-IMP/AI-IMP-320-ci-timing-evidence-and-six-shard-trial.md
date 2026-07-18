---
node_id: AI-IMP-320
tags:
  - IMP-LIST
  - Implementation
  - ci
  - process-lab
  - checkpoint-trial
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-18
date_completed:
---

# AI-IMP-320-ci-timing-evidence-and-six-shard-trial

## Summary of Issue #1

PH-007's five-run measured census (ci-pipeline-clarity r2, settled
2026-07-18) convicted two defects in the CI e2e pipeline: (1) file-level
4-way sharding deals a 51% wall-time skew (shard medians 947/820/625/671s
— the slowest shard IS the pipeline), and (2) successful runs emit zero
timing data, so per-file duration evidence for any smarter grouping does
not exist. Ratified trial order: first the six-one-worker-shard
checkpoint trial (one-variable flip, retention-gated), then the
success-timing artifact that feeds the eventual weighted-grouping
decision. `fullyParallel` stays OFF — file-split independence needs its
own proof and is out of scope here. Done means: the shard-count decision
is recorded with three-oracle evidence against the five-run baseline
(retained or reverted — an honest revert is a pass), and every CI run,
green or red, uploads a per-file timing artifact at 7-day retention.

### Out of Scope

`fullyParallel`/worker-count changes; any weighted or duration-based
shard grouping (that is the NEXT trial, fed by this ticket's artifact);
larger runners (parked — free public runners); tag-trigger cleanup
(AI-IMP-321); setup caching (hypothesis killed by measurement — setup is
~44s of an ~16-min critical path).

### Design/Approach

Checkpoint-lane grammar proven in AI-IMP-269: baseline → one-variable
flip → retention gate, concluded honestly either way. The baseline
already exists (PH-007 five-run census). Flip A: `shard: [1..6]` in the
ci.yml e2e matrix — same workers, same reporter, nothing else. Gate:
three oracle runs on the flipped config; retain only if (a) summed
counts across shards equal the CI-mode floor exactly-once, (b) no new
flake class appears, and (c) the longest-shard median falls materially
below the 947s baseline median. Any miss → revert the matrix, record
the numbers in PH-007, close honestly. Flip B (independent, lands
regardless of A's outcome): add a JSON reporter output alongside the
default so per-file durations are machine-readable, and upload it as an
artifact on success as well as failure (`if: always()` or a dedicated
success upload), 7-day retention, named per shard. The artifact is
evidence infrastructure, not behavior — no retention gate needed, but
counts must be unchanged.

### Files to Touch

`.github/workflows/ci.yml`: e2e matrix 4→6; timing-artifact upload step
(success included, 7-day retention); update the AI-IMP-268 comment block.
`apps/desktop/playwright.config.ts`: reporter list gains JSON output to a
known path (CI only or unconditional — implementer's call, recorded).
`RAG/PROCESS-LAB.md` (PH-007 row): trial outcomes with run IDs.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify current matrix, reporter defaults, and the
      PH-007 baseline table against source; record corrections here.
- [ ] Flip B: JSON reporter output wired; local run produces the file
      with per-file durations; default console reporter behavior kept.
- [ ] Flip B: ci.yml uploads the timing JSON per shard on success AND
      failure, retention-days 7; artifact names collide with nothing.
- [ ] Flip A: e2e matrix `[1..6]`, no other variable moved; comment
      block updated to cite this ticket.
- [ ] Retention gate: three oracle runs quoted by run ID; per-shard
      counts summed and compared exactly-once against the CI-mode floor;
      longest-shard wall times tabulated against the 947s baseline.
- [ ] Verdict recorded in PH-007 and in this ticket: RETAINED or
      REVERTED with the numbers; if reverted, matrix restored in the
      same ticket commit chain.

### Acceptance Criteria

**Scenario:** A green CI run after this ticket.
**GIVEN** any push that triggers the CI workflow.
**WHEN** all e2e shards pass.
**THEN** each shard's run page offers a timing artifact containing
per-file durations,
**AND** the artifact expires at 7 days.

**Scenario:** The six-shard retention gate.
**GIVEN** the matrix flipped to six shards with no other change.
**WHEN** three oracle runs complete.
**THEN** summed shard counts equal the CI-mode e2e floor exactly-once on
every run,
**AND** either the longest-shard median falls materially below 947s and
the flip is retained, or the flip is reverted and the numbers are
recorded in PH-007 — both outcomes close this ticket.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
