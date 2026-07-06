import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepts card and still rejects unknown kinds', () => {
    expect(() => insertNode('n-card', 'card')).not.toThrow()
    expect(() => insertNode('n-bogus', 'sticker')).toThrow()
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
