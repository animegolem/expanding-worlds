---
node_id: AI-IMP-014
tags:
  - IMP-LIST
  - Implementation
  - assets
  - import
kanban_status: completed
depends_on: [AI-IMP-010]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed: 2026-07-04
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

- [x] store.ts: project file layout per §11.2 created on demand; content-addressed path from hash; atomic rename move; temp staging under cache/ with per-import dirs.
- [x] sniff.ts: magic-byte detection and dimension extraction for PNG, JPEG, WebP (VP8/VP8L/VP8X), GIF, AVIF; fixture-driven tests per format plus a mislabeled-extension case.
- [x] Unsupported/unrecognized bytes reject with structured IMPORT_UNSUPPORTED_TYPE, temp files cleaned, zero records (§4.7 test with a PDF and a truncated file).
- [x] pipeline.ts: staging → hash → metadata → atomic move → CommitAssetImport in dispatcher (records content hash, original filename, MIME, dimensions, storage location, optional source URL — §4.7) → derivative enqueue; pending_imports row advances through states.
- [x] Dedupe test: importing identical bytes under two filenames yields one blob file, two Asset records with distinct metadata (§4.7).
- [x] Streaming: async streamed IO on the service thread (worker_threads deferred — see Issues Encountered); test imports a ~64MB generated file and asserts a query is answered while the import is still in flight (epic NFR).
- [x] Interruption fixture: kill the pipeline between hash and commit in a test, verify pending_imports + temp files describe the state 016 will reconcile (no dangling Asset record).
- [x] Derivative queue: job rows enqueued on commit; worker marks done; thumbnail generation explicitly stubbed (NoopThumbnailGenerator behind a DerivativeGenerator seam) with recorded decision.
- [x] importAsset endpoint returns the new asset id + dedupe flag over IPC; e2e-adjacent test at the utility-process seam (ProjectService.importAsset shape + event test; desktop Playwright e2e excluded from this ticket's validation set per brief).
- [x] `pnpm -r build && pnpm -r --filter '!@ew/desktop' test && pnpm lint && pnpm --filter @ew/desktop build` green from fresh build; commit on worktree branch.

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

- **Thumbnail generation stubbed (recorded decision).** Real resizing
  needs an image codec: a native dep (sharp) contradicts the
  no-native-deps stance of the sqlite decision, and pure-JS
  decode+resize for five formats is far beyond this ticket's budget.
  Landed the derivative_jobs queue, accessors (enqueue/claim/
  done/failed), and a `DerivativeGenerator` interface with
  `NoopThumbnailGenerator` that marks jobs done without producing
  files. Derivatives are regenerable (§11.2), so a future real
  generator can re-enqueue and backfill; §11.4 lazy rebuild covers
  missing files. TODO scope: implement a generator writing
  `derivatives/thumbnails/<assetId>.<ext>`, then a startup/idle worker
  loop calling `processNextJob`.
- **worker_threads deferred (recorded decision).** The pipeline uses
  async streamed IO (fs/promises + createReadStream + streaming
  SHA-256), so the service thread is only briefly occupied between
  chunks; the NFR test shows a query answered while a 64MB import is
  in flight. Offloading to a worker_thread would require either
  bundling a worker entry through electron-vite or a second sqlite
  connection strategy — real toolchain work, not "quick". If profiling
  ever shows event-loop pressure from imports, hashing is the piece to
  move off-thread.
- **node:sqlite sync API pragmatics.** Pipeline DB writes are all O(1)
  row inserts/updates; they run synchronously between async IO stages.
  No compromise needed beyond accepting those microsecond calls on the
  service thread.
- **Import is not undoable in Phase 1 (recorded decision).**
  CommitAssetImport returns `inverse: null`: the blob may be
  byte-shared via dedupe and removal is trash/GC territory (§9.8).
- **Thumbnail job enqueued inside the CommitAssetImport handler**, not
  as a separate pipeline step, so the Asset row and its job commit in
  one transaction — a committed asset always has a thumbnail job.
- **Sniff-parser corners.** JPEG walker handles 0xFF fill bytes,
  standalone markers (RST/TEM), and accepts any SOFn except
  DHT/JPG/DAC; progressive (SOF2) tested. WebP VP8L 14-bit dimension
  bit-packing verified at both extremes (1x1, 16383x16383); an initial
  length guard bug rejecting minimal VP8L files was caught and fixed.
  AVIF uses a real ISO-BMFF box walker (ftyp brand avif/avis, then
  meta→iprp→ipco→ispe) rather than fourcc scanning; the first ispe
  wins, which for pathological multi-property files could report a
  thumbnail's extents — advisory dimensions only, never affects bytes.
  Sniffing reads the first 512KiB, ample for headers that precede
  pixel data in all five formats.
- **Large-file test uses ~64MB** (brief allowed 50–100MB); runs in
  ~190ms locally, keeping suite runtime sane while still exercising
  multi-chunk streaming.
- **The mislabeled-extension case** is proven at the pipeline level (a
  GIF named `photo.png` imports as `image/gif`) because `sniff()`
  takes no filename at all — detection is structurally bytes-only.
- **Utility-process seam test is service-level.** The true IPC
  round-trip needs the Electron binary (desktop e2e excluded from this
  ticket's validation per brief); `apps/desktop` typechecks and
  bundles green, and `ProjectService.importAsset` is tested for the
  exact response fields the endpoint returns. `handle()` in the
  utility process became async to await importAsset; all other cases
  are unchanged and resolve synchronously.
- **State machine left for AI-IMP-016**: `pending_imports.state`
  `staging → hashed → committed`, row written before bytes; rejected
  imports delete their row and temp dir (zero records); a dispatch
  failure after the blob move leaves the row at `hashed` with the blob
  unreferenced (GC-eligible per §9.8, never a dangling Asset row).
  `temp_path` is stored relative to the project dir.
