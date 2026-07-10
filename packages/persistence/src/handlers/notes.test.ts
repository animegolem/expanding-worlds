import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { titleKey, uuidv7 } from '@ew/domain'
import {
  CommandRegistry,
  type CommandEnvelope,
  type CommandResult,
  type CommittedResult,
  type ErrorResult,
} from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { QueryRegistry } from '../queries'
import { registerNoteQueries, type PhantomView } from '../queries-notes'
import { registerNodeHandlers } from './nodes'
import { registerNoteHandlers } from './notes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-notes-'))
  handle = createProject(dir, 'Notes Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerNoteQueries(queries)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function execute(commandType: string, payload: unknown): CommandResult {
  return dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  } satisfies CommandEnvelope)
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = execute(commandType, payload)
  expect(result.status).toBe('committed')
  return result as CommittedResult
}

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  committed('CreateNote', { noteId, title, body })
  return noteId
}

interface LinkRow {
  id: string
  source_note_id: string
  range_start: number
  range_end: number
  state: string
  target_note_id: string | null
  target_title_key: string | null
  display_text: string | null
}

function linksOf(noteId: string): LinkRow[] {
  return handle.db.all<LinkRow>(
    'SELECT * FROM link WHERE source_note_id = ? ORDER BY range_start',
    noteId,
  )
}

function noteRow(noteId: string) {
  return handle.db.get<{ title: string; title_key: string; body: string }>(
    'SELECT title, title_key, body FROM note WHERE id = ?',
    noteId,
  )
}

function getPhantom(key: string): PhantomView | null {
  const result = queries.run(
    { db: handle.db, projectId: handle.projectId, rootNodeId: handle.rootNodeId, rootCanvasId: handle.rootCanvasId },
    'getPhantom',
    { titleKey: key },
  )
  expect(result.ok).toBe(true)
  return (result as { result: PhantomView | null }).result
}

function commandLogCount(): number {
  return handle.db.get<{ n: number }>('SELECT count(*) AS n FROM command_log')!.n
}

describe('CreateNote', () => {
  it('creates the note with normalized title_key and stores the body', () => {
    const noteId = uuidv7()
    const result = committed('CreateNote', {
      noteId,
      title: '  Ghost   SHIP ',
      body: 'a hull',
    })
    expect(result.affected).toContainEqual({ kind: 'note', id: noteId })
    // AI-IMP-013: undo of CreateNote trashes rather than purges, so it
    // never refuses once links or nodes reference the note.
    expect(result.inverse).toMatchObject({ commandType: 'TrashNote', payload: { noteId } })
    expect(noteRow(noteId)).toMatchObject({
      title: '  Ghost   SHIP ',
      title_key: 'ghost ship',
      body: 'a hull',
    })
  })

  it('returns NOTE_TITLE_CONFLICT (§7.7) against an active note', () => {
    const existing = createNote('Ghost Ship')
    const result = execute('CreateNote', { noteId: uuidv7(), title: 'GHOST ship' })
    expect(result).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: {
        existingNoteId: existing,
        requestedTitle: 'GHOST ship',
        titleKey: 'ghost ship',
        conflictingLifecycle: 'active',
      },
    })
  })

  it('returns NOTE_TITLE_CONFLICT against a trashed note (invariant 5)', () => {
    const existing = createNote('Ghost Ship')
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", existing)

    const result = execute('CreateNote', { noteId: uuidv7(), title: 'Ghost Ship' })
    expect(result).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: { existingNoteId: existing, conflictingLifecycle: 'trashed' },
    })
  })

  it('rejects titles that cannot be written as wiki-link tokens', () => {
    for (const title of ['a[b', 'a]b', 'a|b', 'a\nb', '   ']) {
      const result = execute('CreateNote', { noteId: uuidv7(), title })
      expect(result).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    }
  })

  it('resolves its own body tokens on create, including self-references', () => {
    const other = createNote('Harbor')
    const noteId = createNote('Ghost Ship', 'moored at [[Harbor]], aka [[Ghost Ship]]')
    const rows = linksOf(noteId)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ state: 'bound', target_note_id: other })
    expect(rows[1]).toMatchObject({ state: 'bound', target_note_id: noteId })
  })
})

