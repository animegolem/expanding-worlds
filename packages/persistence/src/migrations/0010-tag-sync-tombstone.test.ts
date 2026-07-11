import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from '../project'
import { MIGRATIONS } from './index'

describe('migration 0010: tag-sync tombstones', () => {
  let dir: string
  let project: ProjectHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig10-'))
    project = createProject(dir, 'Tag suppression')
  })

  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('creates the project-scoped STRICT table without a growable-domain CHECK', () => {
    expect(
      project.db.all<{ name: string; type: string; notnull: number; pk: number }>(
        "SELECT name, type, `notnull`, pk FROM pragma_table_info('tag_sync_tombstone') ORDER BY cid",
      ),
    ).toEqual([
      { name: 'project_id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'name_key', type: 'TEXT', notnull: 1, pk: 2 },
      { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
    ])

    const tableSql = project.db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tag_sync_tombstone'",
    )!.sql
    expect(tableSql).toMatch(/STRICT$/i)
    expect(tableSql).not.toMatch(/CHECK/i)
  })

  it('registers 0010 over the reserved-0009 gap in the migration ledger', () => {
    expect(MIGRATIONS.map((migration) => migration.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10])
    expect(
      project.db.all<{ id: number }>('SELECT id FROM migrations ORDER BY id').map((row) => row.id),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10])
  })

  it('enforces one tombstone per project and name key', () => {
    const now = new Date().toISOString()
    project.db.run(
      'INSERT INTO tag_sync_tombstone (project_id, name_key, created_at) VALUES (?, ?, ?)',
      project.projectId,
      'scout',
      now,
    )
    expect(() =>
      project.db.run(
        'INSERT INTO tag_sync_tombstone (project_id, name_key, created_at) VALUES (?, ?, ?)',
        project.projectId,
        'scout',
        now,
      ),
    ).toThrow()
  })
})
