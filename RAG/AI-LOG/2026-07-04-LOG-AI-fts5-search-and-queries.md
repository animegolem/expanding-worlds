---
node_id: LOG-AI-2026-07-04-fts5-search
tags:
  - AI-log
  - development-summary
  - search
  - fts5
  - persistence
closed_tickets: [AI-IMP-015]
created_date: 2026-07-04
related_files:
  - packages/persistence/src/migrations/0003-fts.ts
  - packages/persistence/src/search.ts
  - packages/persistence/src/search.test.ts
  - packages/persistence/src/queries-search.ts
  - packages/persistence/src/queries-search.test.ts
  - packages/persistence/src/migrations/index.ts
  - packages/persistence/src/index.ts
  - packages/persistence/src/service.ts
confidence_score: 0.9
---

# 2026-07-04-LOG-AI-fts5-search-and-queries

## Work Completed

Implemented AI-IMP-015 (worktree agent session): FTS5 full-text
search per RFC-0001 §8.3/§11.1. Migration 0003 adds four corpora —
note_fts (title+body), tag_fts (name), asset_fts (original_filename),
canvas_text_fts (text-kind decorations' `$.text`) — maintained by
SQLite triggers on the base tables so every write path, including
concurrent AI-IMP-013 lifecycle/purge work, keeps the index
consistent without handler cooperation. note/tag/asset use
external-content fts5 over base rowids; canvas_text_fts stores its
own text because fts5 external content cannot source a JSON
expression. Trashed exclusion happens at query time by joining
lifecycle_state (restore needs no re-index); purge DELETEs drop index
rows via triggers. Added `searchProject` (grouped-by-kind results
with §8.3 navigation context: note snippets, tag names, asset
using-node/using-canvas ids, decoration canvas ids) and `quickOpen`
(title_key match over active notes and canvas-owning active nodes,
short-code addressing for noteless canvas owners per §4.11, phantoms
and trashed excluded) on the query registry, plus
`rebuildSearchIndex()` for AI-IMP-016 recovery and
`ftsMatchExpression()` which quotes user input so MATCH syntax cannot
error or inject.

## Session Commits

One commit on the worktree branch covering migration 0003, search.ts,
queries-search.ts, their tests, append-only wiring (migrations/index,
package index, service), the ticket close-out, and regenerated
RAG/INDEX.md.

## Issues Encountered

- `packages/protocol` (listed in Files to Touch) needed no edit:
  AI-IMP-010 made query names/args untyped over IPC, so the new
  queries flow through `RunQueryRequest {name, args}` unchanged.
- Migration is `0003-fts.ts` (TS module), not the ticket's
  `000N-fts.sql`, per the repo's 0001/0002 convention.
- Base tables have TEXT primary keys, so implicit rowids are not
  VACUUM-stable; nothing VACUUMs today, and the caveat plus the
  rebuildSearchIndex() remedy are documented in the migration header.
- `'delete-all'` is only valid for external-content/contentless fts5
  tables; canvas_text_fts rebuild uses `DELETE FROM` + repopulate.
- `pnpm check`'s `check:spike` stage fails in a fresh worktree
  (spike/ is a separate npm prefix with uninstalled devDependencies —
  out of scope, untouched). Build, all non-desktop tests, and lint
  are green.

## Tests Added

24 new tests across two files (persistence suite 175 → 199, all
passing). search.test.ts: FTS5 availability probe on the AI-IMP-009
binding; per-corpus trigger maintenance (create/update/rename/delete
for notes, tags, assets, text decorations, including the
non-text-kind exclusion); raw-DELETE purge per corpus; index
corruption + rebuildSearchIndex recovery over all four corpora;
ftsMatchExpression quoting and hostile-input acceptance.
queries-search.test.ts: the ticket's full Given/When/Then acceptance
scenario as one test (grouped results, two nodes sharing an asset
appearance, decoration canvas id, trash→search→restore→search,
quick-open "har" with phantom/trashed exclusion); canvas background
usage reporting; four-corpora trash exclusion round trip; hostile
MATCH input via the registry; quick-open kind discriminators,
short-code addressing, trashed node/canvas exclusion, Unicode
title_key normalization, and literal LIKE-wildcard matching.

## Next Steps

AI-IMP-016 (recovery) should call `rebuildSearchIndex({db})` — it
drops and repopulates all four corpora from base tables in one
transaction and is safe to run at any time; recovery verification can
assert a known term matches per corpus afterwards. When AI-IMP-013
merges, its trash/restore/purge commands need no search-side changes
(triggers + query-time filtering already cover them), but a quick
integration test through the real commands would be cheap insurance.
The lead should review: the external-content vs content-stored split,
the quick-open rule that a canvas owner with a trashed note falls
back to short-code addressing, and the searchProject result shape
before EPIC-006 builds UI on it.
