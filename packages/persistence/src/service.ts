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
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPinHandlers } from './handlers/pin'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import { importAsset, type ImportInput, type ImportResult } from './import/pipeline'
import { createProject, DB_FILENAME, openProject, type OpenOptions } from './project'
import { QueryRegistry, registerCoreQueries, type QueryResult } from './queries'
import { registerLifecycleQueries } from './queries-lifecycle'
import { registerNoteQueries } from './queries-notes'
import { registerSearchQueries } from './queries-search'
import { registerStructureQueries } from './queries-structure'
import { runRecovery, type RecoveryReport } from './recovery'

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
  execute(envelope: CommandEnvelope): CommandResult
  query(name: string, args?: unknown): QueryResult
  subscribe(fn: (event: ProjectChangedEvent) => void): () => void
  /** Staged asset import per §11.2; throws DomainError on rejection. */
  importAsset(input: ImportInput): Promise<ImportResult>
  /** §11.4 startup recovery outcome for this open. */
  recovery(): RecoveryReport
  close(): void
}

export interface ServiceOptions extends OpenOptions {
  createIfMissing?: boolean
  title?: string
}

export function openProjectService(dir: string, options: ServiceOptions = {}): ProjectService {
  const exists = existsSync(join(dir, DB_FILENAME))
  const handle =
    !exists && options.createIfMissing
      ? createProject(dir, options.title ?? 'Untitled Project', options)
      : openProject(dir, options)

  // §11.4: recover before the API accepts a single command.
  const recoveryReport = runRecovery({
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

  const queries = new QueryRegistry()
  registerCoreQueries(queries)
  registerNoteQueries(queries)
  registerAssetQueries(queries)
  registerStructureQueries(queries)
  registerSearchQueries(queries)
  registerLifecycleQueries(queries)

  const dispatcher = new Dispatcher(handle, commands)
  const queryCtx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
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
    execute: (envelope) => dispatcher.execute(envelope),
    query: (name, args) => queries.run(queryCtx, name, args),
    subscribe: (fn) => dispatcher.subscribe(fn),
    recovery: () => recoveryReport,
    importAsset: (input) =>
      importAsset(
        {
          db: handle.db,
          projectId: handle.projectId,
          dir: handle.dir,
          execute: (envelope) => dispatcher.execute(envelope),
          now: () => new Date().toISOString(),
        },
        input,
      ),
    close: () => handle.close(),
  }
}