describe('UpdateNote and link refresh on save', () => {
  it('keeps exactly one link record per token in exactly one state (invariant 26)', () => {
    const target = createNote('Harbor')
    const noteId = createNote('Log')
    committed('UpdateNote', { noteId, body: '[[Harbor]] then [[Open Sea]] then [[Harbor|home]]' })

    const rows = linksOf(noteId)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(['bound', 'unresolved', 'broken']).toContain(row.state)
    }
    expect(rows.filter((r) => r.state === 'bound')).toHaveLength(2)
    expect(rows.filter((r) => r.state === 'unresolved')).toHaveLength(1)
    expect(rows[0].target_note_id).toBe(target)

    // A second save replaces, never accumulates.
    committed('UpdateNote', { noteId, body: 'now only [[Open Sea]]' })
    const after = linksOf(noteId)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ state: 'unresolved', target_title_key: 'open sea' })
  })

  it('binds a token matching a trashed note (§7.1)', () => {
    const trashed = createNote('Sunken City')
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", trashed)

    const noteId = createNote('Log')
    committed('UpdateNote', { noteId, body: 'dive to [[Sunken City]]' })
    expect(linksOf(noteId)[0]).toMatchObject({ state: 'bound', target_note_id: trashed })
  })

  it('round-trips through its inverse (prior body) via the dispatcher', () => {
    const noteId = createNote('Log', 'original [[Here]]')
    const update = committed('UpdateNote', { noteId, body: 'changed [[There]]' })
    expect(update.inverse).toMatchObject({
      commandType: 'UpdateNote',
      payload: { noteId, body: 'original [[Here]]' },
    })

    committed(update.inverse!.commandType, update.inverse!.payload)
    expect(noteRow(noteId)!.body).toBe('original [[Here]]')
    expect(linksOf(noteId)[0]).toMatchObject({ state: 'unresolved', target_title_key: 'here' })
  })

  it('refuses unknown and trashed notes', () => {
    expect(execute('UpdateNote', { noteId: uuidv7(), body: 'x' })).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_FOUND',
    })
    const noteId = createNote('Log')
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)
    expect(execute('UpdateNote', { noteId, body: 'x' })).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_ACTIVE',
    })
  })
})

