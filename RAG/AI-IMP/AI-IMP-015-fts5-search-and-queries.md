---
node_id: AI-IMP-015
tags:
  - IMP-LIST
  - Implementation
  - search
  - fts5
kanban_status: completed
depends_on: [AI-IMP-011, AI-IMP-012]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed: 2026-07-04
---

# AI-IMP-015-fts5-search-and-queries

## Summary of Issue #1

RFC §8.3/§11.1 require FTS5 full-text search over note titles and
bodies, tag names, asset original filenames, and canvas text
decorations, plus a quick-open query over notes and canvas-owning
nodes. No index exists. Implement the FTS5 tables, their
synchronization with domain writes, the grouped search query, and the
quick-open query. Done means: checklist tests pass and `pnpm check`
is green.

### Out of Scope

Search UI, workspace tabs, result navigation (EPIC-006); phantom
titles in quick-open (§8.3 excludes them); ranking tuning beyond
FTS5 defaults + kind grouping; index rebuild on recovery (016 calls
the rebuild primitive this ticket exposes).

### Design/Approach

One FTS5 table per corpus (note_fts over title+body, tag_fts,
asset_fts over original filename, canvas_text_fts over text-kind
decorations) in a new numbered migration — external-content tables
keyed by rowid mapped to record UUIDs via shadow columns. Sync: the
AI-IMP-010 dispatcher already funnels every mutation; hook index
maintenance either via SQLite triggers on the base tables (preferred
— survives any handler path) or a post-commit indexer keyed on
affected records; choose triggers unless FTS5 external-content
trigger complexity proves brittle, and record the choice. Trashed
records drop out of default search (§8.3): filter at query time by
joining lifecycle_state, so restore needs no re-index. Search query
returns grouped-by-kind results with enough context for §8.3
navigation (note id/title/snippet; tag id/name; asset id + using
node ids; decoration id + canvas id). Quick-open: title_key prefix/
substring match over active notes and canvas-owning nodes (node
label = attached note title per §4.5; a canvas-owning node without a
note is addressable by short code), no phantoms. Expose
rebuildSearchIndex() for 016. All queries via the typed query
registry.

### Files to Touch

`packages/persistence/src/migrations/000N-fts.sql`: FTS5 tables +
triggers.
`packages/persistence/src/search.ts` (+ test): index maintenance,
rebuild primitive.
`packages/persistence/src/queries-search.ts` (+ test): search,
quick-open.
`packages/protocol/src/index.ts`: search/quick-open query types
(append-only).
Registry wiring (append-only edits).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Verify FTS5 availability in the binding chosen by AI-IMP-009 (probe test); if absent, stop and escalate to the lead before proceeding.
- [x] Migration adds the four FTS5 tables with UUID mapping and maintenance triggers (or post-commit indexer — record decision in Issues Encountered).
- [x] Note create/update/rename reflects in note_fts within the same transaction (test searches new body text immediately after commit).
- [x] Tag create/rename, asset commit, and canvas-text decoration create/update/delete each reflect in their index (tests per corpus).
- [x] Trashed records excluded from default search across all four corpora; restore returns them without rebuild (test trash→search→restore→search).
- [x] Purge removes rows from the index (test).
- [x] Search query groups results by kind with §8.3 navigation context (filename match returns the nodes using that asset — test with two nodes sharing an asset appearance).
- [x] Quick-open: matches by title_key over active notes and canvas-owning nodes, excludes phantoms and trashed, returns kind discriminator (test all three exclusions).
- [x] rebuildSearchIndex() drops and repopulates all four corpora from base tables; test corrupts an index then rebuilds.
- [x] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch. (Caveat: the `check:spike` stage fails in the fresh worktree for environmental reasons unrelated to this ticket — see Issues Encountered. Build, all non-desktop tests, and lint are green.)

### Acceptance Criteria

**Scenario:** RFC slice item 12's search half at service level.
**GIVEN** a project with a note ("Harbor Wall" / body mentioning
"lighthouse"), a tag "coastal", an asset "cliffs_ref.png" used by two
nodes, and a canvas text decoration reading "old beacon".
**WHEN** searching "lighthouse", "coastal", "cliffs", and "beacon".
**THEN** each returns exactly its record grouped under the right kind,
the filename match lists both using nodes, and the decoration result
carries its canvas id.
**WHEN** the note is trashed and the search repeats.
**THEN** the note result is absent, and it returns after restore with
no rebuild.
**WHEN** quick-open queries "har".
**THEN** the note appears; phantom and trashed titles do not.

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

- **Triggers chosen over a post-commit indexer.** Index maintenance
  is pure SQLite triggers on the base tables (migration 0003), so any
  write path — handlers, AI-IMP-013 lifecycle/purge work, raw
  recovery SQL — keeps the index consistent with zero cooperation.
  The external-content 'delete' subtleties never got brittle: the
  UPDATE triggers fire on exactly the indexed columns, so the OLD
  values replayed to the 'delete' command always match what was
  indexed.
- **Split index architecture.** note_fts/tag_fts/asset_fts are
  external-content fts5 tables keyed on the base table's implicit
  rowid (no text duplication; snippet() reads live rows).
  canvas_text_fts cannot use external content because its source is
  an expression — `json_extract(decoration.data, '$.text')` — which
  fts5 content tables cannot declare; it stores its own copy of the
  text, keyed by decoration.rowid, and only kind='text' rows are
  indexed. UUIDs are recovered by joining the base table on rowid at
  query time.
- **VACUUM caveat.** Base tables have TEXT primary keys, so their
  implicit rowids are not VACUUM-stable. Nothing in the codebase
  VACUUMs today; if that ever changes, `rebuildSearchIndex()` must
  run afterwards (documented in the migration header and search.ts).
- **Protocol deviation (Files to Touch).** `packages/protocol` needed
  no edit: AI-IMP-010 made query names/args untyped strings over IPC
  (`RunQueryRequest {name, args}`), so the new queries flow through
  unchanged. Result/type shapes are exported from `@ew/persistence`
  (queries-search.ts) instead.
- **Migration is a TS module, not .sql.** The ticket named
  `000N-fts.sql`; repo convention (0001/0002) is TS modules exporting
  `{id, name, sql}` so tsc emits them into dist. Implemented as
  `0003-fts.ts`. STRICT does not apply to fts5 virtual tables.
- **fts5 quirks.** An empty MATCH expression is an error, so
  `ftsMatchExpression()` returns null for token-free input and the
  queries short-circuit to empty results. User input is never parsed
  as MATCH syntax: each whitespace token is quoted with internal
  quotes doubled (`"weird" AND syntax` searches those literal
  tokens); hostile-input tests cover operators, column filters, and
  bare quotes. The `'delete-all'` command is only valid for
  external-content/contentless tables, so the canvas_text_fts rebuild
  path uses `DELETE FROM` + repopulate.
- **Quick-open edge.** A canvas-owning node whose note is trashed is
  treated as noteless: not matchable by the trashed title (§8.3
  excludes trashed), but still addressable by short code (§4.11).
- **Lifecycle commands absent on this base.** AI-IMP-013 runs
  concurrently, so trash/restore/purge are exercised via raw
  lifecycle_state UPDATEs and raw DELETEs — which is also exactly
  what proves the triggers need no handler cooperation.
- **`pnpm check` environment failure.** The `check:spike` stage fails
  in this fresh worktree because `spike/` is a separate npm prefix
  whose devDependencies are not installed (`spike/` is out of scope
  and untouched). `pnpm -r build`, `pnpm -r --filter '!@ew/desktop'
  test` (199/199 persistence tests, 24 new), and `pnpm lint` are all
  green.
