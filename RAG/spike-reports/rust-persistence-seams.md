---
node_id: SPIKE-REPORT-005
tags:
  - spike
  - rust
  - persistence
  - protocol
  - sqlite
  - seam-analysis
date_created: 2026-07-09
related: "[[AI-IMP-243-rust-persistence-seam-analysis]]"
follows: "[[SPIKE-REPORT-004]]"
---

# Rust persistence port: is the node:sqlite half a fenced job?

The V2 sketch's bet: "the Electron main/node:sqlite half is cleanly
seamed behind `packages/protocol`, so a Rust persistence port is a
fenced job." This report verifies it by inventorying the protocol
surface, cataloguing every node-ism a Rust rewrite must reproduce,
finding where behaviour leaks past the protocol types, mapping each
feature onto rusqlite/SQLx, and rendering a verdict.

**Composition note.** This report pairs with `tauri-shell.md`
(SPIKE-REPORT-004), which enumerated the 10 *shell* seams (asset
protocol, CSP, IPC byte-channel, Pixi dedupe…). Those live in the
renderer/host boundary; this report is the *storage* boundary. The one
overlap — the asset read path — is called out explicitly in §3, seam
L1, because it is the single biggest surprise: **asset bytes do not
travel the protocol at all; main reads the persistence store layout
directly off disk** (tauri-shell seam #4's "wire a loader" is the
renderer-side mirror of this same leak).

**Headline verdict (full argument in §5): YES, bounded — but the fence
is wider than "packages/protocol."** The 22 message types are a clean,
enumerable request/response surface. But three things escape them: (a)
`execute-command`/`run-query` are open string namespaces hiding **64
command types and 38 named queries** the renderer relies on by name
(`packages/commands/src/payloads/*`, `packages/persistence/src/queries*.ts`);
(b) main imports `blobRelativePath`/`thumbnailRelativePath` from
`@ew/persistence` and reads the content-addressed store itself
(`apps/desktop/src/main/index.ts:6,366`); (c) the git snapshot engine
(`apps/desktop/src/main/snapshot.ts`) is 775 lines of node:fs +
`child_process` git that the ticket files under "persistence" but which
physically lives in **main**, not `packages/persistence`. None is
structural — each is a nameable, fenceable unit of work — but "port
persistence" is really "port persistence + re-home two main-process
subsystems + preserve two open command/query namespaces byte-for-byte."

---

## 1. Protocol surface inventory

The entire cross-process contract is **one file**,
`packages/protocol/src/index.ts` (518 LOC, zero runtime code — pure
types + a handful of key constants). Every message the utility serves
is dispatched in `apps/desktop/src/utility/index.ts`'s single `handle()`
switch (`:41-566`). Main is a dumb correlator: it wraps each request in
`{id, payload}` (`UtilityEnvelope`, protocol `:500`) and postMessages it
(`apps/desktop/src/main/index.ts:166`); the utility replies
`{kind:'response', id, payload}` or pushes uncorrelated events
(protocol `:506-510`).

### 1a. Request/response message types (the `ProjectRequest` union)