describe('phantoms and the re-resolution sweep (invariants 27, 28)', () => {
  it('acceptance: two notes reference [[Ghost Ship]], creation binds both, rename rewrites', () => {
    const a = createNote('A', 'ahead: [[Ghost Ship]]!')
    const b = createNote('B', 'we saw [[Ghost Ship|the ship]] too')

    // Phantom = projection only: no note row, no title reservation.
    expect(
      handle.db.get('SELECT id FROM note WHERE title_key = ?', 'ghost ship'),
    ).toBeUndefined()
    const phantom = getPhantom('ghost ship')
    expect(phantom).toMatchObject({ titleKey: 'ghost ship', title: 'Ghost Ship', referenceCount: 2 })
    expect(phantom!.sources.map((s) => s.noteId).sort()).toEqual([a, b].sort())
    expect(linksOf(a)[0]).toMatchObject({ state: 'unresolved', target_title_key: 'ghost ship' })
    expect(linksOf(b)[0]).toMatchObject({ state: 'unresolved', display_text: 'Ghost Ship' })

    // Materialization binds all references in the same command.
    const ghost = uuidv7()
    const create = committed('CreateNote', { noteId: ghost, title: 'Ghost Ship' })
    expect(linksOf(a)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
    expect(linksOf(b)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
    expect(create.affected).toContainEqual({ kind: 'link', id: linksOf(a)[0].id })
    expect(getPhantom('ghost ship')).toBeNull()

    // Rename rewrites the unaliased token, preserves the alias display
    // text, keeps records bound, and appends exactly one command_log row.
    const logBefore = commandLogCount()
    const rename = committed('RenameNote', { noteId: ghost, title: 'Ghost Fleet' })
    expect(commandLogCount()).toBe(logBefore + 1)

    expect(noteRow(a)!.body).toBe('ahead: [[Ghost Fleet]]!')
    expect(noteRow(b)!.body).toBe('we saw [[Ghost Fleet|the ship]] too')
    expect(linksOf(a)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
    expect(linksOf(b)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
    expect(rename.affected).toContainEqual({ kind: 'note', id: a })
    expect(rename.affected).toContainEqual({ kind: 'note', id: b })

    // Rebuilt ranges slice the rewritten bodies back to the tokens.
    const rowA = linksOf(a)[0]
    expect(noteRow(a)!.body.slice(rowA.range_start, rowA.range_end)).toBe('[[Ghost Fleet]]')
    const rowB = linksOf(b)[0]
    expect(noteRow(b)!.body.slice(rowB.range_start, rowB.range_end)).toBe(
      '[[Ghost Fleet|the ship]]',
    )
  })

  it('sweep on rename binds unresolved records matching the NEW title', () => {
    const c = createNote('C', 'awaiting [[Ghost Fleet]]')
    const ghost = createNote('Ghost Ship')
    expect(linksOf(c)[0].state).toBe('unresolved')

    committed('RenameNote', { noteId: ghost, title: 'Ghost Fleet' })
    expect(linksOf(c)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
  })

  it('sweep never touches broken records (invariant 27)', () => {
    const source = createNote('Log')
    const now = new Date().toISOString()
    const brokenId = uuidv7()
    handle.db.run(
      `INSERT INTO link (id, project_id, source_note_id, source_revision, range_start,
                         range_end, state, target_note_id, target_title_key, display_text,
                         created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 14, 'broken', NULL, NULL, 'Ghost Ship', ?, ?)`,
      brokenId,
      handle.projectId,
      source,
      now,
      now,
    )

    createNote('Ghost Ship')
    expect(
      handle.db.get<LinkRow>('SELECT * FROM link WHERE id = ?', brokenId),
    ).toMatchObject({ state: 'broken', target_note_id: null })
  })
})

describe('RenameNote', () => {
  it('returns NOTE_TITLE_CONFLICT for both active and trashed conflicts (§7.7)', () => {
    const active = createNote('Harbor')
    const trashed = createNote('Sunken City')
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", trashed)
    const noteId = createNote('Log')

    const vsActive = execute('RenameNote', { noteId, title: 'HARBOR' }) as ErrorResult
    expect(vsActive).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: {
        existingNoteId: active,
        requestedTitle: 'HARBOR',
        titleKey: 'harbor',
        conflictingLifecycle: 'active',
      },
    })
    const vsTrashed = execute('RenameNote', { noteId, title: 'Sunken City' })
    expect(vsTrashed).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: { existingNoteId: trashed, conflictingLifecycle: 'trashed' },
    })
    // A failed rename leaves the note untouched.
    expect(noteRow(noteId)).toMatchObject({ title: 'Log', title_key: 'log' })
  })

  it('allows a display-only rename to a different spelling of the same key', () => {
    const source = createNote('Log', 'the [[ghost ship]]')
    const ghost = createNote('ghost ship')
    committed('RenameNote', { noteId: ghost, title: 'Ghost Ship' })

    expect(noteRow(ghost)).toMatchObject({ title: 'Ghost Ship', title_key: 'ghost ship' })
    expect(noteRow(source)!.body).toBe('the [[Ghost Ship]]')
    expect(linksOf(source)[0]).toMatchObject({ state: 'bound', target_note_id: ghost })
  })

  it('round-trips through its inverse (prior title) via the dispatcher', () => {
    const source = createNote('Log', 'saw [[Ghost Ship]] and [[Ghost Ship|her]]')
    const ghost = createNote('Ghost Ship')

    const rename = committed('RenameNote', { noteId: ghost, title: 'Ghost Fleet' })
    expect(rename.inverse).toMatchObject({
      commandType: 'RenameNote',
      payload: { noteId: ghost, title: 'Ghost Ship' },
    })
    expect(noteRow(source)!.body).toBe('saw [[Ghost Fleet]] and [[Ghost Fleet|her]]')

    committed(rename.inverse!.commandType, rename.inverse!.payload)
    expect(noteRow(ghost)).toMatchObject({ title: 'Ghost Ship', title_key: 'ghost ship' })
    expect(noteRow(source)!.body).toBe('saw [[Ghost Ship]] and [[Ghost Ship|her]]')
    for (const row of linksOf(source)) {
      expect(row).toMatchObject({ state: 'bound', target_note_id: ghost })
    }
  })
})

describe('PurgeDraftNote (standalone draft removal since AI-IMP-013)', () => {
  it('removes the note, its outbound records, and frees the title', () => {
    const noteId = uuidv7()
    committed('CreateNote', {
      noteId,
      title: 'Draft',
      body: 'links [[Elsewhere]]',
    })

    const purge = committed('PurgeDraftNote', { noteId })
    expect(noteRow(noteId)).toBeUndefined()
    expect(linksOf(noteId)).toHaveLength(0)
    // Inverse of the inverse recreates the note with title and body.
    expect(purge.inverse).toMatchObject({
      commandType: 'CreateNote',
      payload: { noteId, title: 'Draft', body: 'links [[Elsewhere]]' },
    })
    committed(purge.inverse!.commandType, purge.inverse!.payload)
    expect(noteRow(noteId)).toMatchObject({ title: 'Draft', body: 'links [[Elsewhere]]' })
  })

  it('refuses when another note holds a link record to it', () => {
    const target = createNote('Ghost Ship')
    createNote('Log', 'saw [[Ghost Ship]]')

    const result = execute('PurgeDraftNote', { noteId: target })
    expect(result).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_DRAFT',
      details: { inboundLinkCount: 1, referencingNodeCount: 0 },
    })
    expect(noteRow(target)).toBeDefined()
  })

  it('refuses when a node references the note', () => {
    const noteId = createNote('Embodied')
    const nodeId = uuidv7()
    committed('CreateNode', { nodeId })
    handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', noteId, nodeId)

    expect(execute('PurgeDraftNote', { noteId })).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_DRAFT',
      details: { inboundLinkCount: 0, referencingNodeCount: 1 },
    })
  })

  it('allows self-links only', () => {
    const noteId = createNote('Loop', 'I am [[Loop]]')
    expect(linksOf(noteId)[0]).toMatchObject({ state: 'bound', target_note_id: noteId })
    committed('PurgeDraftNote', { noteId })
    expect(noteRow(noteId)).toBeUndefined()
  })
})

