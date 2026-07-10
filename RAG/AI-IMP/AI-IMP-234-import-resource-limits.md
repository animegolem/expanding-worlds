---
node_id: AI-IMP-234
tags:
  - IMP-LIST
  - Implementation
  - import
  - security
  - P2
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-234-import-resource-limits

## Summary of Issue #1

Sol audit CA-011 (P2, lead-verified): `.ewproj` import
(project-import.ts, manifest.ts) has no uncompressed resource
defenses — unbounded entry count, unbounded manifest buffer,
no per-entry/aggregate uncompressed caps, unbounded compression
ratio, and manifest `bytes` only type-checked (not finite/
non-negative/integer, never reconciled with ZIP metadata or
streamed counts). A damaged or malicious archive can exhaust
memory or fill the disk before hash verification runs. Done means
import enforces named budgets BEFORE extraction (entry count,
manifest size, per-entry and aggregate uncompressed bytes,
compression ratio), requires unique paths and finite integer
sizes, binds the manifest inventory to allowed entries, counts
streamed bytes, and refuses (typed, user-phrasable) on the first
violation — leaving nothing on disk, per the existing
failed-import guarantee.

### Out of Scope

- Export side (229).
- Archive format changes (defenses only).

### Design/Approach

Named constants module beside the importer (generous but real:
e.g. entries ≤ 100k, manifest ≤ 16MB, entry ≤ 8GB, aggregate ≤
64GB, ratio ≤ 200:1 — builder sanity-checks against a realistic
big-project profile and records the rationale). Validate the
central directory + manifest against budgets before any
extraction; stream-count every entry and abort past its declared
+ budgeted size; reconcile declared vs actual at close. Tests:
synthetic zip-bomb (high ratio), over-count archive, lying
manifest (declared ≠ actual), duplicate paths — every case
refuses cleanly with nothing on disk.

### Files to Touch

`packages/persistence/src/export/project-import.ts`,
`manifest.ts`, a limits module + specs.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Budgets enforced pre-extraction; streamed counts enforced
      during; declared-vs-actual reconciled.
- [x] Malicious-archive test family (bomb, count, lie, dupes) all
      refuse with clean disk.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a damaged or hostile .ewproj
**WHEN** the user imports it
**THEN** the import refuses with a clear message before memory or
disk suffer — and a legitimate large project still imports.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Budgets chosen and rationale (mandatory).** New module
`packages/persistence/src/export/import-limits.ts` (`IMPORT_LIMITS`):

- `maxEntries = 100_000`. Entries = 1 db + N notes + M asset blobs +
  1 manifest. A heavy world board — tens of thousands of nodes plus
  tens of thousands of reference images — lands under 100k. A Phase-1
  ceiling, one constant to raise. Enforced during the central-dir
  scan, so a "list a billion entries" archive is refused before the
  entry map is built.
- `maxManifestBytes = 64 MiB` — **deviation from the ticket's
  suggested 16 MB, deliberate.** The exporter writes the manifest
  pretty-printed (`JSON.stringify(m, null, 2)`); one asset inventory
  row costs ~225 bytes (64-hex path + 64-hex sha256 + byte count +
  braces + newlines). At the 100k-entry ceiling that is ~22 MB, so
  16 MB would REFUSE a legitimate max-size archive. 64 MiB keeps
  >2.5x headroom over the largest manifest this exporter can emit
  while still bounding the in-memory buffer. The coupling (manifest
  budget must exceed `maxEntries × pretty-row`) is documented in the
  module header so a future contributor who changes one adjusts the
  other.
- `maxEntryUncompressedBytes = 8 GiB`. The largest honest single
  member is one asset blob; 8 GiB covers a long 4K video reference.
- `maxAggregateUncompressedBytes = 64 GiB`. Total uncompressed
  payload; a generous-but-real Phase-1 total for a media library.
  Enforced as a running sum during the scan.
- `maxCompressionRatio = 200:1`, applied only above
  `ratioCheckFloorBytes = 1 MiB`. STORED assets are 1:1; a VACUUM'd
  db and small markdown deflate at realistically ≤ ~20:1, so 200:1
  leaves ~10x headroom while a zip bomb runs 1000:1–10^6:1. The floor
  exempts tiny highly-compressible files (which can exhaust nothing)
  so the ratio gate never false-refuses a small legitimate note; the
  per-entry and aggregate byte caps guard those.

**Enforcement path.** `openArchive` now checks count, per-entry
declared size, ratio, and running aggregate during the central-dir
scan (before any extraction); the manifest gets a tighter
`maxManifestBytes` cap by declared size and by streamed count while
buffering. `parseManifest` now requires `bytes` to be a finite
non-negative safe integer (not a bare `number`) and rejects duplicate
inventory paths. The extraction loop reconciles `item.bytes ===
entry.uncompressedSize` before extracting, `extractEntry`
stream-counts and aborts the instant a stream overruns its declared
size (before the extra bytes reach disk), and the actual streamed
count is reconciled against the declared size after (catches a short
entry too). Typed codes: `TOO_MANY_ENTRIES`, `ENTRY_TOO_LARGE`,
`ARCHIVE_TOO_LARGE`, `COMPRESSION_RATIO_EXCEEDED`, `MANIFEST_TOO_LARGE`,
`SIZE_MISMATCH` — all user-phrasable. Every refusal runs before the
partial directory is created (or is caught by the existing
`rmSync(partial)` in the `catch`), so a refused import leaves nothing
on disk.

**Backward compatibility.** `importProject`/`readArchiveManifest`
gained an optional third `limits` param defaulting to `IMPORT_LIMITS`;
the only production caller (`apps/desktop/src/utility/index.ts`) is
untouched. The override exists so tests drive the count/size gates
with a tiny synthetic archive instead of a real multi-GB corpus.

**Tests.** `manifest.test.ts` (new): negative/fractional/overflow
`bytes` and duplicate paths all refuse. `project-import.test.ts` (new
`resource budgets` block): synthetic zip-bomb (4 MiB zeros →
`COMPRESSION_RATIO_EXCEEDED`), over-count archive (`maxEntries: 3`
override → `TOO_MANY_ENTRIES`), lying manifest (declared db bytes+1 →
`SIZE_MISMATCH`), duplicate inventory path (→ `BAD_MANIFEST`), and a
legitimate asset-bearing archive that still imports (`assets: 1`,
blob on disk). Every malicious case asserts `destDir` and
`destDir.partial` absent.

**Deferred / not exercised.** The stream-count overrun abort in
`extractEntry` (actual > central-dir declared) is defense-in-depth
against a hand-crafted ZIP whose local/central sizes disagree; yazl
always writes truthful sizes, so the test suite exercises the
declared-vs-actual reconciliation via the manifest-lie path instead.
yauzl's `validateEntrySizes` (default true) is the third layer that
asserts local-header sizes match the central directory.

**Gate result.** build ✓; per-package units ✓ (persistence 564,
desktop 335, and the rest); lint ✓; e2e 234 passed, 1 flaky
(`note-lifecycle`, passed on retry). One pre-existing environmental
e2e failure in `decorations.spec.ts` (the `text-family` select
enumerates only 3 system fonts in this worktree's environment; the
test asserts `> 3`) — unrelated to import/persistence and untouched
by this change.
