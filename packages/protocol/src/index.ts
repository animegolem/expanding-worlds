import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'

/**
 * Shared request/response types for the Project API seam
 * (RFC-0001 §11.3). The renderer, preload, main router, and project
 * utility process all speak these shapes; no other contract exists
 * across the process boundary.
 */

export const PACKAGE_NAME = '@ew/protocol' as const

export interface PingRequest {
  type: 'ping'
}

export interface PingResponse {
  pong: true
  from: 'utility'
}

export interface InitProjectRequest {
  type: 'init-project'
  dir: string
  createIfMissing: boolean
  title?: string
}

export interface ProjectInfo {
  projectId: string
  rootNodeId: string
  rootCanvasId: string
  revision: number
}

/** §11.4 startup-recovery outcome surfaced with a successful open. */
export interface RecoverySummary {
  repairs: string[]
  integrityErrors: string[]
}

export type InitProjectResponse =
  | { type: 'init-project'; ok: true; project: ProjectInfo; recovery: RecoverySummary }
  | { type: 'init-project'; ok: false; code: string; message: string }

export interface CloseProjectRequest {
  type: 'close-project'
}

export interface CloseProjectResponse {
  type: 'close-project'
  ok: true
}

export interface ExecuteCommandRequest {
  type: 'execute-command'
  envelope: CommandEnvelope
}

export interface ExecuteCommandResponse {
  type: 'execute-command'
  result: CommandResult
}

export interface RunQueryRequest {
  type: 'run-query'
  name: string
  args?: unknown
}

export type RunQueryResponse =
  | { type: 'run-query'; ok: true; result: unknown }
  | { type: 'run-query'; ok: false; code: string; message: string }

/** §11.2/§11.3 import endpoints; implemented by AI-IMP-014. */
export interface ImportAssetRequest {
  type: 'import-asset'
  originalFilename: string
  bytes: Uint8Array
  sourceUrl?: string
}

export type ImportAssetResponse =
  | { type: 'import-asset'; ok: true; assetId: string; deduplicated: boolean }
  | { type: 'import-asset'; ok: false; code: string; message: string }

/** §11.5 project-tier setting write (AI-IMP-074): deliberately a
 * separate verb from execute-command — settings are preferences, not
 * content edits, and never enter command history. Reads go through
 * the ordinary run-query verb (getSettings). */
export interface SetSettingRequest {
  type: 'set-setting'
  key: string
  value: unknown
}

export type SetSettingResponse =
  | { type: 'set-setting'; ok: true }
  | { type: 'set-setting'; ok: false; code: string; message: string }

/** §11.2 renderer-driven thumbnail pipeline (AI-IMP-076): the
 * renderer claims the oldest queued job, decodes/resizes/encodes
 * with Chromium codecs, and submits WebP bytes back; the utility
 * owns the queue and the derivative files. Claiming does not lock —
 * a dead renderer leaves the job queued and the pipeline heals. */
export interface ClaimThumbnailJobRequest {
  type: 'claim-thumbnail-job'
}

export interface ThumbnailJobInfo {
  jobId: string
  assetId: string
  contentHash: string
  mimeType: string
}

export type ClaimThumbnailJobResponse =
  | { type: 'claim-thumbnail-job'; ok: true; job: ThumbnailJobInfo | null }
  | { type: 'claim-thumbnail-job'; ok: false; code: string; message: string }

export interface SubmitThumbnailRequest {
  type: 'submit-thumbnail'
  jobId: string
  /** WebP bytes; null marks the job failed (undecodable source).
   * The asset identity and hash come from the JOB on the service
   * side — the renderer is never trusted with a path component. */
  bytes: Uint8Array | null
}

export type SubmitThumbnailResponse =
  | { type: 'submit-thumbnail'; ok: true }
  | { type: 'submit-thumbnail'; ok: false; code: string; message: string }

/** §11.1/§14.4 secondary project slots (AI-IMP-088): a SOURCE opens
 * read-only (browse/ingest-from; replace-on-open), the LIBRARY opens
 * writable under the ordinary lock (the inbox mirror's target). Both
 * live beside the primary; a dead secondary never takes it down. */
export type SecondaryTarget = 'source' | 'library'