describe('titleKey consistency', () => {
  it('command handlers and the domain function agree on normalization', () => {
    const noteId = createNote('  Ærøskøbing   HÖHLE ')
    expect(noteRow(noteId)!.title_key).toBe(titleKey('  Ærøskøbing   HÖHLE '))
  })
})

describe('RelinkBrokenLinks / BreakNoteLinks (§7.1, AI-IMP-048)', () => {
  function breakLinks(sourceId: string, displayText: string): void {
    handle.db.run(
      `UPDATE link SET state = 'broken', target_note_id = NULL,
              target_title_key = NULL, display_text = ?
       WHERE source_note_id = ?`,
      displayText,
      sourceId,
    )
  }

  function linkStates(sourceId: string): Array<{ state: string; target_note_id: string | null }> {
    return handle.db.all(
      'SELECT state, target_note_id FROM link WHERE source_note_id = ? ORDER BY range_start',
      sourceId,
    )
  }

  it('relinks to an existing active note with a matching title_key', () => {
    const oldId = createNote('Doomed')
    const sourceId = createNote('Log', 'see [[Doomed]] and [[Doomed|them]]')
    breakLinks(sourceId, 'Doomed')
    committed('PurgeDraftNote', { noteId: oldId })
    const newId = createNote('doomed') // same key, records stay broken
    expect(linkStates(sourceId).every((l) => l.state === 'broken')).toBe(true)

    const relink = committed('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      targetNoteId: newId,
    })
    expect(linkStates(sourceId)).toEqual([
      { state: 'bound', target_note_id: newId },
      { state: 'bound', target_note_id: newId },
    ])

    // Inverse restores broken; its own inverse relinks again.
    expect(relink.inverse).toMatchObject({ commandType: 'BreakNoteLinks' })
    const broke = committed(relink.inverse!.commandType, relink.inverse!.payload)
    expect(linkStates(sourceId).every((l) => l.state === 'broken')).toBe(true)
    committed(broke.inverse!.commandType, broke.inverse!.payload)
    expect(linkStates(sourceId).every((l) => l.state === 'bound')).toBe(true)
  })

  it('recreates from display text in the same transaction and sweeps other sources', () => {
    const oldId = createNote('Doomed')
    const sourceId = createNote('Log', 'see [[Doomed]]')
    const otherId = createNote('Other', 'more [[Doomed]]')
    breakLinks(sourceId, 'Doomed')
    handle.db.run('DELETE FROM link WHERE source_note_id = ?', otherId)
    committed('PurgeDraftNote', { noteId: oldId })
    // Other's token is unresolved after a save (no note, no broken record).
    committed('UpdateNote', { noteId: otherId, body: 'more [[Doomed]]' })

    const newNoteId = uuidv7()
    const before = handle.db.get<{ project_revision: number }>(
      'SELECT project_revision FROM project WHERE id = ?',
      handle.projectId,
    )!.project_revision
    committed('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      create: { noteId: newNoteId, title: 'Doomed' },
    })
    const after = handle.db.get<{ project_revision: number }>(
      'SELECT project_revision FROM project WHERE id = ?',
      handle.projectId,
    )!.project_revision
    expect(after).toBe(before + 1) // one user-level command

    expect(linkStates(sourceId)).toEqual([{ state: 'bound', target_note_id: newNoteId }])
    // The sweep bound the OTHER source's unresolved token too.
    expect(linkStates(otherId)).toEqual([{ state: 'bound', target_note_id: newNoteId }])
  })

  it('relink-CREATE undo removes the created note when safe, redo re-creates it (CA-008)', () => {
    const oldId = createNote('Doomed')
    const sourceId = createNote('Log', 'see [[Doomed]] and [[Doomed|again]]')
    breakLinks(sourceId, 'Doomed')
    committed('PurgeDraftNote', { noteId: oldId })

    const newNoteId = uuidv7()
    const relink = committed('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      create: { noteId: newNoteId, title: 'Doomed' },
    })
    expect(noteRow(newNoteId)).toBeDefined()
    expect(linkStates(sourceId).every((l) => l.state === 'bound')).toBe(true)

    // The inverse carries the created id/title so undo can also remove it.
    expect(relink.inverse).toMatchObject({
      commandType: 'BreakNoteLinks',
      payload: { removeCreatedNoteId: newNoteId, createdTitle: 'Doomed' },
    })

    // Undo: links re-broken AND the created note (untouched, empty body) is
    // gone — no orphan note, no lingering unique-title reservation.
    const broke = committed(relink.inverse!.commandType, relink.inverse!.payload)
    expect(linkStates(sourceId).every((l) => l.state === 'broken')).toBe(true)
    expect(noteRow(newNoteId)).toBeUndefined()
    expect(broke.affected).toContainEqual({ kind: 'note', id: newNoteId })

    // Redo re-creates the note via the relink `create` branch and re-binds.
    expect(broke.inverse).toMatchObject({
      commandType: 'RelinkBrokenLinks',
      payload: { create: { noteId: newNoteId, title: 'Doomed' } },
    })
    committed(broke.inverse!.commandType, broke.inverse!.payload)
    expect(noteRow(newNoteId)).toBeDefined()
    expect(linkStates(sourceId).every((l) => l.state === 'bound')).toBe(true)
  })

  it('relink-CREATE undo LEAVES the note when it was edited since create (unsafe)', () => {
    const oldId = createNote('Doomed')
    const sourceId = createNote('Log', 'see [[Doomed]]')
    breakLinks(sourceId, 'Doomed')
    committed('PurgeDraftNote', { noteId: oldId })

    const newNoteId = uuidv7()
    committed('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      create: { noteId: newNoteId, title: 'Doomed' },
    })
    // The user starts writing in the freshly-created note.
    committed('UpdateNote', { noteId: newNoteId, body: 'real content now' })

    // Undo breaks the links but must NOT delete the edited note.
    const broke = committed('BreakNoteLinks', {
      linkIds: linksOf(sourceId).map((l) => l.id),
      displayTitle: 'Doomed',
      removeCreatedNoteId: newNoteId,
      createdTitle: 'Doomed',
    })
    expect(linkStates(sourceId).every((l) => l.state === 'broken')).toBe(true)
    expect(noteRow(newNoteId)).toBeDefined()
    expect(noteRow(newNoteId)!.body).toBe('real content now')
    // Redo re-binds to the surviving note (target branch), not re-create.
    expect(broke.inverse).toMatchObject({
      commandType: 'RelinkBrokenLinks',
      payload: { targetNoteId: newNoteId },
    })
  })

  it('relink-CREATE undo LEAVES the note when the sweep bound another source (unsafe)', () => {
    const oldId = createNote('Doomed')
    const sourceId = createNote('Log', 'see [[Doomed]]')
    const otherId = createNote('Other', 'more [[Doomed]]')
    breakLinks(sourceId, 'Doomed')
    handle.db.run('DELETE FROM link WHERE source_note_id = ?', otherId)
    committed('PurgeDraftNote', { noteId: oldId })
    committed('UpdateNote', { noteId: otherId, body: 'more [[Doomed]]' })

    const newNoteId = uuidv7()
    const relink = committed('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      create: { noteId: newNoteId, title: 'Doomed' },
    })
    // The sweep bound Other's token to the new note.
    expect(linkStates(otherId)).toEqual([{ state: 'bound', target_note_id: newNoteId }])

    // Undo re-breaks source's links, but the note stays because Other still
    // binds to it — removing it would orphan Other's link.
    committed(relink.inverse!.commandType, relink.inverse!.payload)
    expect(noteRow(newNoteId)).toBeDefined()
    expect(linkStates(otherId)).toEqual([{ state: 'bound', target_note_id: newNoteId }])
  })

  it('rejects key mismatches, missing broken records, and ambiguous payloads', () => {
    const sourceId = createNote('Log', 'see [[Doomed]]')
    const strangerId = createNote('Stranger')
    breakLinks(sourceId, 'Doomed')

    const mismatch = execute('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      targetNoteId: strangerId,
    })
    expect(mismatch).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })

    const none = execute('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Nothing Here',
      create: { noteId: uuidv7(), title: 'Nothing Here' },
    })
    expect(none).toMatchObject({ status: 'error', code: 'NO_BROKEN_LINKS' })

    const both = execute('RelinkBrokenLinks', {
      sourceNoteId: sourceId,
      displayTitle: 'Doomed',
      targetNoteId: strangerId,
      create: { noteId: uuidv7(), title: 'Doomed' },
    })
    expect(both).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})
