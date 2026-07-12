import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from '../project'

describe('migration 0011: node-scoped tag unassign suppression', () => {
  let dir: string
  let project: ProjectHandle
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig11-'))
    project = createProject(dir, 'Node tag suppression')
  })
  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  it('is STRICT, node-scoped, and has no growable-domain CHECK', () => {
    const sql = project.db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'tag_unassign_suppression'")!.sql
    expect(sql).toMatch(/STRICT$/i)
    expect(sql).not.toMatch(/CHECK/i)
    const primary = project.db.all<{ name: string; pk: number }>("SELECT name, pk FROM pragma_table_info('tag_unassign_suppression') ORDER BY cid").filter((c) => c.pk > 0)
    expect(primary).toEqual([
      { name: 'project_id', pk: 1 },
      { name: 'content_hash', pk: 2 },
      { name: 'name_key', pk: 3 },
      { name: 'node_id', pk: 4 },
    ])
  })
})
