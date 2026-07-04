import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, type ProjectHandle } from './project'

let dir: string
let project: ProjectHandle

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-schema-'))
  project = createProject(dir, 'Schema Test')
})

afterEach(() => {
  project.close()
  rmSync(dir, { recursive: true, force: true })
})

const now = (): string => new Date().toISOString()

function insertNote(title: string, titleKey: string, state = 'active'): string {
  const id = uuidv7()
  project.db.run(
    `INSERT INTO note (id, project_id, title, title_key, lifecycle_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    project.projectId,
    title,
    titleKey,
    state,
    now(),
    now(),
  )
  return id
}

function insertNode(): string {
  const id = uuidv7()
  project.db.run(
    'INSERT INTO node (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id,
    project.projectId,
    now(),
    now(),
  )
  return id
}

describe('foreign keys', () => {
  it('are enforced (placement → node and canvas)', () => {
    expect(() =>
      project.db.run(
        `INSERT INTO placement (id, project_id, canvas_id, node_id, render_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        uuidv7(),
        project.projectId,
        'no-such-canvas',
        'no-such-node',
        now(),
        now(),
      ),
    ).toThrow(/FOREIGN KEY/i)
  })

  it('reject a tag assignment to a missing node', () => {
    const tagId = uuidv7()
    project.db.run(
      `INSERT INTO tag (id, project_id, name, name_key, created_at, updated_at)
       VALUES (?, ?, 'x', 'x', ?, ?)`,
      tagId,
      project.projectId,
      now(),
      now(),
    )
    expect(() =>
      project.db.run(
        'INSERT INTO tag_assignment (tag_id, node_id, created_at) VALUES (?, ?, ?)',
        tagId,
        'no-such-node',
        now(),
      ),
    ).toThrow(/FOREIGN KEY/i)
  })
})

describe('invariant 5: title_key uniqueness including Trash', () => {
  it('blocks a duplicate title_key while the holder is active', () => {
    insertNote('Foo Bar', 'foo bar')
    expect(() => insertNote('foo  BAR', 'foo bar')).toThrow(/UNIQUE/i)
  })

  it('blocks a duplicate title_key while the holder is trashed', () => {
    insertNote('Foo Bar', 'foo bar', 'trashed')
    expect(() => insertNote('Foo Bar', 'foo bar')).toThrow(/UNIQUE/i)
  })

  it('frees the title_key when the row is purged (deleted)', () => {
    const id = insertNote('Foo Bar', 'foo bar', 'trashed')
    project.db.run('DELETE FROM link WHERE source_note_id = ?', id)
    project.db.run('DELETE FROM note WHERE id = ?', id)
    expect(() => insertNote('Foo Bar', 'foo bar')).not.toThrow()
  })
})

describe('invariant 10: one canvas per node', () => {
  it('rejects a second canvas for one node', () => {
    const nodeId = insertNode()
    const insert = (): unknown =>
      project.db.run(
        'INSERT INTO canvas (id, project_id, node_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        uuidv7(),
        project.projectId,
        nodeId,
        now(),
        now(),
      )
    insert()
    expect(insert).toThrow(/UNIQUE/i)
  })
})

describe('link state CHECK constraints (§7.1)', () => {
  const insertLink = (
    state: string,
    fields: { target?: string; titleKey?: string; display?: string },
  ): unknown => {
    const source = insertNote(`src-${uuidv7()}`, `src-${uuidv7()}`)
    return project.db.run(
      `INSERT INTO link (id, project_id, source_note_id, source_revision,
         range_start, range_end, state, target_note_id, target_title_key,
         display_text, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 5, ?, ?, ?, ?, ?, ?)`,
      uuidv7(),
      project.projectId,
      source,
      state,
      fields.target ?? null,
      fields.titleKey ?? null,
      fields.display ?? null,
      now(),
      now(),
    )
  }

  it('bound requires a target note id', () => {
    expect(() => insertLink('bound', {})).toThrow(/CHECK/i)
    const target = insertNote('Target', 'target')
    expect(() => insertLink('bound', { target })).not.toThrow()
  })

  it('unresolved requires title_key and display text', () => {
    expect(() => insertLink('unresolved', { titleKey: 'ghost' })).toThrow(/CHECK/i)
    expect(() =>
      insertLink('unresolved', { titleKey: 'ghost', display: 'Ghost' }),
    ).not.toThrow()
  })

  it('broken requires display text and forbids a target', () => {
    const target = insertNote('T2', 't2')
    expect(() => insertLink('broken', { target, display: 'T2' })).toThrow(/CHECK/i)
    expect(() => insertLink('broken', { display: 'T2' })).not.toThrow()
  })
})

describe('invariant 2: root protection triggers', () => {
  it('refuses to trash the root node', () => {
    expect(() =>
      project.db.run(
        "UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?",
        project.rootNodeId,
      ),
    ).toThrow(/EW_ROOT_NODE_PROTECTED/)
  })

  it('refuses to delete the root node', () => {
    expect(() =>
      project.db.run('DELETE FROM node WHERE id = ?', project.rootNodeId),
    ).toThrow(/EW_ROOT_NODE_PROTECTED/)
  })

  it('refuses to trash or delete the root canvas', () => {
    expect(() =>
      project.db.run(
        "UPDATE canvas SET lifecycle_state = 'trashed' WHERE id = ?",
        project.rootCanvasId,
      ),
    ).toThrow(/EW_ROOT_CANVAS_PROTECTED/)
    expect(() =>
      project.db.run('DELETE FROM canvas WHERE id = ?', project.rootCanvasId),
    ).toThrow(/EW_ROOT_CANVAS_PROTECTED/)
  })

  it('allows trashing a non-root node', () => {
    const nodeId = insertNode()
    expect(() =>
      project.db.run("UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?", nodeId),
    ).not.toThrow()
  })
})

describe('transactions', () => {
  it('roll back the whole scope on failure, including nesting', () => {
    expect(() =>
      project.db.transaction(() => {
        insertNote('Keep Me', 'keep me')
        project.db.transaction(() => {
          insertNote('Inner', 'inner')
        })
        throw new Error('boom')
      }),
    ).toThrow('boom')
    const titles = project.db.all("SELECT title FROM note WHERE title_key IN ('keep me', 'inner')")
    expect(titles).toHaveLength(0)
  })

  it('inner rollback preserves outer work', () => {
    project.db.transaction(() => {
      insertNote('Outer', 'outer')
      try {
        project.db.transaction(() => {
          insertNote('Inner', 'inner')
          throw new Error('inner boom')
        })
      } catch {
        // inner rolled back, outer continues
      }
    })
    expect(project.db.get("SELECT id FROM note WHERE title_key = 'outer'")).toBeDefined()
    expect(project.db.get("SELECT id FROM note WHERE title_key = 'inner'")).toBeUndefined()
  })
})
