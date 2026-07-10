import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../db'
import { createProject, type ProjectHandle } from '../project'
import { MIGRATIONS } from './index'

/**
 * Migration 0005 (AI-IMP-061): fresh databases get the §8.1 bookmark
 * table straight from the chain; existing databases (schema ≤ 3)
 * carry any legacy placeholder rows into the rebuilt table with
 * GAP-spaced sort keys in created_at order — and lose the canvas_id
 * FK so bookmarks survive their target's purge (broken state, never
 * a silent vanish).
 */

describe('fresh database', () => {
  let dir: string
  let project: ProjectHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig5-fresh-'))
    project = createProject(dir, 'Fresh')
  })

  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('creates the rebuilt bookmark table with the target-kind seam', () => {
    const columns = project.db
      .all<{ name: string }>("SELECT name FROM pragma_table_info('bookmark')")
      .map((c) => c.name)
    expect(columns).toEqual([
      'id',
      'project_id',
      'target_kind',
      'canvas_id',
      'label',
      'viewport',
      'sort_key',
      'created_at',
      'updated_at',
    ])
    // Only 'canvas' ships (EPIC-013 owns projections).
    expect(() =>
      project.db.run(
        `INSERT INTO bookmark
           (id, project_id, target_kind, canvas_id, label, sort_key, created_at, updated_at)
         VALUES ('b1', ?, 'graph', 'c1', 'x', 1, '2026-01-01', '2026-01-01')`,
        project.projectId,
      ),
    ).toThrow(/CHECK/i)
  })

  it('has no FK on canvas_id: a bookmark row outlives its canvas (§8.1)', () => {
    expect(() =>
      project.db.run(
        `INSERT INTO bookmark
           (id, project_id, canvas_id, label, sort_key, created_at, updated_at)
         VALUES ('b1', ?, 'no-such-canvas', 'Ghost', 1, '2026-01-01', '2026-01-01')`,
        project.projectId,
      ),
    ).not.toThrow()
  })
})

describe('existing database (schema 3 with legacy placeholder rows)', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig5-old-'))
    db = Db.open(join(dir, 'old.sqlite3'))
    // Build the pre-0005 schema exactly as migrate() would have.
    for (const migration of MIGRATIONS.filter((m) => m.id <= 3)) {
      db.exec(migration.sql)
    }
    // Seed the project row (the rebuilt table keeps its project FK)
    // but NOT the target canvases — the copy must not depend on
    // target liveness. The project↔root-node pair is circular, so
    // FKs go off for seeding only.
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`
      INSERT INTO node (id, project_id, created_at, updated_at)
        VALUES ('n1', 'p1', '2026-01-01', '2026-01-01');
      INSERT INTO project
        (id, title, schema_version, root_node_id, created_at, updated_at)
        VALUES ('p1', 'Old', 3, 'n1', '2026-01-01', '2026-01-01');
      INSERT INTO bookmark (id, project_id, canvas_id, name, viewport, created_at) VALUES
        ('b-late', 'p1', 'c2', 'Later', NULL, '2026-02-01T00:00:00Z'),
        ('b-early', 'p1', 'c1', 'Earlier', '{"x":1,"y":2,"zoom":3}', '2026-01-01T00:00:00Z'),
        ('b-blank', 'p1', 'c3', '', NULL, '2026-03-01T00:00:00Z');
    `)
    db.exec('PRAGMA foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('carries rows over: name→label, created_at order, GAP-spaced keys', () => {
    const migration = MIGRATIONS.find((m) => m.id === 5)!
    db.exec(migration.sql)

    const rows = db.all<{
      id: string
      target_kind: string
      label: string
      viewport: string | null
      sort_key: number
      updated_at: string
    }>('SELECT id, target_kind, label, viewport, sort_key, updated_at FROM bookmark ORDER BY sort_key')
    expect(rows.map((r) => r.id)).toEqual(['b-early', 'b-late', 'b-blank'])
    expect(rows.map((r) => r.sort_key)).toEqual([1024, 2048, 3072])
    expect(rows.map((r) => r.label)).toEqual(['Earlier', 'Later', 'Board'])
    expect(rows.every((r) => r.target_kind === 'canvas')).toBe(true)
    expect(rows[0]!.viewport).toBe('{"x":1,"y":2,"zoom":3}')
    expect(rows[0]!.updated_at).toBe('2026-01-01T00:00:00Z')
  })
})
