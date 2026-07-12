# Tag-sync census (2026-07-10, lead's Explore run — input to AI-IMP-271)

Pre-build census of the seams AI-IMP-271 rides. Findings verified
against main at 2883e94f. Citations are file:line at that commit.

## 1. Mirror/source relationships — NO persistent record

No table/column ties a project node/asset to a library asset.
`ingestFromSource` returns `sourceProjectId` in the RESULT only
("no schema home in Phase 1" — packages/persistence/src/import/
ingest.ts:64-68, :233; protocol/src/index.ts:220-222). The asset
table has source_url but no source_project_id/mirror_of
(migrations/0001-init.ts:67-91). Cross-project identity is ONLY
the SHA-256 content hash, recomputed on demand: `hasContentHash`
returns {present, tagNames} against the library slot
(queries.ts:76-104); ingest/mirror re-derive tag sets by
content_hash union each time (ingest.ts:100-113). Assets are
never merged on hash — each project has its own asset row
(ingest.ts:59-63).

## 2. Tag schema

Migration 0001 only (no tag migration since): `tag` (id,
project_id, name, name_key, color, icon, lifecycle_state
default 'active', trashed_at, trashed_by_command_id, timestamps;
UNIQUE(project_id, name_key)); `tag_assignment` (tag_id, node_id,
created_at; PK(tag_id, node_id)) — NO updated_at, NO lifecycle,
NO tombstone (0001-init.ts:133-157). name_key via @ew/domain
nameKey(), enforced in handlers (handlers/tags.ts:107-125, :135,
:198). Commands (all handlers/tags.ts): CreateTag :134,
DeleteDraftTag :159, RenameTag :192, AssignTagToNode :214,
UnassignTagFromNode :250, DeleteTag :286 (HARD delete row +
assignments; inverse RestoreTag), RestoreTag :319, MergeTag :336,
UnmergeTag :410, SetTagAppearance :432. NOTE: tag lifecycle_state
is vestigial — DeleteTag hard-deletes (:294-295). Unassignment
leaves NO trace; only the live assignment set is observable.

## 3. The "inbox mirror" is NOT a filesystem inbox

It is live IPC at drop time: `queueMirrorForDrop` (serialized
chain) reads the hash, lazily opens the library secondary, probes
hasContentHash, calls `mirror-to-library`
(renderer/chrome/mirror.ts:175-241); the utility handler writes
via `library.ingestFrom(service.ingestSource(), {contentHash,
border:'none'})` (utility/index.ts:400-447). Strictly
world→library for CONTENT; tags travel the other way only via the
transient drop-time recognition union (protocol/src/index.ts:
241-245; mirror.ts:205-230, :317-337). There is no inbox
directory, file format, or apply-on-open step anywhere.

## 4. Open/close hooks

OPEN (writable): openProject → lock → schema-ahead refusal →
migrate(db) (persistence/src/project.ts:141-165). Read-only
source opens skip lock+migration and require LATEST_SCHEMA_VERSION
(:120-134). No retention purge at open. Main broadcasts
{status:'ok'} service events (main/index.ts:112-120).
CLOSE/QUIT: the quit ritual runs snapshots.runSnapshot(
'end-session') BEFORE close-project, TIME-BOUNDED so a hiccup
never traps quit (main/index.ts:1186-1202); 'rest' snapshots on
blur/suspend/lock (:744-748, :1164-1165). runSnapshot flushes
renderers, checkpoints WAL, writes notes-tree, git-commits
(main/snapshot.ts:159, :537). close-project closes secondaries
with the primary (index.ts:1182-1184, :59-61).
NATURAL HOOKS: outbound push = the quit ritual beside the
end-session snapshot (utility still live); inbound pull = the
init-project response path (main/index.ts:100-120) or the
renderer's ensureLibraryOpen first-touch (mirror.ts:175-190).

## 5. Finding the library — ONE app-level setting

App-tier setting `libraryProjectDir`, read via
window.ew.settings.appAll() then secondary.open('library', dir)
(mirror.ts:177-188); written at first-run designation
(first-run.ts:106-116; default EW_LIBRARY_DIR or
userData/projects/library, main/index.ts:219-223). Exactly one
library, app-wide; designation is "packaging, not schema"
(protocol/src/index.ts:143). No per-project sync ledger exists.

## 6. Notices

ew-board-notice → attachBoardNotices → toast(surface:
'board-notice') (renderer/chrome/status.ts:304-319). The
"N things happened" precedent: the mirror's summary chip
("${n} drops mirrored · ${m} recognized") via onMirrorUiChanged
(mirror.ts:158-173) with self-dismiss + engagement fade
(:100-142).

## Blockers the v1 scope already absorbs

- No stored mirror edge → match by content_hash every sync.
- No removal signal in tag_assignment → ADDITIVE union sync only;
  rename/unassign propagation deferred with the sync-ledger shape.
- No inbox artifact → sync live via the secondary slot (the
  shipped drop-time pattern); cross-instance contention deferred.
- One app-wide library → "the library" is unambiguous.