export interface OpenSecondaryRequest {
  type: 'open-secondary'
  target: SecondaryTarget
  dir: string
  /** §14.4 create-new library (AI-IMP-094): LIBRARY target only — a
   * source opens read-only, so creating one is refused in the
   * utility. When the open creates a fresh project, the bundled
   * example set is seeded into it through ordinary commands. */
  createIfMissing?: boolean
  title?: string
  /** Bundled seed-asset directory, resolved by MAIN (the utility
   * knows no app paths). Only consulted when the open creates. */
  seedDir?: string
}

export type OpenSecondaryResponse =
  | {
      type: 'open-secondary'
      ok: true
      project: ProjectInfo
      /** AI-IMP-094: true when this open created the project. */
      created?: boolean
      /** True when the first-open example set landed (create only). */
      seeded?: boolean
    }
  | { type: 'open-secondary'; ok: false; code: string; message: string }

export interface CloseSecondaryRequest {
  type: 'close-secondary'
  target: SecondaryTarget
}

export interface CloseSecondaryResponse {
  type: 'close-secondary'
  ok: true
}

/** §4.8 one tag universe (AI-IMP-271): the utility owns both writable
 * project handles, so synchronization crosses the process boundary as
 * this deliberately narrow verb rather than a generic secondary execute
 * capability. */
export interface SyncTagsRequest {
  type: 'sync-tags'
  direction: 'pull' | 'push'
  /** Main resolves the app-level designation. Absent means a clean,
   * automatic no-op; the renderer never supplies a filesystem target. */
  libraryDir?: string
}

export type SyncTagsResponse =
  | {
      type: 'sync-tags'
      ok: true
      added: number
      skipped?: 'no-library' | 'same-project' | 'unavailable'
    }
  | { type: 'sync-tags'; ok: false; code: string; message: string }

/** Explicit delete-dialog preflight. It may ensure the configured writable
 * slot is open, but it never performs a settle/sync. */
export interface PrepareTagSyncLibraryRequest {
  type: 'prepare-tag-sync-library'
  libraryDir?: string
}

export type PrepareTagSyncLibraryResponse =
  | { type: 'prepare-tag-sync-library'; ok: true; available: true }
  | { type: 'prepare-tag-sync-library'; ok: true; available: false; reason: string }

/** The delete-scope dialogue's only cross-project write. The library
 * lookup remains name_key based; no arbitrary command envelope crosses. */
export interface DeleteLibraryTagRequest {
  type: 'delete-library-tag'
  /** Main resolves the app-level designation; absent is a typed refusal
   * so the explicit delete surface can show its disabled reason. */
  libraryDir?: string
  nameKey: string
}

export type DeleteLibraryTagResponse =
  | { type: 'delete-library-tag'; ok: true; deleted: boolean }
  | { type: 'delete-library-tag'; ok: false; code: string; message: string }

export interface SecondaryQueryRequest {
  type: 'secondary-query'
  target: SecondaryTarget
  name: string
  args?: unknown
}

export type SecondaryQueryResponse =
  | { type: 'secondary-query'; ok: true; result: unknown }
  | { type: 'secondary-query'; ok: false; code: string; message: string }

/** Import INTO the library slot (mirror direction); the source slot
 * is read-only by construction and refuses at the service. */
export interface SecondaryImportRequest {
  type: 'secondary-import'
  target: SecondaryTarget
  originalFilename: string
  bytes: Uint8Array
  sourceUrl?: string
}

export type SecondaryImportResponse =
  | { type: 'secondary-import'; ok: true; assetId: string; deduplicated: boolean }
  | { type: 'secondary-import'; ok: false; code: string; message: string }

/** §14.4 ingest-by-copy (AI-IMP-090): pull one asset (identified by
 * content hash) plus its tag facts from a secondary INTO THE PRIMARY,
 * applying the session's tag border. Bytes hash-copy through the
 * ordinary staged pipeline (dedupe free); carried tags find-or-create
 * by name_key. The border is 'none' | 'all' | picked tag names. */
export interface IngestFromSecondaryRequest {
  type: 'ingest-from-secondary'
  target: SecondaryTarget
  contentHash: string
  border: 'none' | 'all' | string[]
}

export type IngestFromSecondaryResponse =
  | {
      type: 'ingest-from-secondary'
      ok: true
      nodeId: string
      assetId: string
      deduplicated: boolean
      /** §14.4 provenance: the source project's id — no schema home
       * in Phase 1, so it rides the response for the caller. */
      sourceProjectId: string
    }
  | { type: 'ingest-from-secondary'; ok: false; code: string; message: string }

