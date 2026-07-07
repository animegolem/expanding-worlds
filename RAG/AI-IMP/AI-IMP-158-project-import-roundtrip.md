---
node_id: AI-IMP-158
tags:
  - IMP-LIST
  - Implementation
  - import
  - persistence
kanban_status: completed
depends_on: [AI-IMP-157]
parent_epic: [[AI-EPIC-008-export-import-signoff]]
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-158-project-import-roundtrip

## Summary of Issue #1

EPIC-008 FR-3. RFC §16: Phase 1 MUST import a project export,
recreating the project in a NEW project directory with all record
identities preserved — wiki links, bookmarks, command provenance,
and Trash survive losslessly; regenerable derivatives rebuild
lazily; import never merges; the imported project coexists with its
original (commands, queries, locks scope to the directory). Rev
0.57 container: validate `manifest.json` through the ZIP central
directory BEFORE extracting anything; fail cleanly on schema-version
mismatch. Done means: "Import project…" materializes a working
project from a `.ewproj`, the automated roundtrip diff proves
lossless identity preservation, and a corrupted or version-
mismatched archive is refused with a clear message and no partial
directory left behind.

### Out of Scope

- Cross-project merge, selective import (§16 non-goals).
- Schema MIGRATION of older exports (schema-version mismatch fails
  cleanly in Phase 1; a versioned adapter is future §4.7 work).
- The vault-mirror return path (deferred with §16 scope).

### Design/Approach

Mirror AI-IMP-121's restore-to-copy shape (it already materializes
a project directory and is the review-proven pattern): utility job
reads the central directory, validates manifest (export version,
schema version vs current, inventory presence), then extracts into
`<name>-imported-<date>` with collision suffixes; hash-verify every
asset against the manifest inventory during extraction (stream
hash, no double read); on any failure remove the partial directory
(temp-dir + atomic rename like the asset import pipeline). Post-
extract: open the db read-only for a sanity row-count against the
manifest, then hand off to the normal project-open path; FTS and
derivative caches rebuild lazily by existing machinery. Roundtrip
proof (the FR's success metric): an e2e that builds a small
project (notes with links, tags, placements, bookmark, one trashed
record), exports, imports, and diffs both databases table-by-table
modulo storage paths and the project directory row — a helper
dumping ordered rows per table into comparable JSON. Entry point:
Settings › Backups & export "Import project…" + app-level File
menu; opens the imported project on success.

### Files to Touch

`apps/desktop/src/utility/` import job (+ vitest: manifest
validation matrix, mismatch refusal, partial cleanup).
`apps/desktop/src/main/index.ts`: open-dialog relay + open-project
handoff.
`packages/protocol`: import request/response/progress types.
`apps/desktop/src/renderer/views/SettingsView.svelte`: the row.
`apps/desktop/e2e/export-import.spec.ts`: the roundtrip diff test
+ refusal cases.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Manifest-first validation via central directory; version
      mismatch and corrupt archive refused with a clear message,
      no partial directory (unit matrix + e2e).
- [x] Extraction to a new collision-safe directory; streamed hash
      verification against the inventory; atomic finalize.
- [x] Imported project opens; coexists with the original; FTS/
      derivatives rebuild lazily.
- [x] Roundtrip diff: table-by-table equality modulo storage paths
      — identities, links, tags, placements, bookmarks, command
      provenance, Trash all byte-equal (e2e).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a `.ewproj` exported from a populated project
**WHEN** Import project… runs
**THEN** a new directory holds a working project whose database
diff against the source is empty modulo storage paths, with Trash
and command provenance intact
**AND** a tampered or version-mismatched archive is refused cleanly
with nothing left on disk.

### Issues Encountered

- **yauzl autoClose default** closes the fd when the entry scan ends,
  killing every later openReadStream — opened with autoClose:false
  and explicit close.
- **Duplicate-entry rejection added** beyond the ticket: a crafted
  archive could shadow a verified entry with an unverified twin;
  openArchive refuses duplicates outright.
- **Nothing outside the inventory extracts** — a stowaway zip entry
  never reaches disk; entry paths are re-checked against the partial
  root even after parse-level validation.
- The roundtrip diff needed no "modulo storage paths" carve-out at
  all: no table stores an absolute path, so source and imported
  databases compare EXACTLY, table by table. The e2e also proves the
  FTS index travels (search finds the note in the relaunched app).
- Entry points: Settings row + "Open imported project" reusing the
  AI-IMP-121 restore relaunch; a File-menu entry was skipped (the
  app has no native File menu — ☰ owns verbs; a ☰ row can ride the
  next menus pass if wanted).
- Gates: 175/175 e2e + persistence 516 vitest + lint on main.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