| # | `type` | Request payload | Response (ok / error) | Semantic contract the caller relies on | Cited |
|---|--------|-----------------|-----------------------|----------------------------------------|-------|
| 1 | `ping` | — | `{pong:true, from:'utility'}` | Liveness; dead utility returns `pong:false` (main synth) | protocol `:12-19`; handler `utility:43`; dead `main:54` |
| 2 | `init-project` | `{dir, createIfMissing, title?}` | ok `{project:ProjectInfo, recovery:RecoverySummary}` / err `{code,message}` | Opens/creates + runs recovery; `ProjectInfo.revision` seeds the renderer's optimistic-concurrency baseline; `recovery` surfaces as a toast; `code` may be a node errno (`err.code`) or `INIT_FAILED` | protocol `:21-43`; handler `utility:46-76` |
| 3 | `close-project` | — | `{ok:true}` | Closes primary + both secondaries; dead utility still returns ok | protocol `:45-52`; handler `utility:199-208` |
| 4 | `checkpoint-wal` | — | `{ok:true}` / err `CHECKPOINT_FAILED` | `PRAGMA wal_checkpoint(TRUNCATE)` on primary + writable library; read-only/closed no-op ok; "the .sqlite is complete at rest for a cloud daemon" | protocol `:255-266`; handler `utility:78-97`; svc `service.ts:235-241` |
| 5 | `snapshot-write-notes` | — | ok `{notes, assets}` / err `NO_PROJECT`,`NOTES_TREE_FAILED` | Regenerates readable `notes/` tree BEFORE checkpoint; counts feed the git commit message; read-only refuses | protocol `:310-317`; handler `utility:99-125` |
| 6 | `execute-command` | `{envelope: CommandEnvelope}` | `{result: CommandResult}` | **The single write path.** Result is `committed`/`conflict`/`error` discriminated (see 1c); `NO_PROJECT` when closed | protocol `:54-62`; handler `utility:444-457` |
| 7 | `run-query` | `{name, args?}` | ok `{result:unknown}` / err `{code,message}` | **Open read namespace** (38 names); result shape is per-query, untyped at the seam | protocol `:64-72`; handler `utility:459-467` |
| 8 | `import-asset` | `{originalFilename, bytes:Uint8Array, sourceUrl?}` | ok `{assetId, deduplicated}` / err | Staged file IO; the ONLY inherently-async handler (`utility:39-40`); `code` may be a `DomainError` code | protocol `:74-84`; handler `utility:539-563` |
| 9 | `set-setting` | `{key, value:unknown}` | `{ok:true}` / err `SET_SETTING_FAILED` | Project-tier preference; NEVER enters command history, NEVER bumps revision; value is JSON-serialized | protocol `:86-98`; handler `utility:469-484`; settings `settings.ts:27-32` |
| 10 | `claim-thumbnail-job` | — | ok `{job: ThumbnailJobInfo\|null}` / err | Renderer claims oldest queued job; claim does NOT lock (dead renderer heals) | protocol `:100-118`; handler `utility:486-505` |
| 11 | `submit-thumbnail` | `{jobId, bytes:Uint8Array\|null}` | `{ok:true}` / err | `null` bytes = failed job; asset identity comes from the JOB, never the caller (security); on success pushes `thumbnail-ready` | protocol `:120-131`; handler `utility:507-537` |
| 12 | `open-secondary` | `{target, dir, createIfMissing?, seedDir?, title?}` | ok `{project, created?, seeded?}` / err | source=read-only, library=writable; replace-on-open; create seeds example set; `INVALID_TARGET` if create+source | protocol `:133-164`; handler `utility:210-266` |
| 13 | `close-secondary` | `{target}` | `{ok:true}` | Idempotent slot close | protocol `:166-174`; handler `utility:268-271` |
| 14 | `secondary-query` | `{target, name, args?}` | ok `{result}` / err `NO_SECONDARY` | run-query against a secondary slot | protocol `:176-185`; handler `utility:298-312` |
| 15 | `secondary-import` | `{target, originalFilename, bytes, sourceUrl?}` | ok `{assetId, deduplicated}` / err | import INTO library slot; source refuses at service | protocol `:187-199`; handler `utility:314-344` |
| 16 | `ingest-from-secondary` | `{target, contentHash, border}` | ok `{nodeId, assetId, deduplicated, sourceProjectId}` / err | pull one asset + tag facts from secondary into PRIMARY; `border` = `'none'\|'all'\|string[]`; `sourceProjectId` rides response (no schema home) | protocol `:201-224`; handler `utility:346-393` |
| 17 | `clear-library-example` | — | ok `{trashed:number}` / err `NO_SECONDARY` | trash every `example`-tagged node in library via TrashNode commands | protocol `:233-239`; handler `utility:273-296` |
| 18 | `mirror-to-library` | `{contentHash}` | ok `{nodeId, assetId, deduplicated}` / err | inverse of ingest; border always `'none'` | protocol `:246-253`; handler `utility:395-442` |
| 19 | `export-project` | `{destPath, activeOnly}` | ok `{bytesWritten, entries, notes, assets}` / err | refresh notes→checkpoint→stream `.ewproj`; progress rides `export-progress` push; read-only refuses | protocol `:387-402`; handler `utility:127-154` |
| 20 | `export-estimate` | — | ok `{bytes}` / err `ESTIMATE_FAILED` | stat-walk size, no archive work | protocol `:404-411`; handler `utility:178-197` |
| 21 | `import-project` | `{archivePath, destDir}` | ok `{dir, projectId, title, notes, assets}` / err | materialize `.ewproj` into NEW dir; no service guard (pure fs/zip); `code` may be an `ImportRefusal` code | protocol `:421-441`; handler `utility:156-176` |

(21 request `type`s in the `ProjectRequest` union, protocol `:443-464`.
The `Snapshot*`/`Restore*` *types* below are IPC-shared shapes carried
on main-only IPC channels, not `ProjectRequest` variants.)

### 1b. Utility → main channel (`UtilityMessage`, protocol `:506-510`)

| `kind` | Payload | Contract | Cited |
|--------|---------|----------|-------|
| `response` | `{id, payload:ProjectResponse}` | id-correlated reply to one request | protocol `:507`; main `:118-124` |
| `event` | `{event:ProjectChangedEvent}` | **uncorrelated push** after every commit; drives renderer refresh AND resets the idle-snapshot clock (`main:145`) | protocol `:508`; dispatcher `dispatcher.ts:166-174` |
| `thumbnail-ready` | `{assetId, contentHash}` | push after a derivative lands; main re-broadcasts to windows | protocol `:509`; handler `utility:521-527`; main `:126-133` |
| `export-progress` | `{progress:{bytesWritten, bytesTotal}}` | throttled ~1% steps during export | protocol `:510`, `:416-419`; export `project-export.ts:382-390` |

