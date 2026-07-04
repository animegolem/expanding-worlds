---
node_id: AI-IMP-015
tags:
  - IMP-LIST
  - Implementation
  - search
  - fts5
kanban_status: planned
depends_on: [AI-IMP-011, AI-IMP-012]
parent_epic: [[AI-EPIC-003-domain-persistence-core]]
confidence_score: 0.8
date_created: 2026-07-04
date_completed:
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

- [ ] Verify FTS5 availability in the binding chosen by AI-IMP-009 (probe test); if absent, stop and escalate to the lead before proceeding.
- [ ] Migration adds the four FTS5 tables with UUID mapping and maintenance triggers (or post-commit indexer — record decision in Issues Encountered).
- [ ] Note create/update/rename reflects in note_fts within the same transaction (test searches new body text immediately after commit).
- [ ] Tag create/rename, asset commit, and canvas-text decoration create/update/delete each reflect in their index (tests per corpus).
- [ ] Trashed records excluded from default search across all four corpora; restore returns them without rebuild (test trash→search→restore→search).
- [ ] Purge removes rows from the index (test).
- [ ] Search query groups results by kind with §8.3 navigation context (filename match returns the nodes using that asset — test with two nodes sharing an asset appearance).
- [ ] Quick-open: matches by title_key over active notes and canvas-owning nodes, excludes phantoms and trashed, returns kind discriminator (test all three exclusions).
- [ ] rebuildSearchIndex() drops and repopulates all four corpora from base tables; test corrupts an index then rebuilds.
- [ ] `pnpm check` green from fresh `pnpm -r build`; commit on worktree branch.

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
