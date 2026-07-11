import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from './db'
import { LOCK_FILENAME, ProjectLockedError } from './lock'
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations/index'
import { createProject, DB_FILENAME, openProject } from './project'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-project-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

describe('createProject', () => {
  it('creates the §4.10 atomic root aggregate', () => {
    const project = createProject(dir, 'Test World')
    try {
      expect(existsSync(join(dir, DB_FILENAME))).toBe(true)
      expect(project.db.pragma('journal_mode')).toBe('wal')
      expect(project.db.pragma('foreign_keys')).toBe(1)

      const row = project.db.get<{
        title: string
        schema_version: number
        project_revision: number
        root_node_id: string
      }>('SELECT title, schema_version, project_revision, root_node_id FROM project')
      expect(row).toMatchObject({
        title: 'Test World',
        schema_version: LATEST_SCHEMA_VERSION,
        project_revision: 0,
        root_node_id: project.rootNodeId,
      })

      const rootCanvas = project.db.get<{ node_id: string }>(
        'SELECT node_id FROM canvas WHERE id = ?',
        project.rootCanvasId,
      )
      expect(rootCanvas?.node_id).toBe(project.rootNodeId)
    } finally {
      project.close()
    }
  })

  it('stores the Trash retention default of Never (§9.1, §11.5)', () => {
    const project = createProject(dir, 'Test')
    try {
      const setting = project.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'trash_retention'",
      )
      expect(JSON.parse(setting!.value)).toBe('never')
    } finally {
      project.close()
    }
  })

  it('migration 0008 adds a nullable caption with no schema constraint', () => {
    const project = createProject(dir, 'Caption Schema')
    try {
      const caption = project.db
        .all<{ name: string; type: string; notnull: number; dflt_value: unknown }>(
          'PRAGMA table_info(placement)',
        )
        .find((column) => column.name === 'caption')
      expect(caption).toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: null })
      expect(MIGRATIONS.find((migration) => migration.id === 8)?.sql).not.toMatch(/CHECK/i)
    } finally {
      project.close()
    }
  })

  it('refuses to create over an existing project', () => {
    createProject(dir, 'First').close()
    expect(() => createProject(dir, 'Second')).toThrow(/already exists/)
  })
})

describe('openProject', () => {
  it('reopens with zero pending migrations and the same identities', () => {
    const created = createProject(dir, 'Reopen Me')
    const ids = {
      projectId: created.projectId,
      rootNodeId: created.rootNodeId,
      rootCanvasId: created.rootCanvasId,
    }
    created.close()

    const reopened = openProject(dir)
    try {
      expect(reopened.projectId).toBe(ids.projectId)
      expect(reopened.rootNodeId).toBe(ids.rootNodeId)
      expect(reopened.rootCanvasId).toBe(ids.rootCanvasId)
      const applied = reopened.db.all<{ id: number }>('SELECT id FROM migrations ORDER BY id')
      expect(applied.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id))
    } finally {
      reopened.close()
    }
  })

  it('enforces the single-writer lock (§11.1)', () => {
    const first = createProject(dir, 'Locked')
    try {
      expect(() => openProject(dir)).toThrowError(ProjectLockedError)
    } finally {
      first.close()
    }
    // Released on close: a new writer may open.
    openProject(dir).close()
  })

  it('throws a clear error for a directory without a project', () => {
    expect(() => openProject(dir)).toThrow(/no project at/)
  })

  it('releases the lock when opening fails after acquisition', () => {
    writeFileSync(join(dir, DB_FILENAME), 'not a database')
    expect(() => openProject(dir)).toThrow()
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(false)
  })

  it('refuses kindly when the schema is ahead of this build (§11.4)', () => {
    // A project written by a newer version carries a higher
    // schema_version; migrate() would silently no-op, so the writable
    // open MUST refuse with the typed EW_SCHEMA_AHEAD error.
    const created = createProject(dir, 'From The Future')
    created.db.run('UPDATE project SET schema_version = ?', LATEST_SCHEMA_VERSION + 1)
    created.close()

    let thrown: (Error & { code?: string }) | undefined
    try {
      openProject(dir)
    } catch (err) {
      thrown = err as Error & { code?: string }
    }
    expect(thrown).toBeDefined()
    expect(thrown?.code).toBe('EW_SCHEMA_AHEAD')
    expect(thrown?.message).toMatch(/newer version of Expanding Worlds/)

    // The refusal never touched the database (schema_version unchanged,
    // no migration ran) and the lock released so it does not hang.
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(false)
    const raw = Db.open(join(dir, DB_FILENAME))
    try {
      const version = raw.get<{ schema_version: number }>(
        'SELECT schema_version FROM project',
      )?.schema_version
      expect(version).toBe(LATEST_SCHEMA_VERSION + 1)
    } finally {
      raw.close()
    }
    // The refusal is stable: a second open refuses identically.
    expect(() => openProject(dir)).toThrow(/newer version of Expanding Worlds/)
  })
})