### 1c. Semantic sub-contracts inside the opaque payloads

These are NOT in the protocol union — they are the `@ew/commands`
vocabulary the renderer imports directly (`envelope.ts` header: "the
renderer may import this package, never @ew/persistence"). A Rust port
must reproduce these shapes and every code string byte-identically:

- **`CommandResult` discriminant** (`envelope.ts:46-71`):
  `committed{revision, affected[], inverse}` / `conflict{expectedRevision,
  actualRevision}` / `error{code, message, details?}`. The renderer
  branches on `.status` in ≥10 sites (§3, L3) and on `inverse` for the
  in-memory undo stack (`envelope.ts:40-44`).
- **Revision semantics** (`dispatcher.ts:93-131`): monotonic
  `project_revision` incremented exactly once per committed command,
  inside the same `BEGIN IMMEDIATE` transaction as the mutation and the
  `command_log` insert; `expectedProjectRevision` mismatch → `conflict`
  (optimistic concurrency, §10.2). This is invariant-load-bearing.
- **`ProjectChangedEvent`** (`envelope.ts:89-96`): `{revision,
  commandId, commandType, affected[]}` — exactly one per commit
  (`dispatcher.ts:166`), emitted OUTSIDE the transaction (CA-003).
- **64 command types** (`packages/commands/src/payloads/*`, count via
  `COMMAND_*` consts) and **38 registered query names**
  (`queries*.ts`, `settings.ts`) — the true payload surface behind
  messages #6/#7/#14.

### 1d. Main-only IPC shapes (snapshot/restore, not `ProjectRequest`)

`SnapshotMode`/`SnapshotStatus`/`SnapshotEntry`/`RestoreResult`/
`SnapshotPushState`/`SnapshotTestConnectionResult` (protocol
`:268-382`) plus `ServiceStatusEvent` (`:493-497`) and
`ThumbnailReadyEvent` (`:513-516`). These are typed in protocol but
served by **main** (`snapshot.ts`, `main/index.ts` ipcMain handlers
`:847-1035`), not the utility — they cross main↔renderer, not
main↔utility. Relevant because the snapshot engine is part of the
"persistence port" scope even though it never touches the utility seam.

---

## 2. Node-ism catalog (everything a Rust rewrite must reproduce)

node: import census over `packages/persistence/src` (non-test):
`node:path` ×55, `node:fs` ×53, `node:crypto` ×6, `node:fs/promises` ×5,
`node:child_process` ×0 in persistence (git lives in main), `node:sqlite`
×1 (only `db.ts`).

### 2a. node:sqlite API surface (all behind ONE class, `db.ts`)

The seam is deliberately one file (`db.ts:1-8` "Keep all driver contact
behind this class so a future swap stays one-file"). Exact surface:

| node:sqlite API | Used at | Rust (rusqlite) equivalent |
|-----------------|---------|-----------------------------|
| `new DatabaseSync(path)` / `{readOnly:true}` | `db.ts:23,28` | `Connection::open` / `OpenFlags::SQLITE_OPEN_READ_ONLY` |
| `DatabaseSync.exec(sql)` | `db.ts:36` | `Connection::execute_batch` |
| `.prepare(sql)` → `StatementSync` | `db.ts:39` | `Connection::prepare` → `Statement` |
| `stmt.get(...params)` | `db.ts:44` | `stmt.query_row` |
| `stmt.all(...params)` | `db.ts:48` | `stmt.query_map(...).collect()` |
| `stmt.run(...params)` → `{changes:number\|bigint}` | `db.ts:52` | `stmt.execute` → `usize` (**note bigint**, §4) |
| `.close()` (throws on double-close) | `db.ts:90`; guarded `project.ts:188-190` | `Connection` drop (no double-close hazard) |
| positional `?` params, `Uint8Array` blobs | `db.ts:94` (`SqlValue`) | `rusqlite::types` incl. `Vec<u8>` |

**Pragmas issued** (`grep` census): `journal_mode = WAL`
(`db.ts:29`), `foreign_keys = ON` (`:31`), `busy_timeout = 5000`
(`:31`), `query_only = ON` (read-only, `:24`), `wal_checkpoint(TRUNCATE)`
(`service.ts:240,297`), `quick_check` + `foreign_key_check` (recovery,
`recovery.ts:51,56`; migrate `migrate.ts:42`), `defer_foreign_keys = ON`
(root-node cycle, `project.ts:63`), `foreign_keys = OFF`/`ON` around
table-rebuild migrations (`migrate.ts:30,50`). All map to rusqlite
`pragma_update`/`execute_batch`.

**Transaction discipline** (`db.ts:59-82`): savepoint-nested — outermost
is `BEGIN IMMEDIATE`/`COMMIT`, inner levels are `SAVEPOINT
ew_tx_N`/`RELEASE`; a throw rolls back its level, with a `#txDepth`
reset trap for auto-rolled-back deferred-FK failures (`:72-79`,
AI-IMP-084). `BEGIN IMMEDIATE` (not `DEFERRED`) is load-bearing for the
single-writer lock semantics. rusqlite has `Savepoint` but the depth
bookkeeping + the auto-rollback trap must be reproduced by hand.

**Bespoke SQLite features that must survive the port** (grep census):
- **FTS5 external-content virtual tables** (`0003-fts.ts:35-125`):
  `note_fts`/`tag_fts`/`asset_fts` are `content=`-backed;
  `canvas_text_fts` is contentless-with-copy because its source is
  `json_extract(decoration.data,'$.text')` (`:14-16,97-125`). Maintained
  by **AFTER INSERT/UPDATE/DELETE triggers** on the base tables. Rebuild
  via `INSERT INTO x(x) VALUES('rebuild')` (`search.ts:34-45`);
  integrity probe via `INSERT INTO x(x,rank) VALUES('integrity-check',1)`
  (`recovery.ts:161`). MATCH expressions are hand-quoted per token
  (`search.ts:18-22`).
- **json1** `json_extract` (`0003-fts.ts:102,111,125`; `search.ts:43`) —
  decoration `data` is a JSON blob column.
- **`STRICT` tables** ×23 (`migrations/*.ts`) — every table.
- **`VACUUM INTO ?`** (`project-export.ts:278`) — the consistent-copy
  primitive for export. No streaming alternative.
- No custom SQL functions, no `ATTACH`, no `COLLATE`, no `WITHOUT
  ROWID`, no generated columns (grep-confirmed) — **the SQLite surface
  is vanilla-plus-FTS5-plus-json1**, both bundled in rusqlite.

Identity/hash generation is app-level, NOT SQLite: `uuidv7()`
(`@ew/domain`, used in every handler) and streaming `sha256`
(`node:crypto` in `pipeline.ts:9`, `project-export.ts:1`). Rust: `uuid`
+ `sha2` crates. No `randomblob`/`hex` SQLite reliance.

### 2b. Filesystem patterns (sync vs stream, atomicity, fsync)

- **Content-addressed store layout** (`import/store.ts`):
  `assets/<hash[0:2]>/<hash>` (`:30-32`), `derivatives/thumbnails/
  <hash>.webp` (`:43-45`), `cache/import-tmp/<importId>/` (`:53-55`).
  **This layout is a cross-process contract** — main resolves it too
  (§3, L1). Rust must reproduce the exact sharding and filenames.
- **Atomic move into store** (`store.ts:69-87`): `stat` for dedupe →
  `mkdir -p` → `rename` (same-volume atomicity; temp lives under project
  dir). Rust: `std::fs::rename` (same guarantee).
- **Atomic derivative write** (`derivatives.ts:141-146`): `writeFileSync`
  to `<dest>.tmp-<jobId>` then `renameSync`.
- **Streaming**: import copy/hash use `createReadStream` +
  `copyFile`/`writeFile` async so multi-hundred-MB files never block
  (`pipeline.ts:118-121,168`). Export uses `createReadStream`/
  `createWriteStream` + `node:stream` pipe (`project-export.ts:379-395`).
  Rust: `tokio::fs`/`std::io` streaming or memmap.
- **fsync durability** (`project-export.ts:409-415`): open the finished
  partial `r`, `fh.sync()` (fsync per-inode), close — BEFORE the atomic
  rename. Rust: `File::sync_all`.
- **Atomic export promote** (`project-export.ts:377,427`): write to
  `<dest>.partial-<uuid>`, fsync, verify (re-open zip, re-hash every
  manifest entry, `:185-202`), then `renameSync` into place — the only
  line that touches `destPath`. CA-009 discipline.
- **`mkdtemp`** for private staging: export staging in OS temp
  (`project-export.ts:269`), restore throwaway git index
  (`snapshot.ts:708`). Orphan sweep by mtime age (`project-export.ts:
  110-128`, 24 h cutoff). Rust: `tempfile` crate.
- **Recovery fs sweeps** (`recovery.ts`): `readdirSync`/`existsSync`/
  `rmSync` over pending imports, import-temp, orphan blobs.

### 2c. The single-writer lock protocol (`lock.ts`, AI-IMP-226)

The subtlest node-ism; a Rust port MUST reproduce the exact syscall
semantics or reintroduce the split-brain CA-001 fixed here:

- **Single-winner acquire**: `writeFileSync(path, payload, {flag:'wx'})`
  = `O_EXCL` create; `EEXIST` means contended (`lock.ts:131-134`). Rust:
  `OpenOptions::new().write(true).create_new(true)`.
- **Reclaim serializer**: `mkdirSync(guardPath)` atomic single-winner
  directory; exactly one reclaimer may remove a stale owner file
  (`:216-259`). Rust: `std::fs::create_dir` (atomic, `EEXIST`).
- **Liveness probe**: `process.kill(pid, 0)` → `ESRCH` = dead
  (`:302-310`). Rust: `kill(pid, 0)` via `nix`/`libc`; PID-reuse errs
  safe.
- **Heartbeat timer**: `setInterval` refresh via temp-write + `rename`
  (`:109-166`); `unref()` so it doesn't hold the loop (`:110`). Rust: a
  background thread/tokio interval + `AtomicBool` released flag.
- **Sub-ms backoff**: `Atomics.wait` on a `SharedArrayBuffer` int32,
  jittered (`:286-292`). Rust: `thread::sleep` with jitter (simpler).
- **Cross-host policy**: `hostname()` comparison; foreign+aged →
  reclaim, same-host-alive → NEVER reclaim (`:199-206`).
- Reclaim-guard staleness 10 s, unreadable grace 1 s, 200-attempt cap
  (`:56,66,74`).

### 2d. Recovery pass ordering (§11.4, `recovery.ts:35-46`)

**Fixed order, must be preserved**: `checkDatabaseIntegrity`
(quick_check + foreign_key_check) → `reconcilePendingImports` (drop any
non-committed import row + its temp) → `sweepImportTemp` (temp dirs with
no row) → `verifyCanonicalBlobs` (missing original = integrity error,
NEVER auto-repaired) → `removeOrphanBlobs` (blobs no asset references) →
`verifySearchIndex` (FTS integrity-check → rebuild all four on failure).
Ordering matters: pending-import reconcile must precede temp-sweep (it
clears the rows so leftovers are orphans by definition, `:95-96`), and
orphan-blob removal reads the reconciled asset set. Runs on EVERY
writable open (read-only opens skip it entirely, `service.ts:150-156`).

### 2e. WAL / checkpoint rituals

- Writable open sets `journal_mode=WAL` once (`db.ts:29`); read-only
  opens inherit whatever the writable life left (`db.ts:22-26`).
- `checkpoint()` = `PRAGMA wal_checkpoint(TRUNCATE)` — returns the -wal
  to zero so `.sqlite` is complete at rest for a cloud daemon
  (`service.ts:235-241`, protocol `:255-259`).
- Export order (mirrors the snapshot moment, `service.ts:282-299`):
  `writeNotesTree` → `wal_checkpoint(TRUNCATE)` → `VACUUM INTO`. This
  ordering is a hard contract, not incidental.

### 2f. child_process git — the snapshot engine (`apps/desktop/src/main/snapshot.ts`, 775 LOC)

**Lives in MAIN, not persistence** (`:31-36` "owns the git mechanics …
while the single-writer discipline is honoured by delegating every DB
touch … to the utility"). Every DB touch (checkpoint, notes-tree) round-
trips the protocol; git itself is pure shell-out. Surface a Rust port
reproduces (`execFileAsync('git', …)`, `:52,220`):

- Feature-detect `git --version` once (`:212`).
- `init -q` + `symbolic-ref HEAD refs/heads/main` (`:339-342`).
- `config user.email/user.name/commit.gpgsign=false` locally when unset
  (`:347-356`).
- Stage an **allowlist only** — `add -- project.sqlite notes assets
  .gitignore`, never `add -A` (`:124,403`, Sol CA-010); empty-diff guard
  via `diff --cached --name-only` (`:410`); `commit -q -m <msg>` (`:412`).
- `.git/index.lock` age-gated sweep (`:304-329`, AI-IMP-218).
- Managed `.gitignore` block with versioned BEGIN/END sentinels +
  in-place v1→v2 migration (`:81-115,235-262`).
- Push: dedicated `ew-snapshots` remote, `push HEAD:refs/heads/main`,
  `GIT_TERMINAL_PROMPT=0`, unpushed-debt via `rev-list --count
  <ref>..HEAD` (`:204-207,429-491`).
- Restore: `read-tree` into a throwaway `GIT_INDEX_FILE` in OS temp →
  `checkout-index --all --force --prefix=<dest>/` (`:691-755`), then a
  SQLite-magic-header sanity check (`openSync`+`readSync` 16 bytes,
  `:674-689`).
- `listSnapshots`: `log --pretty=format:%H%x1f%cI%x1f%s`, split on ASCII
  Unit Separator (`:630-651`).
- Idle timer `setTimeout(IDLE_MS)` (`:565-575`), serialize snapshots on
  an `inFlight` promise chain, pushes on a SEPARATE `pushChain`
  (`:194-200`).

Rust: `std::process::Command`, `git2`/`gix`, or shell-out preserved. The
benchmark decision (`:38-49`, system-git beats isomorphic-git because
its cost scales with change not project size) transfers unchanged — a
Rust port would keep shelling to system git, not use `gix`, for the same
reason.

---

## 3. Leaks through the seam (behaviour assumed beyond the protocol types)

These are the couplings that make "clean seam" partly aspirational. A
Rust port that reproduced only the 22 message types would break each.

**L1 — Asset bytes bypass the protocol entirely; main reads the store
layout directly. [BIGGEST LEAK]** `apps/desktop/src/main/index.ts:6`
imports `blobRelativePath, thumbnailRelativePath` from `@ew/persistence`
and the `ew-asset://` protocol handler resolves `<hash>` →
`join(servingDir, blobRelativePath(hash))` and `net.fetch`es the file
off disk (`:334-381`). Textures — the dominant read volume — NEVER cross
the utility seam. Consequences for a Rust port: (a) the content-address
layout `assets/<h[0:2]>/<hash>` and `derivatives/thumbnails/<hash>.webp`
is a **shared on-disk contract** between the Rust store and the main-
process asset server, not an internal detail; (b) main also tracks
`secondaryDirs` (`:237,1026`) to re-root `?scope=source` reads —
project-directory *paths* cross main↔utility implicitly (open-secondary
returns ok, main records the dir it passed). The renderer builds these
URLs by hand: `ew-asset://${contentHash}/thumb` and
`ew-asset://${contentHash}` (`renderer/canvas/place-mode.ts:145,151`;
`renderer/assets/thumbnails.ts:54`), assuming a 64-hex-char sha256
(regex-enforced in main `:324-325`).

**L2 — Error `code` STRINGS are parsed by the renderer.** The renderer
branches on specific codes, not just `status`:
- `TAG_NAME_CONFLICT` (`renderer/tags/tag-assign.ts:68`),
  `TAG_ALREADY_ASSIGNED` (`:93`) — domain codes from handlers.
- `NO_SECONDARY` / `NO_PROJECT` (`renderer/chrome/mirror.ts:236`) to
  decide the library is closed.
- `UTILITY_DIED` is main-synthesized on a dead process
  (`main/index.ts:47,57`) — a code that exists ONLY at the main seam,
  not in any handler. A Rust port must preserve every domain code string
  AND main's synthetic ones.

**L3 — `CommandResult.status` discriminant is load-bearing in ≥10
renderer sites.** `committed`/`error`/`conflict` are switched at
`note/panels.ts:429,806-807`, `note/note-editor.ts:198,286,350-351`,
`canvas/board-tooling.ts:104-105,300`, `canvas/place-mode.ts:48-49`,
`canvas/gestures-ui.ts:289`, `canvas/import-surfaces.ts:57-58`,
`canvas/host.ts:1244`, `menus/ContextMenu.ts:77-78`,
`tags/tag-assign.ts` — plus `conflict` → "the project changed
underneath (retry)" copy everywhere. And `committed.inverse` feeds the
undo stack. This is the `@ew/commands` contract (§1c), stable, but it is
a leak in the sense that the *renderer imports the persistence
vocabulary package directly* rather than going through `packages/protocol`.

**L4 — Timing / lifecycle assumptions.** (a) The idle-snapshot clock is
driven by the *event push stream* — every `project-changed` resets it
(`main/index.ts:145`), so a Rust utility must keep pushing one event per
commit or backups silently stop. (b) The thumbnail claim loop tolerates
`NO_PROJECT` as a benign race during startup
(`renderer/assets/thumbnails.ts:92` comment). (c) CLAUDE.md's own
warning: "never read `items()`/camera synchronously after navigateTo" —
the renderer already assumes async scene application; the utility's
synchronous-commit-then-async-event-push shape is baked in.

**L5 — `err.code` passthrough of node errno / DomainError codes.**
`init-project`, `import-asset`, `open-secondary`, `import-project`,
`ingest-from-secondary` all do `'code' in err ? err.code : FALLBACK`
(`utility:64-68,164-168,255-258,333-336,381-385`). So a node errno
(`EACCES`, `ENOENT`) or a `DomainError` code can surface verbatim to the
renderer. A Rust port must map its error taxonomy onto the same string
codes the renderer/tests expect (`EW_READ_ONLY`, `EW_SCHEMA_AHEAD`,
`EW_SCHEMA_MISMATCH`, `PROJECT_LOCKED`, `IMPORT_*`, …).

**What is genuinely clean:** the request/response envelope
(`{id, payload}` correlation, `main/index.ts:158-168`) is a trivial
transport a Rust utility reproduces in a few lines. Main's dead-utility
synthesis (`deadResponse`, `:39-59`) and restart/recovery loop
(`:75-110`) are transport concerns that survive a persistence swap
untouched — they don't reach into persistence internals.

---

## 4. Rust mapping (rusqlite/SQLx fit)

**Driver choice: rusqlite, not SQLx.** SQLx's compile-time query
checking and async model fight this design — the code is synchronous,
savepoint-nested, pragma-heavy, and leans on FTS5 + json1 which SQLx
treats as opaque. rusqlite is a thin libsqlite3 wrapper: same mental
model as the `node:sqlite` `DatabaseSync` seam, `bundled` feature ships
the same SQLite (FTS5 + json1 compile-in via `bundled`/`bundled-full`).
`db.ts`'s 9-method surface (§2a) maps 1:1 to rusqlite.

| node:sqlite feature | rusqlite fit | Friction |
|---------------------|--------------|----------|
| `DatabaseSync` open/exec/prepare/get/all/run | `Connection` + `Statement` | clean 1:1 |
| `{changes: number\|bigint}` | `execute` → `usize` | **node returns bigint for large changes**; Rust `usize`/`i64` is cleaner, but any code reading `changes` as `bigint` must be re-typed |
| savepoint transaction w/ depth trap | `Connection::savepoint` + manual depth | must hand-port the `#txDepth` reset trap (`db.ts:72-79`) |
| WAL / busy_timeout / foreign_keys pragmas | `pragma_update` / `busy_timeout` builder | clean |
| `wal_checkpoint(TRUNCATE)` | `pragma_update(None,"wal_checkpoint","TRUNCATE")` or `execute_batch` | clean |
| `quick_check`/`foreign_key_check` | `query_map` over pragma | clean |
| `VACUUM INTO ?` | `execute("VACUUM INTO ?1", [path])` | clean — this is the export lifeline |
| FTS5 external content + triggers | works under `bundled` | triggers are plain SQL in migrations — **no code change**, they live in `0003-fts.ts` DDL |
| json1 `json_extract` | works under `bundled` | clean |
| STRICT tables | SQLite ≥3.37, in `bundled` | clean |
| `Uint8Array` blob params | `Vec<u8>`/`&[u8]` | clean |
| readOnly connection + `query_only` | `OpenFlags::SQLITE_OPEN_READ_ONLY` | clean |

**Migration strategy.** The `migrate()` chain (`migrate.ts:9-60`) is
already driver-agnostic: a `migrations` table, an applied-set, ordered
`MIGRATIONS` each `{id, name, sql, disableForeignKeys?}` run in its own
transaction, `foreign_key_check` after FK-disabled rebuilds,
`LATEST_SCHEMA_VERSION` stamped into `project.schema_version`. **The SQL
strings are the migrations** (`migrations/0001-0007`) — they port
verbatim; only the ~50-line driver loop is rewritten. The FK-OFF-at-
connection-level dance for table rebuilds (`migrate.ts:28-51`) needs
rusqlite's `pragma_update` at the connection (not inside the txn) — a
known, documented constraint that transfers directly. The
schema-ahead/behind refusal (`project.ts:147-164`, codes
`EW_SCHEMA_AHEAD`/`EW_SCHEMA_MISMATCH`) ports as-is.

**What has NO clean Rust equivalent (must be hand-built):**
1. `Atomics.wait` sub-ms backoff (`lock.ts:286-292`) — trivial to
   replace with `thread::sleep`, so "no equivalent" but "easy."
2. `process.parentPort` / `utilityProcess.fork` IPC (`utility:36,568`;
   `main:113,166`) — Electron-specific. A Rust utility under **Tauri**
   would be an in-process Rust module or a sidecar over a byte channel,
   NOT a forked node process. This is the seam that changes *shape*, not
   just language (see §5 and tauri-shell seam #8). The `{id,payload}`
   correlation is reproducible; the *transport* is not a port, it's a
   redesign — but a small, well-understood one.
3. Streaming `sha256` while piping (`pipeline.ts:168`) — `sha2` +
   `std::io::copy` through a hashing writer; clean but hand-written.
4. yazl/yauzl `.ewproj` zip (STORED assets, DEFLATE db/notes, CRC verify
   on read) — `zip` crate covers it, but the lazy-entry/verify dance
   (`project-export.ts:143-202`, `project-import.ts`) is re-implemented,
   not translated.
5. The git snapshot engine (§2f) — re-homed, shell-out preserved.

Nothing in this list is *structural*. Every item is a nameable unit with
a known Rust crate.

---

## 5. Verdict

**The bet holds, with one correction to its framing. YES — a Rust
persistence port is a bounded, fenced project, but the fence is not
"`packages/protocol`" alone; it is protocol + the two command/query
namespaces + two main-process subsystems (asset server, snapshot
engine) that reach into the store layout.** Nothing structural leaks —
there is no hidden coupling that would make the port unbounded — but the
scope is ~40% larger than "swap the SQLite driver" implies, and the
single genuine reshape (the fork-IPC transport) is a consequence of
leaving Electron, already owned by the Tauri spike (SPIKE-REPORT-004),
not by this port.

Why bounded: (1) ALL driver contact is one file (`db.ts`, §2a) behind a
9-method surface. (2) The SQLite feature set is vanilla + FTS5 + json1,
all in rusqlite `bundled` — no custom functions, no ATTACH, no exotic
pragmas. (3) Migrations ARE their SQL strings; only a 50-line loop is
rewritten. (4) The recovery pass, lock protocol, and WAL rituals are
fully specified in-code with dense rationale comments (AI-IMP-226/096/
084 all leave a paper trail). (5) The audit's own layering assessment
(`CODE-AUDIT §Architecture`, `:42`) confirms "the intended layering is
present and generally respected" — the seam is real, the leaks are at
async ownership boundaries (`:44`), not in the storage contract.

### Recommended port order (lowest-risk first)

1. **`db.ts` + migrations** — the driver seam + the verbatim SQL chain.
   Prove FTS5 triggers + json1 + STRICT + VACUUM INTO all run under
   rusqlite `bundled`. Ends with a Rust binary that opens an existing
   `project.sqlite` and passes `quick_check`. *Fenced, no protocol.*
2. **Dispatcher + command/query registries** — the 64 commands + 38
   queries. This is the bulk of the LOC (`handlers/*` ≈ 5k) but it is
   pure SQL-over-`db`, mechanical to translate, and every handler has a
   test. Preserve every domain error-code string (L2). *Fenced.*
3. **Lock + recovery + import/store layout** — reproduce O_EXCL+mkdir
   exactly (§2c) and the recovery order (§2d); keep the content-address
   layout byte-identical (L1 depends on it). *Fenced; the highest-care
   item.*
4. **Import/export pipeline** (staged import, `.ewproj` zip, VACUUM
   INTO, fsync+atomic-rename). *Fenced.*
5. **The transport** — replace `utilityProcess.fork`/`parentPort` with
   the Tauri in-process or sidecar channel. This is where the port meets
   the shell spike; do it LAST and jointly. *Reshape, not translation.*
6. **Re-home the asset server (L1) and snapshot engine (§2f)** into the
   Rust/Tauri main. These were always main-process code; they move
   sideways, not down.

### Top-5 risks, ranked

1. **The lock protocol (`lock.ts`).** CA-001 was a P1 split-brain here;
   the AI-IMP-226 fix depends on precise `O_EXCL` + `mkdir` + `kill(pid,
   0)` semantics. A Rust reimplementation that subtly differs (e.g.
   Windows `create_new` vs POSIX, or a different heartbeat race) can
   silently reintroduce two live writers — the worst failure class in
   the app. **Port it with the existing 32-process contention probe
   (`lock-probe.spec.ts`) as the acceptance gate.**
2. **The asset-read layout leak (L1).** Main and the renderer both hard-
   code the store path shape. A Rust store that changed sharding, or a
   Tauri asset handler that didn't import the identical layout, breaks
   every texture with no type error to catch it. Cross-boundary, no
   compiler help.
3. **FTS5 external-content + triggers under a different SQLite build.**
   The four corpora, their triggers, and the `rebuild`/`integrity-check`
   idioms (`0003-fts.ts`, `search.ts`, `recovery.ts:161`) must behave
   identically. `bundled` should match, but tokenizer/version drift is a
   data-visible risk — verify search results byte-for-byte on a real
   corpus, not just "it compiles."
4. **Error-code string fidelity (L2/L5).** The renderer parses code
   strings and main synthesizes `UTILITY_DIED`. A Rust error taxonomy
   that doesn't map onto every expected string leaves the renderer with
   dead branches (undo, tag-conflict, library-closed detection) — silent
   UX regressions, not crashes.
5. **The `number|bigint` changes type + revision monotonicity.** Small,
   but the optimistic-concurrency contract (`expectedProjectRevision` →
   `conflict`) is exact; an off-by-one or a bigint/i64 mismatch in
   `changes`-dependent handler logic corrupts undo/redo invariants.

### What surprised me (candid)

- **Asset bytes never touch the protocol.** I expected the "clean seam"
  to carry everything; instead the highest-volume read path (textures)
  is a *direct filesystem read from main* using an imported persistence
  helper (L1). The protocol is clean precisely *because* the expensive
  path was routed around it. That's good engineering, but it means "port
  persistence behind the protocol" understates the real contract surface
  — the on-disk layout is as load-bearing as the message types.
- **The snapshot engine is 775 lines of git in MAIN, filed under
  "persistence" by the ticket.** It delegates every DB touch back over
  the protocol and does pure shell-out, so it's cleanly separable — but
  anyone scoping "the persistence port" from the ticket alone would miss
  that a big chunk of the work lives in a different process and a
  different package.
- **The renderer imports `@ew/commands` directly** (by explicit design,
  `envelope.ts:4`), so `packages/protocol` is NOT the whole renderer-
  facing contract — the command/result vocabulary is a second, larger
  seam. The bet's phrasing ("seamed behind packages/protocol") is true
  for the *process* boundary but incomplete for the *type* boundary.
- **How little is bespoke SQLite.** I expected custom functions or exotic
  pragmas; there are none. The scariest features (FTS5, VACUUM INTO,
  STRICT, json1) are all stock-SQLite-in-rusqlite. The port's difficulty
  is concentrated in the *lock* and the *layout contract*, not the SQL.
