import {
  CommandRegistry,
  type CommandEnvelope,
  type CommandResult,
  type ProjectChangedEvent,
} from '@ew/commands'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers, registerAssetQueries } from './handlers/assets'
import { registerBookmarkHandlers } from './handlers/bookmarks'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerDecorationHandlers } from './handlers/decorations'
import { registerFrameHandlers } from './handlers/frames'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPinHandlers } from './handlers/pin'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import {
  claimNextThumbnailJob,
  completeThumbnailJob,
  enqueueMissingThumbnails,
  type ThumbnailJob,
} from './import/derivatives'
import {
  ingestFromSource,
  type IngestInput,
  type IngestResult,
  type IngestSource,
} from './import/ingest'
import { importAsset, type ImportInput, type ImportResult } from './import/pipeline'
import {
  estimateExportSize,
  exportProject,
  type ExportOptions,
  type ExportResult,
} from './export/project-export'
import { writeNotesTree, type NotesTreeResult } from './notes-tree'
import { createProject, DB_FILENAME, openProject, type OpenOptions } from './project'
import { QueryRegistry, registerCoreQueries, type QueryResult } from './queries'
import { registerGalleryQueries } from './queries-gallery'
import { registerLifecycleQueries } from './queries-lifecycle'
import { registerNoteQueries } from './queries-notes'
import { registerSearchQueries } from './queries-search'
import { registerFrameQueries } from './queries-frames'
import { registerStructureQueries } from './queries-structure'
import { runRecovery, type RecoveryReport } from './recovery'
import { registerSettingsQueries, setProjectSetting } from './settings'

export interface ProjectInfo {
  projectId: string
  rootNodeId: string
  rootCanvasId: string
  revision: number
}

/**
 * The composed authoritative project service (§11.3/§11.4): one per
 * open project directory, hosted by the Electron utility process in
 * production and constructed directly in tests.
 */
export interface ProjectService {
  info(): ProjectInfo
  /** §11.1/§14.4: true for a source open — every write path refuses
   * with EW_READ_ONLY and no lock is held. */
  readonly readOnly: boolean
  execute(envelope: CommandEnvelope): CommandResult
  query(name: string, args?: unknown): QueryResult
  /** §11.5 non-undoable project-setting write: never enters command
   * history, never bumps project_revision. Change fan-out happens at
   * the process seam (main broadcasts), not through subscribe(). */
  setSetting(key: string, value: unknown): void
  subscribe(fn: (event: ProjectChangedEvent) => void): () => void
  /** Staged asset import per §11.2; throws DomainError on rejection. */
  importAsset(input: ImportInput): Promise<ImportResult>
  /** §14.4 ingest-by-copy (AI-IMP-090): pull one asset + node facts
   * from another project's read handle into THIS project, applying
   * the tag border. Rejects EW_READ_ONLY on a read-only open. */
  ingestFrom(source: IngestSource, input: IngestInput): Promise<IngestResult>
  /** The {db, dir} read handle this service presents when it is the
   * SOURCE of an ingest. Reads only — hand it to another service's
   * ingestFrom, never mutate through it. */
  ingestSource(): IngestSource
  /** §11.2 derivative queue, renderer-driven (AI-IMP-076): the
   * oldest queued thumbnail job, or null when drained. */
  claimThumbnailJob(): ThumbnailJob | null
  /** Lands generated thumbnail bytes (null bytes = generation
   * failed). The hash/asset come from the JOB, never the caller;
   * returns them for the ready broadcast, or null when nothing
   * landed. */
  completeThumbnailJob(input: {
    jobId: string
    bytes: Uint8Array | null
  }): { assetId: string; contentHash: string } | null
  /** §11.4 startup recovery outcome for this open. */
  recovery(): RecoveryReport
  /** §11.4 involuntary checkpoint (AI-IMP-096): PRAGMA
   * wal_checkpoint(TRUNCATE) so the -wal file returns to zero and the
   * .sqlite is complete at rest (the OS may sleep and a cloud daemon
   * may sync at any moment). A read-only source no-ops — it holds no
   * lock and owns no WAL to flush. */
  checkpoint(): void
  /** §16/§11.4 session snapshot (AI-IMP-120): regenerate the readable
   * `notes/` tree beside project.sqlite — one title-named `.md` per
   * active note, bodies carrying the refreshed §7.8 metadata block —
   * and return note/asset counts for the commit message. Runs on the
   * single writer connection; a read-only source refuses. */
  writeNotesTree(): NotesTreeResult
  /** §16 portable export (AI-IMP-157; container rev 0.57): refresh the
   * readable notes tree, checkpoint the WAL, then stream the `.ewproj`
   * archive to `destPath`. Refuses on a read-only source — export
   * belongs to the project's owner session. */
  exportProject(destPath: string, options: ExportOptions): Promise<ExportResult>
  /** §16 rev-0.18 live size footer: stat-walk estimate of the export's
   * source bytes; no archive work, safe on any open. */
  estimateExportSize(): Promise<number>
  close(): void
}

export interface ServiceOptions extends OpenOptions {
  createIfMissing?: boolean
  title?: string
}

