import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { titleKey, uuidv7 } from '@ew/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommandContext } from './dispatcher'
import { bindUnresolvedMatching, refreshNoteLinks } from './links'
import { createProject, type ProjectHandle } from './project'

let dir: string
let handle: ProjectHandle
let ctx: CommandContext

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-links-'))
  handle = createProject(dir, 'Links Test')
  ctx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
    now: () => new Date().toISOString(),
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

interface LinkRow {
  id: string
  source_note_id: string
  source_revision: number
  range_start: number
  range_end: number
  state: string
  target_note_id: string | null
  target_title_key: string | null
  display_text: string | null
}

function insertNote(title: string, body = '', lifecycle: 'active' | 'trashed' = 'active'): string {
  const id = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO note (id, project_id, title, title_key, body, lifecycle_state,
                       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    handle.projectId,
    title,
    titleKey(title),
    body,
    lifecycle,
    now,
    now,
  )
  return id
}

function linksOf(noteId: string): LinkRow[] {
  return handle.db.all<LinkRow>(
    'SELECT * FROM link WHERE source_note_id = ? ORDER BY range_start',
    noteId,
  )
}

describe('refreshNoteLinks (§7.1)', () => {
  it('writes one record per token: bound to active notes, else unresolved (invariant 26)', () => {
    const target = insertNote('Ghost Ship')
    const source = insertNote('Log', 'saw [[Ghost Ship]] and [[Kraken]] at [[ghost SHIP|sea]]')

    refreshNoteLinks(ctx, source)

    const rows = linksOf(source)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      state: 'bound',
      target_note_id: target,
      target_title_key: null,
      display_text: null,
    })
    expect(rows[1]).toMatchObject({
      state: 'unresolved',
      target_note_id: null,
      target_title_key: 'kraken',
      display_text: 'Kraken',
    })
    // Case-insensitive resolution via title_key, aliased form included.
    expect(rows[2]).toMatchObject({ state: 'bound', target_note_id: target })

    // Ranges slice the body back to the tokens.
    const body = 'saw [[Ghost Ship]] and [[Kraken]] at [[ghost SHIP|sea]]'
    expect(body.slice(rows[0].range_start, rows[0].range_end)).toBe('[[Ghost Ship]]')
    expect(body.slice(rows[1].range_start, rows[1].range_end)).toBe('[[Kraken]]')
    expect(body.slice(rows[2].range_start, rows[2].range_end)).toBe('[[ghost SHIP|sea]]')
  })

  it('binds tokens matching a trashed note (§7.1: reservation stays resolvable)', () => {
    const trashed = insertNote('Sunken City', '', 'trashed')
    const source = insertNote('Log', 'about [[Sunken City]]')

    refreshNoteLinks(ctx, source)

    expect(linksOf(source)[0]).toMatchObject({ state: 'bound', target_note_id: trashed })
  })

  it('replaces prior outbound records instead of accumulating', () => {
    const source = insertNote('Log', '[[One]] [[Two]]')
    refreshNoteLinks(ctx, source)
    const before = linksOf(source)
    expect(before).toHaveLength(2)

    handle.db.run('UPDATE note SET body = ? WHERE id = ?', 'only [[Three]]', source)
    refreshNoteLinks(ctx, source)

    const after = linksOf(source)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ state: 'unresolved', target_title_key: 'three' })
    expect(before.map((r) => r.id)).not.toContain(after[0].id)
  })

  it('preserves broken state across refresh, even when a matching active note exists', () => {
    const source = insertNote('Log', 'lost [[Old Target]] here')
    const now = new Date().toISOString()
    handle.db.run(
      `INSERT INTO link (id, project_id, source_note_id, source_revision, range_start,
                         range_end, state, target_note_id, target_title_key, display_text,
                         created_at, updated_at)
       VALUES (?, ?, ?, 1, 5, 21, 'broken', NULL, NULL, 'Old Target', ?, ?)`,
      uuidv7(),
      handle.projectId,
      source,
      now,
      now,
    )
    // A new note reclaims the purged title: broken must NOT re-bind.
    insertNote('Old Target')

    refreshNoteLinks(ctx, source)

    const rows = linksOf(source)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      state: 'broken',
      target_note_id: null,
      display_text: 'Old Target',
    })
  })

  it('stamps source_revision as the committing revision (project_revision + 1)', () => {
    handle.db.run('UPDATE project SET project_revision = 41 WHERE id = ?', handle.projectId)
    const source = insertNote('Log', '[[Somewhere]]')

    refreshNoteLinks(ctx, source)

    expect(linksOf(source)[0].source_revision).toBe(42)
  })

  it('throws NOTE_NOT_FOUND for an unknown note', () => {
    expect(() => refreshNoteLinks(ctx, 'nope')).toThrowError(/no note/)
  })
})

describe('bindUnresolvedMatching (§7.1 re-resolution sweep)', () => {
  it('binds matching unresolved records project-wide, leaves other keys alone', () => {
    const a = insertNote('A', 'see [[Ghost Ship]]')
    const b = insertNote('B', 'also [[ghost   ship|it]] and [[Kraken]]')
    refreshNoteLinks(ctx, a)
    refreshNoteLinks(ctx, b)

    const target = insertNote('Ghost Ship')
    const affected = bindUnresolvedMatching(ctx, 'ghost ship', target)

    expect(affected).toHaveLength(2)
    for (const row of [...linksOf(a), ...linksOf(b)]) {
      if (row.target_title_key === 'kraken') {
        expect(row.state).toBe('unresolved')
      } else {
        expect(row).toMatchObject({
          state: 'bound',
          target_note_id: target,
          target_title_key: null,
          display_text: null,
        })
      }
    }
  })

  it('never touches broken records (invariant 27)', () => {
    const source = insertNote('Log')
    const now = new Date().toISOString()
    const brokenId = uuidv7()
    handle.db.run(
      `INSERT INTO link (id, project_id, source_note_id, source_revision, range_start,
                         range_end, state, target_note_id, target_title_key, display_text,
                         created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 14, 'broken', NULL, 'ghost ship', 'Ghost Ship', ?, ?)`,
      brokenId,
      handle.projectId,
      source,
      now,
      now,
    )

    const target = insertNote('Ghost Ship')
    const affected = bindUnresolvedMatching(ctx, 'ghost ship', target)

    expect(affected).toHaveLength(0)
    expect(linksOf(source)[0]).toMatchObject({
      id: brokenId,
      state: 'broken',
      target_note_id: null,
    })
  })

  it('returns an empty list when nothing matches', () => {
    const target = insertNote('Lonely')
    expect(bindUnresolvedMatching(ctx, 'lonely', target)).toEqual([])
  })
})
