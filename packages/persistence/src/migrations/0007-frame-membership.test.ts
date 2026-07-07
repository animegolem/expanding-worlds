import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../db'
import { migrate } from '../migrate'
import { MIGRATIONS } from './index'
import { createProject, type ProjectHandle } from '../project'

/**
 * Migration 0007 (AI-IMP-126): drops the node.appearance_kind CHECK
 * (the last node rebuild — appearance kinds are validated in handlers
 * now) and adds the frame_member table. The rebuild must be invisible
 * (rows, note index, root triggers, inbound FKs survive), the CHECK
 * must be gone, and single-parent membership must hold structurally.
 */

describe('migration 0007: frame membership', () => {
  let dir: string
  let project: ProjectHandle
  const iso = () => new Date().toISOString()

  function insertNode(id: string, kind: string | null): void {
    project.db.run(
      `INSERT INTO node (id, project_id, appearance_kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      project.projectId,
      kind,
      iso(),
      iso(),
    )
  }

  function insertPlacement(id: string, nodeId: string): void {
    project.db.run(
      `INSERT INTO placement (id, project_id, canvas_id, node_id, render_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      id,
      project.projectId,
      project.rootCanvasId,
      nodeId,
      iso(),
      iso(),
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig7-'))
    project = createProject(dir, 'Frames')
  })

  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts the new frame appearance kind AND any string (CHECK dropped)', () => {
    expect(() => insertNode('n-frame', 'frame')).not.toThrow()
    // The whole point of the rebuild: no appearance CHECK survives, so
    // even a bogus kind is now a handler concern, not a schema error.
    expect(() => insertNode('n-bogus', 'sticker')).not.toThrow()
  })

  it('kept the root row, its protection triggers, and the note index', () => {
    const root = project.db.get<{ id: string }>(
      'SELECT id FROM node WHERE id = ?',
      project.rootNodeId,
    )
    expect(root).toBeDefined()
    expect(() =>
      project.db.run('DELETE FROM node WHERE id = ?', project.rootNodeId),
    ).toThrow(/EW_ROOT_NODE_PROTECTED/)
    expect(() =>
      project.db.run(
        "UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?",
        project.rootNodeId,
      ),
    ).toThrow(/EW_ROOT_NODE_PROTECTED/)
    const indexes = project.db
      .all<{ name: string }>("SELECT name FROM pragma_index_list('node')")
      .map((r) => r.name)
    expect(indexes).toContain('ix_node_note')
  })

  it('inbound foreign keys still enforce against the rebuilt node table', () => {
    expect(() =>
      project.db.run(
        `INSERT INTO placement (id, project_id, canvas_id, node_id, x, y, render_order, created_at, updated_at)
         VALUES ('p-orphan', ?, ?, 'n-missing', 0, 0, 1, ?, ?)`,
        project.projectId,
        project.rootCanvasId,
        iso(),
        iso(),
      ),
    ).toThrow()
  })

  it('frame_member enforces single parent via its PRIMARY KEY', () => {
    insertNode('n-frame', 'frame')
    insertNode('n-item', 'dot')
    insertPlacement('p-frame', 'n-frame')
    insertPlacement('p-item', 'n-item')

    project.db.run(
      `INSERT INTO frame_member
         (member_placement_id, frame_placement_id, project_id, created_at, updated_at)
       VALUES ('p-item', 'p-frame', ?, ?, ?)`,
      project.projectId,
      iso(),
      iso(),
    )
    // A second raw insert for the same member is a PK violation — the
    // structural single-parent guarantee (re-parent is an UPSERT).
    expect(() =>
      project.db.run(
        `INSERT INTO frame_member
           (member_placement_id, frame_placement_id, project_id, created_at, updated_at)
         VALUES ('p-item', 'p-frame', ?, ?, ?)`,
        project.projectId,
        iso(),
        iso(),
      ),
    ).toThrow()
  })

  it('deleting a placement cascades its frame_member rows (both ends)', () => {
    insertNode('n-frame', 'frame')
    insertNode('n-item', 'dot')
    insertPlacement('p-frame', 'n-frame')
    insertPlacement('p-item', 'n-item')
    project.db.run(
      `INSERT INTO frame_member
         (member_placement_id, frame_placement_id, project_id, created_at, updated_at)
       VALUES ('p-item', 'p-frame', ?, ?, ?)`,
      project.projectId,
      iso(),
      iso(),
    )
    // Deleting the FRAME placement removes the row via the frame-side FK.
    project.db.run('DELETE FROM placement WHERE id = ?', 'p-frame')
    expect(
      project.db.get<{ n: number }>('SELECT count(*) AS n FROM frame_member')!.n,
    ).toBe(0)
  })

  it('applies onto a POPULATED schema-6 database (rebuild counts nothing)', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'ew-mig7-populated-'))
    const db = Db.open(join(dir2, 'project.sqlite'))
    try {
      db.exec(`CREATE TABLE migrations (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
      ) STRICT`)
      for (const m of MIGRATIONS.filter((m) => m.id <= 6)) {
        db.exec(m.sql)
        db.run(
          'INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)',
          m.id,
          m.name,
          new Date().toISOString(),
        )
      }
      const t = new Date().toISOString()
      db.exec('PRAGMA defer_foreign_keys = ON')
      db.transaction(() => {
        db.run(
          `INSERT INTO node (id, project_id, appearance_kind, appearance_color, created_at, updated_at)
           VALUES ('n-root', 'p1', 'dot', '#fff', ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO project (id, title, schema_version, root_node_id, created_at, updated_at)
           VALUES ('p1', 'Populated', 6, 'n-root', ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO canvas (id, project_id, node_id, created_at, updated_at)
           VALUES ('c-root', 'p1', 'n-root', ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO node (id, project_id, appearance_kind, created_at, updated_at)
           VALUES ('n-1', 'p1', 'card', ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO placement (id, project_id, canvas_id, node_id, render_order, created_at, updated_at)
           VALUES ('pl-1', 'p1', 'c-root', 'n-1', 1, ?, ?)`,
          t,
          t,
        )
      })

      const ran = migrate(db)
      expect(ran).toEqual([7])
      expect(db.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n).toBe(2)
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
      expect(db.pragma('foreign_keys')).toBe(1)
      // frame appearance now inserts freely (CHECK gone).
      expect(() =>
        db.run(
          `INSERT INTO node (id, project_id, appearance_kind, created_at, updated_at)
           VALUES ('n-frame', 'p1', 'frame', ?, ?)`,
          t,
          t,
        ),
      ).not.toThrow()
    } finally {
      db.close()
      rmSync(dir2, { recursive: true, force: true })
    }
  })
})