/** §14.4 first-open seed (AI-IMP-094): trash every node carrying
 * the 'example' tag in the LIBRARY slot — the seeded example plus
 * its explainer — through ordinary TrashNode commands. Honest v1 of
 * the RFC's "the explainer note's one power": the explainer lives in
 * the library while the user stands in a primary project, so the
 * clear action crosses the seam as a verb instead of a note
 * affordance (recorded for the RFC consistency pass at epic close). */
export interface ClearLibraryExampleRequest {
  type: 'clear-library-example'
}

export type ClearLibraryExampleResponse =
  | { type: 'clear-library-example'; ok: true; trashed: number }
  | { type: 'clear-library-example'; ok: false; code: string; message: string }

/** §14.4 inbox mirror (AI-IMP-092): the INVERSE of ingest — read the
 * just-imported bytes from the PRIMARY and ingest them into the
 * LIBRARY slot as an unplaced node with provenance. Border is always
 * 'none' on this direction: world curation never leaks into the
 * library; library tags travel the other way via recognition. */
export interface MirrorToLibraryRequest {
  type: 'mirror-to-library'
  contentHash: string
}

export type MirrorToLibraryResponse =
  | { type: 'mirror-to-library'; ok: true; nodeId: string; assetId: string; deduplicated: boolean }
  | { type: 'mirror-to-library'; ok: false; code: string; message: string }

/** §11.4 involuntary end-session (AI-IMP-096): checkpoint-and-truncate
 * the WAL so the .sqlite is complete at rest — no live -wal for a
 * cloud daemon to sync. No args: acts on the open PRIMARY and any
 * WRITABLE secondary (the library takes mirror writes). Read-only
 * services and a closed project no-op ok:true — nothing to flush. */
export interface CheckpointWalRequest {
  type: 'checkpoint-wal'
}

export type CheckpointWalResponse =
  | { type: 'checkpoint-wal'; ok: true }
  | { type: 'checkpoint-wal'; ok: false; code: string; message: string }

/** §11.4 session snapshots (AI-IMP-120): the per-project setting enum,
 * stored as an ordinary project-tier setting (key `snapshot_mode`) —
 * `off`, `git commit`, or `commit + push`. The push variant stores the
 * enum only in this ticket; push execution is AI-IMP-122. */
export type SnapshotMode = 'off' | 'commit' | 'commit-push'
export const SNAPSHOT_MODE_KEY = 'snapshot_mode'

/** §4.9 rev 0.38 drop behavior (AI-IMP-129): what a multi-image
 * drop/paste does, stored as an ordinary project-tier setting (key
 * `drop_behavior`, no migration — the settings table like
 * `snapshot_mode`). `ask` shows the once-per-drop modal (the §14.4
 * first-drop ask idiom) and is the default; the three concrete values
 * skip the modal and apply directly. `sort` compact-packs the set in
 * place (§6.9 packer, default key); `group` draws a frame around the
 * set and captures it; `group-and-sort` does both. `keep-separate`
 * (dismiss/idle) is NOT a stored value — it is the transient fallback
 * an unanswered ask lands on, matching the mirror ask's ignore-is-
 * dismissal posture. */
export type DropBehavior = 'ask' | 'sort' | 'group' | 'group-and-sort'
export const DROP_BEHAVIOR_KEY = 'drop_behavior'
/** The stored (non-`keep-separate`) values, in Settings-row order. */
export const DROP_BEHAVIOR_VALUES: readonly DropBehavior[] = [
  'ask',
  'sort',
  'group',
  'group-and-sort',
]
/** §4.9 per-frame sort-on-drop flag (AI-IMP-129): keyed by the FRAME
 * PLACEMENT id (`frame_sort_on_drop:<placementId>`), stored in the
 * same settings table (no migration). Absent means ON — a freshly
 * drawn frame arranges drops within itself with no write; the toggle
 * only ever writes `false` to turn it off (and deletes back to ON is
 * modelled as writing `true`). Keyed by placement, not node, because
 * the behavior is a property of the on-canvas region a drop lands in
 * (capture is per placement), and a frame node is reusable across
 * canvases. */
export const FRAME_SORT_ON_DROP_PREFIX = 'frame_sort_on_drop:'

