import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../db'
import { migrate } from '../migrate'
import { MIGRATIONS } from './index'
import { createProject, type ProjectHandle } from '../project'

/**
 * Migration 0006 (AI-IMP-084): the node-table rebuild that admits
 * 'card' into the appearance_kind CHECK. The rebuild must be
 * invisible — rows, the note index, the root-protection triggers,
 * and inbound foreign keys all survive it.
 */

describe('migration 0006: card appearance', () => {
  let dir: string
  let project: ProjectHandle

  const iso = () => new Date().toISOString()

  function insertNode(id: string, kind: string | null): void {
    project.db.run(
      `INSERT INTO node (id, project_id, appearance_kind, appearance_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      project.projectId,
      kind,
      kind === 'dot' ? '#fff' : null,
      iso(),
      iso(),
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ew-mig6-'))
    project = createProject(dir, 'Cards')
  })

  afterEach(() => {
    project.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('accepts card (migration 0007 later drops the appearance CHECK)', () => {
    expect(() => insertNode('n-card', 'card')).not.toThrow()
    // These fixtures run createProject, which migrates to HEAD. At
    // head, migration 0007 has dropped the node.appearance_kind CHECK
    // entirely (appearance kinds are handler-validated now, EPIC-022 /
    // AI-IMP-126), so an unknown kind is no longer a schema error.
    expect(() => insertNode('n-bogus', 'sticker')).not.toThrow()
  })

  it('the rebuilt table kept the root row and its protection triggers', () => {
    // The root node predates the rebuild inside createProject's
    // migration chain — it must have survived the copy.
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
  })

  it('inbound foreign keys still enforce against the rebuilt table', () => {
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

  it('ix_node_note came back with the rebuild', () => {
    const indexes = project.db
      .all<{ name: string }>("SELECT name FROM pragma_index_list('node')")
      .map((r) => r.name)
    expect(indexes).toContain('ix_node_note')
  })
})

describe('migration 0006 on a POPULATED schema-5 database', () => {
  // The failure mode that shipped and broke the owner's live project:
  // fresh test projects run migrations before any rows exist, so the
  // rebuild's implicit DELETE had nothing to count. A real project has
  // rows behind every inbound FK — this fixture builds one at schema 5
  // and then lets migrate() bring it to head.
  it('rebuilds node with live rows behind every inbound foreign key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ew-mig6-populated-'))
    const db = Db.open(join(dir, 'project.sqlite'))
    try {
      db.exec(`CREATE TABLE migrations (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
      ) STRICT`)
      for (const m of MIGRATIONS.filter((m) => m.id <= 5)) {
        db.exec(m.sql)
        db.run(
          'INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)',
          m.id,
          m.name,
          new Date().toISOString(),
        )
      }
      const t = new Date().toISOString()
      // One row behind each FK that references node: project.root_node_id,
      // canvas.node_id, placement.node_id, tag_assignment.node_id.
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
           VALUES ('p1', 'Populated', 5, 'n-root', ?, ?)`,
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
          `INSERT INTO node (id, project_id, appearance_kind, appearance_color, created_at, updated_at)
           VALUES ('n-1', 'p1', 'dot', '#abc', ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO placement (id, project_id, canvas_id, node_id, render_order, created_at, updated_at)
           VALUES ('pl-1', 'p1', 'c-root', 'n-1', 1, ?, ?)`,
          t,
          t,
        )
        db.run(
          `INSERT INTO tag (id, project_id, name, name_key, created_at, updated_at)
           VALUES ('t-1', 'p1', 'Ref', 'ref', ?, ?)`,
          t,
          t,
        )
        db.run(`INSERT INTO tag_assignment (tag_id, node_id, created_at) VALUES ('t-1', 'n-1', ?)`, t)
      })

      // migrate() runs to HEAD, including intentional reserved-id gaps.
      const ran = migrate(db)
      expect(ran).toEqual([6, 7, 8, 10])
      expect(db.get<{ n: number }>('SELECT count(*) AS n FROM node')!.n).toBe(2)
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
      expect(db.pragma('foreign_keys')).toBe(1)
      // card inserts; at head the appearance CHECK is gone (0007), so
      // even a bogus kind is now a handler concern, not a schema error.
      db.run(
        `INSERT INTO node (id, project_id, appearance_kind, created_at, updated_at)
         VALUES ('n-card', 'p1', 'card', ?, ?)`,
        t,
        t,
      )
      expect(() =>
        db.run(
          `INSERT INTO node (id, project_id, appearance_kind, created_at, updated_at)
           VALUES ('n-bogus', 'p1', 'sticker', ?, ?)`,
          t,
          t,
        ),
      ).not.toThrow()
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})