export function openProjectService(dir: string, options: ServiceOptions = {}): ProjectService {
  if (options.readOnly && options.createIfMissing) {
    throw new Error('openProjectService: readOnly and createIfMissing are contradictory')
  }
  const exists = existsSync(join(dir, DB_FILENAME))
  const handle =
    !exists && options.createIfMissing
      ? createProject(dir, options.title ?? 'Untitled Project', options)
      : openProject(dir, options)

  // §11.4: recover before the API accepts a single command — except
  // read-only opens, which MUST NOT mutate the source (repairs are
  // the owner's writable open's job).
  const recoveryReport: RecoveryReport = handle.readOnly
    ? { checksRun: [], repairs: [], integrityErrors: [] }
    : runRecovery({
        db: handle.db,
        projectId: handle.projectId,
        dir: handle.dir,
      })

  const commands = new CommandRegistry<CommandContext>()
  registerNodeHandlers(commands)
  registerNoteHandlers(commands)
  registerAssetHandlers(commands)
  registerCanvasHandlers(commands)
  registerPlacementHandlers(commands)
  registerTagHandlers(commands)
  registerDecorationHandlers(commands)
  registerLifecycleHandlers(commands)
  registerPinHandlers(commands)
  registerBookmarkHandlers(commands)
  registerFrameHandlers(commands)

  const queries = new QueryRegistry()
  registerCoreQueries(queries)
  registerNoteQueries(queries)
  registerAssetQueries(queries)
  registerStructureQueries(queries)
  registerFrameQueries(queries)
  registerSearchQueries(queries)
  registerLifecycleQueries(queries)
  registerSettingsQueries(queries)
  registerGalleryQueries(queries)

  const dispatcher = new Dispatcher(handle, commands)
  const queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }

  // §11.4 lazy rebuild: missing thumbnail derivatives re-enqueue on
  // every WRITABLE open (deleted derivatives dir, pre-076 project).
  // The renderer drains the queue in the background once a window is
  // up. A read-only source serves whatever derivatives it has.
  const derivCtx = { db: handle.db, now: () => new Date().toISOString() }
  if (!handle.readOnly) enqueueMissingThumbnails(derivCtx, handle.dir)

  const readOnlyError = (): Error & { code: string } => {
    const err = new Error(
      'this project is open read-only (§11.1 source open) — writes are refused',
    ) as Error & { code: string }
    err.code = 'EW_READ_ONLY'
    return err
  }

  return {
    info(): ProjectInfo {
      const revision = handle.db.get<{ project_revision: number }>(
        'SELECT project_revision FROM project WHERE id = ?',
        handle.projectId,
      )!.project_revision
      return {
        projectId: handle.projectId,
        rootNodeId: handle.rootNodeId,
        rootCanvasId: handle.rootCanvasId,
        revision,
      }
    },
    readOnly: handle.readOnly,
    execute: (envelope) =>
      handle.readOnly
        ? {
            status: 'error',
            commandId: envelope.commandId,
            code: 'EW_READ_ONLY',
            message: 'this project is open read-only (§11.1 source open)',
          }
        : dispatcher.execute(envelope),
    query: (name, args) => queries.run(queryCtx, name, args),
    setSetting: (key, value) => {
      if (handle.readOnly) throw readOnlyError()
      setProjectSetting(handle.db, handle.projectId, key, value)
    },
    subscribe: (fn) => dispatcher.subscribe(fn),
    recovery: () => recoveryReport,
    checkpoint: () => {
      // A read-only source took no lock and left the WAL to its
      // writable owner — checkpointing here would be a no-op the
      // driver refuses, so skip it outright.
      if (handle.readOnly) return
      handle.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    },
    writeNotesTree: () => {
      if (handle.readOnly) throw readOnlyError()
      return writeNotesTree(
        {
          db: handle.db,
          projectId: handle.projectId,
          rootNodeId: handle.rootNodeId,
          rootCanvasId: handle.rootCanvasId,
        },
        handle.dir,
      )
    },
    importAsset: (input) => {
      if (handle.readOnly) return Promise.reject(readOnlyError())
      return importAsset(
        {
          db: handle.db,
          projectId: handle.projectId,
          dir: handle.dir,
          execute: (envelope) => dispatcher.execute(envelope),
          now: () => new Date().toISOString(),
        },
        input,
      )
    },
    ingestFrom: (source, input) => {
      if (handle.readOnly) return Promise.reject(readOnlyError())
      return ingestFromSource(
        {
          db: handle.db,
          projectId: handle.projectId,
          dir: handle.dir,
          execute: (envelope) => dispatcher.execute(envelope),
          now: () => new Date().toISOString(),
        },
        source,
        input,
      )
    },
    ingestSource: () => ({ db: handle.db, dir: handle.dir }),
    exportProject: async (destPath, exportOptions) => {
      if (handle.readOnly) throw readOnlyError()
      // Order matters (mirrors the §11.4 snapshot moment): the notes
      // tree regenerates FIRST (refreshing §7.8 blocks), then the WAL
      // truncates so project.sqlite is complete at rest, then the
      // consistent copy streams into the archive.
      writeNotesTree(
        {
          db: handle.db,
          projectId: handle.projectId,
          rootNodeId: handle.rootNodeId,
          rootCanvasId: handle.rootCanvasId,
        },
        handle.dir,
      )
      handle.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      return exportProject({ db: handle.db, dir: handle.dir }, destPath, exportOptions)
    },
    estimateExportSize: () => estimateExportSize({ db: handle.db, dir: handle.dir }),
    // Claiming mutates the queue: a read-only source reports drained
    // and lands nothing — it serves the derivatives it already has.
    claimThumbnailJob: () => (handle.readOnly ? null : claimNextThumbnailJob(derivCtx, handle.dir)),
    completeThumbnailJob: (input) =>
      handle.readOnly ? null : completeThumbnailJob(derivCtx, handle.dir, input),
    close: () => handle.close(),
  }
}
