---
node_id: AI-IMP-238
tags:
  - IMP-LIST
  - Implementation
  - e2e
  - import
  - P3
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
date_completed: 2026-07-09
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

- [x] Root cause named with the captured error (product vs test
      verdict explicit).
- [x] 20× consecutive green locally.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead (only if
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

**VERDICT: PRODUCT BUG** — the import path's CreatePin false-conflicts
on the §10.2 optimistic revision check under burst; a dropped file is
reported "failed" with its asset committed but PINLESS (invisible in
the gallery; orphaned bytes left GC-eligible). Not a test bug — the
spec's timing was innocent.

**Mechanism.** `importAsset` commits `CommitAssetImport` inside the
UTILITY process's dispatcher, bumping `project_revision` out of band
from the renderer's `CommandGateway`. The gateway learns that bump only
via the ASYNC `project.onChanged` push (host.ts wires
`gateway.noteRevision(event.revision)` on that event). When the batch
pump's next `CreatePin` builds its envelope before the push lands, it
stamps the pre-import revision → the dispatcher rejects with
`conflict` → `describeFailure` → outcome `failed`. Retries pass because
the push has long since landed — a real defect hiding behind retries,
exactly as the ticket suspected.

**Reproduction + captured error.** Under `--repeat-each=20` the
behavioral failure reproduced once in 40 executions — in the CANCEL
test this time: `Import cancelled: 1 imported · 1 failed · 6 skipped`
(burst of exactly 2 files, so decode/texture contention and the
drop-ask queue were both exonerated). Because the organic rate is
~1/40, the conviction was made deterministic with a temporary probe
spec (deleted before commit): read revision → `importAsset` → execute
`CreatePin` stamped with the pre-import revision. Captured output:

    revisionBefore: 0, revisionAfter: 1
    CreatePin → {"status":"conflict","expectedRevision":0,"actualRevision":1}

i.e. the failing import's actual error is a `CreatePin conflict —
stale expected_project_revision`, surfaced to onError as
`CreatePin failed: the project changed underneath (retry)`.

**Fix (product).** `createImagePin` (import-surfaces.ts) now passes
`{ checkRevision: false }`, per the gateway's documented standing rule
(AI-IMP-044/064): the skew comes from another instance's commit that
this fresh-id CreatePin can never genuinely conflict with. Side
benefit: the committed result's revision advances the gateway past the
import bump, so downstream checked commands (multi-drop sort/frame)
read fresh. Covers the batch path, the quiet path, note-pane drops
(`importFilesAt`), and URL drops — all route through `createImagePin`.

**Spec hardening.** `installFailureCapture` wraps
`window.ew.project.importAsset`/`execute` per test and the spec asserts
zero captured failures before the summary-text assertions — any future
"N failed" names its ACTUAL error instead of a bare count.

**Same bug class, out of fence (flagged, untouched):**
`board-tooling.ts:410` and `charms-ui.ts:357` also run
importAsset→gateway command; single-image flows so the window is
narrower, but the identical race exists. Worth a follow-up sweep.

**Validation.** Post-fix `import-batch.spec.ts` 20× consecutive green
(two foreground `--repeat-each=10` rounds, `--retries=0`: 20+20 test
executions, 0 failures). Gates: `pnpm -r build` green; package units
387+554 (+protocol) green; desktop vitest 335 green; `pnpm lint` clean;
full e2e in 4 shards a-d/e-i/j-r/s-z = 45/66/75/50 passed (236 total,
0 failed; shard regexes cover 62/62 spec files via `--list`).
