import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { Db } from './db'
import { type LockOptions, ProjectLock } from './lock'
import { migrate } from './migrate'
import { LATEST_SCHEMA_VERSION } from './migrations/index'

export const DB_FILENAME = 'project.sqlite'

export interface ProjectHandle {
  db: Db
  projectId: string
  rootNodeId: string
  rootCanvasId: string
  dir: string
  readOnly: boolean
  close(): void
}

export interface OpenOptions {
  lock?: LockOptions
  /** §11.1/§14.4 source opening: no lock, no migration, no writes —
   * a read-only open never mutates the source and never blocks (or
   * is blocked by) the owning instance. Requires the source to be
   * at the CURRENT schema (open it writable once to migrate). */
  readOnly?: boolean
}

/**
 * Creates a project directory per §4.10: project row, protected root
 * node, and root canvas in one transaction, plus §11.5 project-tier
 * setting defaults (Trash retention: Never, §9.1).
 */
export function createProject(
  dir: string,
  title: string,
  options: OpenOptions = {},
): ProjectHandle {
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, DB_FILENAME)
  if (existsSync(dbPath)) {
    throw new Error(`createProject: ${dbPath} already exists`)
  }

  const lock = ProjectLock.acquire(dir, options.lock)
  try {
    const db = Db.open(dbPath)
    migrate(db)

    const projectId = uuidv7()
    const rootNodeId = uuidv7()
    const rootCanvasId = uuidv7()
    const now = new Date().toISOString()

    db.transaction(() => {
      // project.root_node_id and node.project_id are mutually
      // referential; defer FK checks to commit inside this scope.
      db.exec('PRAGMA defer_foreign_keys = ON')
      db.run(
        `INSERT INTO project
           (id, title, schema_version, project_revision, root_node_id,
            created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
        projectId,
        title,
        LATEST_SCHEMA_VERSION,
        rootNodeId,
        now,
        now,
      )
      db.run(
        `INSERT INTO node (id, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        rootNodeId,
        projectId,
        now,
        now,
      )
      db.run(
        `INSERT INTO canvas (id, project_id, node_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        rootCanvasId,
        projectId,
        rootNodeId,
        now,
        now,
      )
      db.run(
        `INSERT INTO settings (project_id, key, value) VALUES (?, ?, ?)`,
        projectId,
        'trash_retention',
        JSON.stringify('never'),
      )
    })

    return makeHandle(db, lock, dir)
  } catch (err) {
    lock.release()
    throw err
  }
}

/** Opens an existing project: lock, migrate pending, read identity.
 * Read-only opens (§11.1/§14.4) skip lock AND migration. */
export function openProject(dir: string, options: OpenOptions = {}): ProjectHandle {
  const dbPath = join(dir, DB_FILENAME)
  if (!existsSync(dbPath)) {
    throw new Error(`openProject: no project at ${dbPath}`)
  }

  if (options.readOnly) {
    const db = Db.open(dbPath, { readOnly: true })
    try {
      const version = db.get<{ schema_version: number }>(
        'SELECT schema_version FROM project',
      )?.schema_version
      if (version !== LATEST_SCHEMA_VERSION) {
        const err = new Error(
          `read-only open needs schema ${LATEST_SCHEMA_VERSION}, found ${version ?? 'none'} — ` +
            'open the project writable once to migrate it',
        ) as Error & { code: string }
        err.code = 'EW_SCHEMA_MISMATCH'
        throw err
      }
      return makeHandle(db, null, dir)
    } catch (err) {
      db.close()
      throw err
    }
  }

  const lock = ProjectLock.acquire(dir, options.lock)
  try {
    const db = Db.open(dbPath)
    migrate(db)
    return makeHandle(db, lock, dir)
  } catch (err) {
    lock.release()
    throw err
  }
}

function makeHandle(db: Db, lock: ProjectLock | null, dir: string): ProjectHandle {
  const project = db.get<{ id: string; root_node_id: string }>(
    'SELECT id, root_node_id FROM project',
  )
  if (!project) throw new Error('project row missing')
  const rootCanvas = db.get<{ id: string }>(
    'SELECT id FROM canvas WHERE node_id = ?',
    project.root_node_id,
  )
  if (!rootCanvas) throw new Error('root canvas missing')

  return {
    db,
    projectId: project.id,
    rootNodeId: project.root_node_id,
    rootCanvasId: rootCanvas.id,
    dir,
    readOnly: lock === null,
    close(): void {
      db.close()
      lock?.release()
    },
  }
}