/** §16 readable notes tree write (AI-IMP-120): regenerate `notes/` on
 * the service's single writer and return counts for the commit message.
 * A separate verb from checkpoint-wal because a snapshot writes the
 * tree (and refreshes §7.8 blocks) BEFORE the WAL truncate that seals
 * project.sqlite. No args: acts on the open primary. */
export interface SnapshotWriteNotesRequest {
  type: 'snapshot-write-notes'
}

export type SnapshotWriteNotesResponse =
  | { type: 'snapshot-write-notes'; ok: true; notes: number; assets: number }
  | { type: 'snapshot-write-notes'; ok: false; code: string; message: string }

/** §11.4 Settings readout (AI-IMP-120): whether system git is present
 * (snapshots degrade to a visible note when absent) and the backup's
 * on-disk size — du of `.git` plus the uncommitted working delta,
 * computed lazily when Settings opens. `sizeBytes` is null before any
 * repository exists. */
export interface SnapshotStatus {
  gitAvailable: boolean
  sizeBytes: number | null
}

/** §11.4 remote push (AI-IMP-122): the per-project remote URL for the
 * `commit-push` variant, stored as an ordinary project-tier setting
 * (key `snapshot_remote`) — no migration, travels with export/import.
 * Empty/unset means no remote, and NOTHING network-shaped runs unless
 * mode is `commit-push` AND this is a non-empty URL (§11.5 constitution:
 * deliberate opt-in, never ambient). Credentials are never stored — auth
 * is the system's (ssh agent / git credential helper). */
export const SNAPSHOT_REMOTE_KEY = 'snapshot_remote'

/** §11.4 Test connection (AI-IMP-122): the deliberate `git ls-remote`
 * probe behind the Advanced "Test connection" action. Never runs
 * ambiently — only on the button. Failure carries a short human message
 * (the git stderr tail) so the Settings copy can explain the problem. */
export type SnapshotTestConnectionResult = { ok: true } | { ok: false; message: string }

/** §11.4/§8.6 remote push state (AI-IMP-122): main → renderer broadcast
 * for the ongoing-push perch and the single-per-episode failure toast.
 * `unpushed` is commits ahead of the remote tracking ref (`git rev-list
 * --count`), the backup debt. `phase`:
 *  - `pushing` — a background push is in flight (perch shows it, §8.6);
 *  - `idle`    — reconciled (`unpushed` 0 clears the perch), or nothing
 *                to push;
 *  - `error`   — the last push failed; the perch shows the debt and the
 *                next snapshot retries. `message` carries the failure
 *                detail ONLY on the transition into error, so the
 *                renderer toasts once per episode, not per retry. */
export interface SnapshotPushState {
  phase: 'pushing' | 'idle' | 'error'
  unpushed: number
  message?: string
}

/** §11.4 restore-from-backup (AI-IMP-121): one row of the dated
 * snapshot picker — the commit's short SHA (the restore handle), its
 * committer ISO timestamp, and the generated message. Produced by
 * `git log` over the project's snapshot history in the main process,
 * so this is an IPC-shared shape, not a `ProjectRequest` variant. */
export interface SnapshotEntry {
  /** Full commit SHA — the restore handle. */
  sha: string
  /** Committer date, ISO-8601. */
  isoDate: string
  /** The generated snapshot message (subject line). */
  message: string
}

/** §11.4 restore-from-backup (AI-IMP-121): the outcome of materializing
 * a chosen snapshot into a NEW sibling directory — never in-place. On
 * success `dir` is the absolute path of the created project directory
 * (offered to Open Restored Project); on failure a typed code/message
 * surfaces in the picker. Restore never touches the source project. */
export type RestoreResult =
  | { ok: true; dir: string; openToken: string }
  | { ok: false; code: string; message: string }

/** Renderer-facing import result. The utility's ImportProjectResponse
 * intentionally has no open authority; main adds a sender-bound token
 * only after a successful materialization. */
export type OpenableImportProjectResponse =
  | (Extract<ImportProjectResponse, { ok: true }> & { openToken: string })
  | Extract<ImportProjectResponse, { ok: false }>

/** §16 portable export (AI-IMP-157; container rev 0.57): stream the
 * `.ewproj` archive to a main-chosen destination. Progress rides the
 * uncorrelated event channel as `export-progress`. */
export interface ExportProjectRequest {
  type: 'export-project'
  destPath: string
  activeOnly: boolean
}

