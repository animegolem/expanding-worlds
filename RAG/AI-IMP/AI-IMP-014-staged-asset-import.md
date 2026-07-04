---
node_id: AI-IMP-014
tags:
  - IMP-LIST
  - Implementation
  - assets
  - import
kanban_status: planned
depends_on: [AI-IMP-010]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
---

# AI-IMP-014-staged-asset-import

## Summary of Issue #1

RFC §11.2 mandates staged asset import into content-addressed managed
storage, and §4.7 defines the Asset record with its kind
discriminator. The Project API's importAsset endpoint (AI-IMP-010)
returns NOT_IMPLEMENTED. Implement the pipeline: temp copy → sniff
and validate (raster only: PNG/JPEG/WebP/GIF/AVIF) → hash → metadata
extraction → atomic move into content-addressed storage → Asset
record commit → derivative enqueue (thumbnail), with byte-level
dedupe that never merges Asset records, and without blocking the API
thread on multi-hundred-MB files. Done means: importAsset works end
to end against a temp project and `pnpm check` is green.

### Out of Scope

UI import surfaces (drop/paste/browser drag/URL fetch — EPIC-004
calls this endpoint); web-reference kind, video/SVG/PDF (§4.7
deferred); startup reconciliation of interrupted imports (016 —
but leave temp-dir layout and pending-import records it can
reconcile); map tiles; GC file deletion.

### Design/Approach

`packages/persistence/src/import/` owns the pipeline; storage layout
per §11.2 (`assets/` content-addressed originals keyed by hash,
`derivatives/thumbnails/`, `cache/`, temp under `cache/import-tmp/`).
importAsset accepts {bytes|sourcePath, originalFilename, sourceUrl?}.
Stage rows in a pending_imports table (state: staging, hashed,
committed) so interruption is reconcilable (§11.2 recovery hook for
016). Sniff by magic bytes, never extension; unsupported types reject
with a structured notice and create no records (§4.7). Hash SHA-256
streaming; if the blob exists, skip the move but still create a new
Asset record (several Assets may share bytes without merging metadata
— §4.7). Extract pixel dimensions from headers (pure parsers per
format; no native image dependency in Phase 1 core). Atomic move via
rename within the project volume. Asset record commit goes through
the dispatcher as an internal CommitAssetImport command so revision,
command_log, and events behave like any mutation. Thumbnails: enqueue
a derivative job row; a minimal worker generates thumbnails
off-thread (worker_threads) — if a pure-JS resize proves too heavy
for Phase 1, record the decision and land the queue with a no-op
generator plus explicit TODO scope (derivatives are regenerable —
§11.2). Large-file NFR: streaming IO in a worker; API thread only
coordinates.

### Files to Touch

`packages/persistence/src/import/pipeline.ts` (+ test): stages.
`packages/persistence/src/import/sniff.ts` (+ test): magic bytes +
dimension parsing for the five formats.
`packages/persistence/src/import/store.ts` (+ test): temp dirs,
content-addressed move, layout helpers.
`packages/persistence/src/import/derivatives.ts` (+ test): job queue.
`packages/persistence/src/handlers/assets.ts` (+ test):
CommitAssetImport handler, asset queries.
`packages/commands/src/payloads/assets.ts`: payload types.
`apps/desktop/src/utility/index.ts`: wire importAsset endpoint
(replace NOT_IMPLEMENTED; small edit only).
Migration file if pending_imports/derivative_jobs tables are missing
from 0001 (new numbered migration, never edit applied ones).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] store.ts: project file layout per §11.2 created on demand; content-addressed path from hash; atomic rename move; temp staging under cache/ with per-import dirs.
- [ ] sniff.ts: magic-byte detection and dimension extraction for PNG, JPEG, WebP (VP8/VP8L/VP8X), GIF, AVIF; fixture-driven tests per format plus a mislabeled-extension case.
- [ ] Unsupported/unrecognized bytes reject with structured IMPORT_UNSUPPORTED_TYPE, temp files cleaned, zero records (§4.7 test with a PDF and a truncated file).
- [ ] pipeline.ts: staging → hash → metadata → atomic move → CommitAssetImport in dispatcher (records content hash, original filename, MIME, dimensions, storage location, optional source URL — §4.7) → derivative enqueue; pending_imports row advances through states.
- [ ] Dedupe test: importing identical bytes under two filenames yields one blob file, two Asset records with distinct metadata (§4.7).
- [ ] Streaming: import runs in a worker thread; test imports a ~100MB generated file while the API thread answers a query within a bounded delay (epic NFR).
- [ ] Interruption fixture: kill the pipeline between hash and commit in a test, verify pending_imports + temp files describe the state 016 will reconcile (no dangling Asset record).
- [ ] Derivative queue: job rows enqueued on commit; worker marks done; thumbnail generation implemented or explicitly stubbed with recorded decision.
- [ ] importAsset endpoint returns the new asset id + dedupe flag over IPC; e2e-adjacent test at the utility-process seam.
- [ ] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch.

### Acceptance Criteria

**Scenario:** RFC slice item 3 at service level.
**GIVEN** an open project.
**WHEN** a PNG named "ref.png" with a source URL is imported.
**THEN** the original lands in assets/ under its content hash, an
Asset row records filename, MIME, dimensions, hash, and source URL,
project_revision advanced once, and a thumbnail job exists.
**WHEN** the same bytes are imported as "copy.png".
**THEN** no second blob is written and a second Asset row exists with
its own filename.
**WHEN** a PDF is imported.
**THEN** the result is a structured rejection, and assets/, the Asset
table, and pending_imports contain nothing from the attempt.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only
comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the
sprint.
You MUST document any failed implementations, blockers or missing
tests.
-->
