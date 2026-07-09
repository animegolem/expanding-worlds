---
node_id: AI-IMP-238
tags:
  - IMP-LIST
  - Implementation
  - e2e
  - import
  - P3
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
---


# AI-IMP-238-import-batch-flake

## Summary of Issue #1

The suite's worst recurring flake, now past the lead's watch-list
threshold: `import-batch.spec.ts` failed-then-passed in the
AI-IMP-173 waves (twice), the wave-C gate, and Sol's audit run —
where it reported `8 imported · 3 deduplicated · 1 failed` before
passing on retry. Sol's observation upgrades it from "slow
launch" to BEHAVIORAL: one import in the batch actually FAILED on
the first attempt. That means either the test's fixtures/timing
race the drop-ask/mirror pipeline, or the pipeline itself drops
one file under burst load — the second would be a real product
bug hiding behind retries. Done means the root cause is named
(instrument the failing import's error, not just the count), the
product is fixed if it's the pipeline, the spec is hardened if
it's the test, and the spec runs 20× consecutively green.

### Out of Scope

- Import limits (234) and streaming (222) — coordinate if the
  cause lands in shared code.

### Design/Approach

Reproduce under repetition (`--repeat-each=20`); capture the
failed import's actual error (the pipeline surfaces onError —
assert and print it in the spec). Suspects from history: the
drop-ask queue under overlapping batches (178's territory),
texture/decode contention at launch, tmp-file fixture races. Fix
at the cause; the spec gains whatever await it was missing (house
idioms only). Record the verdict — product vs test — loudly in
Issues Encountered.

### Files to Touch

`apps/desktop/e2e/import-batch.spec.ts`; product import path only
if convicted.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Root cause named with the captured error (product vs test
      verdict explicit).
- [ ] 20× consecutive green locally.
- [ ] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead (only if
      product-side).

### Acceptance Criteria

**GIVEN** the batch-import spec run 20 times consecutively
**THEN** it passes every time — and if a product defect was
hiding behind the retries, it is fixed, not resurfaced.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