export type ExportProjectResponse =
  | {
      type: 'export-project'
      ok: true
      bytesWritten: number
      entries: number
      notes: number
      assets: number
    }
  | { type: 'export-project'; ok: false; code: string; message: string }

/** §16 rev-0.18 live size footer: stat-walk estimate, no archive work. */
export interface ExportEstimateRequest {
  type: 'export-estimate'
}

export type ExportEstimateResponse =
  | { type: 'export-estimate'; ok: true; bytes: number }
  | { type: 'export-estimate'; ok: false; code: string; message: string }

/** Export progress broadcast shape (utility → main → renderer). Media
 * dominates and enters STORED, so written bytes track source bytes —
 * the denominator is the planned source total. */
export interface ExportProgressEvent {
  bytesWritten: number
  bytesTotal: number
}

/** §16 project import (AI-IMP-158): materialize a `.ewproj` into a
 * NEW directory (never merges; coexists with the original). The
 * archive validates manifest-first and hash-verifies while streaming;
 * refusal is typed and leaves nothing on disk. */
export interface ImportProjectRequest {
  type: 'import-project'
  archivePath: string
  destDir: string
  /** Main's filesystem-backed, destination-bound reservation. */
  reservationToken: string
}

export type ImportProjectResponse =
  | {
      type: 'import-project'
      ok: true
      dir: string
      projectId: string
      title: string
      notes: number
      assets: number
    }
  | { type: 'import-project'; ok: false; code: string; message: string }

export type ProjectRequest =
  | PingRequest
  | InitProjectRequest
  | CloseProjectRequest
  | CheckpointWalRequest
  | SnapshotWriteNotesRequest
  | ExecuteCommandRequest
  | RunQueryRequest
  | ImportAssetRequest
  | SetSettingRequest
  | ClaimThumbnailJobRequest
  | SubmitThumbnailRequest
  | OpenSecondaryRequest
  | CloseSecondaryRequest
  | PrepareTagSyncLibraryRequest
  | SyncTagsRequest
  | DeleteLibraryTagRequest
  | SecondaryQueryRequest
  | SecondaryImportRequest
  | IngestFromSecondaryRequest
  | ClearLibraryExampleRequest
  | MirrorToLibraryRequest
  | ExportProjectRequest
  | ExportEstimateRequest
  | ImportProjectRequest

export type ProjectResponse =
  | PingResponse
  | InitProjectResponse
  | CloseProjectResponse
  | CheckpointWalResponse
  | SnapshotWriteNotesResponse
  | ExecuteCommandResponse
  | RunQueryResponse
  | ImportAssetResponse
  | SetSettingResponse
  | ClaimThumbnailJobResponse
  | SubmitThumbnailResponse
  | OpenSecondaryResponse
  | CloseSecondaryResponse
  | PrepareTagSyncLibraryResponse
  | SyncTagsResponse
  | DeleteLibraryTagResponse
  | SecondaryQueryResponse
  | SecondaryImportResponse
  | IngestFromSecondaryResponse
  | ClearLibraryExampleResponse
  | MirrorToLibraryResponse
  | ExportProjectResponse
  | ExportEstimateResponse
  | ImportProjectResponse

/** Main → renderer service health (AI-IMP-053): broadcast when the
 * utility process dies, restarts, or fails to come back. A healthy
 * open carries the §11.4 recovery summary so startup repairs can
 * surface as a toast (AI-IMP-106). */
export interface ServiceStatusEvent {
  status: 'restarting' | 'ok' | 'failed'
  message?: string
  recovery?: RecoverySummary
}

/** Envelope used on the main → utility request channel. */
export interface UtilityEnvelope<T> {
  id: number
  payload: T
}

/** Messages the utility sends to main: correlated responses or pushed events. */
export type UtilityMessage =
  | { kind: 'response'; id: number; payload: ProjectResponse }
  | { kind: 'event'; event: ProjectChangedEvent }
  | { kind: 'thumbnail-ready'; assetId: string; contentHash: string }
  | { kind: 'export-progress'; progress: ExportProgressEvent }

/** Main → renderer broadcast when a thumbnail derivative lands. */
export interface ThumbnailReadyEvent {
  assetId: string
  contentHash: string
}

export type { CommandEnvelope, CommandResult, ProjectChangedEvent }
