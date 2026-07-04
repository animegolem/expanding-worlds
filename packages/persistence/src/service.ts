import {
  CommandRegistry,
  type CommandEnvelope,
  type CommandResult,
  type ProjectChangedEvent,
} from '@ew/commands'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerNodeHandlers } from './handlers/nodes'
import { createProject, DB_FILENAME, openProject, type OpenOptions } from './project'
import { QueryRegistry, registerCoreQueries, type QueryResult } from './queries'

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

  const commands = new CommandRegistry<CommandContext>()
  registerNodeHandlers(commands)

  const queries = new QueryRegistry()
  registerCoreQueries(queries)

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
    close: () => handle.close(),
  }
}
