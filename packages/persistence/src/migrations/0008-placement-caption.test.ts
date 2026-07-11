import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../db'
import { createProject, type ProjectHandle } from '../project'
import { MIGRATIONS } from './index'

describe('migration 0008: placement captions', () => {
  let dir: string
  let project: ProjectHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig8-'))
    project = createProject(dir, 'Captions')
  })

  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('adds one nullable TEXT column with no growable-domain CHECK', () => {
    expect(
      project.db.get<{ name: string; type: string; notnull: number; dflt_value: unknown }>(
        "SELECT name, type, `notnull`, dflt_value FROM pragma_table_info('placement') WHERE name = 'caption'",
      ),
    ).toEqual({ name: 'caption', type: 'TEXT', notnull: 0, dflt_value: null })

    const sql = project.db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'placement'",
    )!.sql
    expect(sql).not.toMatch(/caption[^,]*check/i)
  })

  it('preserves populated schema-7 placement rows and defaults their captions to null', () => {
    const dbPath = join(dir, 'schema7.sqlite')
    const db = Db.open(dbPath)
    try {
      for (const migration of MIGRATIONS.filter((m) => m.id <= 7)) db.exec(migration.sql)
      const now = new Date().toISOString()
      db.exec('PRAGMA foreign_keys = OFF')
      db.run(
        `INSERT INTO node (id, project_id, created_at, updated_at)
         VALUES ('n-root', 'p1', ?, ?)`,
        now,
        now,
      )
      db.run(
        `INSERT INTO project (id, title, schema_version, root_node_id, created_at, updated_at)
         VALUES ('p1', 'Before captions', 7, 'n-root', ?, ?)`,
        now,
        now,
      )
      db.run(
        `INSERT INTO canvas (id, project_id, node_id, created_at, updated_at)
         VALUES ('c-root', 'p1', 'n-root', ?, ?)`,
        now,
        now,
      )
      db.run(
        `INSERT INTO placement
           (id, project_id, canvas_id, node_id, render_order, created_at, updated_at)
         VALUES ('pl-1', 'p1', 'c-root', 'n-root', 1, ?, ?)`,
        now,
        now,
      )
      db.exec('PRAGMA foreign_keys = ON')

      db.exec(MIGRATIONS.find((m) => m.id === 8)!.sql)
      expect(db.get('SELECT id, caption FROM placement WHERE id = ?', 'pl-1')).toEqual({
        id: 'pl-1',
        caption: null,
      })
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  })
})
