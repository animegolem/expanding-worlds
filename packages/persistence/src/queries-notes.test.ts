import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommandEnvelope } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerNoteHandlers } from './handlers/notes'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import {
  registerNoteQueries,
  type PhantomView,
  type TitleSuggestion,
} from './queries-notes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-notequeries-'))
  handle = createProject(dir, 'Note Queries Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNoteHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerNoteQueries(queries)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType: 'CreateNote',
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload: { noteId, title, body },
  } satisfies CommandEnvelope)
  expect(result.status).toBe('committed')
  return noteId
}

function trash(noteId: string): void {
  handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)
}

function run<T>(name: string, args?: unknown): T {
  const result = queries.run(
    {
      db: handle.db,
      projectId: handle.projectId,
      rootNodeId: handle.rootNodeId,
      rootCanvasId: handle.rootCanvasId,
    },
    name,
    args,
  )
  expect(result).toMatchObject({ ok: true })
  return (result as { result: T }).result
}

describe('getNote / listNotes', () => {
  it('getNote returns the camelCase record or null', () => {
    const noteId = createNote('Ghost Ship', 'a hull')
    expect(run('getNote', { noteId })).toMatchObject({
      id: noteId,
      title: 'Ghost Ship',
      titleKey: 'ghost ship',
      body: 'a hull',
      lifecycleState: 'active',
    })
    expect(run('getNote', { noteId: 'missing' })).toBeNull()
  })

  it('listNotes returns active notes ordered by title_key', () => {
    createNote('zebra')
    createNote('Anchor')
    const gone = createNote('Middle')
    trash(gone)

    const notes = run<Array<{ title: string }>>('listNotes')
    expect(notes.map((n) => n.title)).toEqual(['Anchor', 'zebra'])
  })
})

describe('suggestTitles (§7.2)', () => {
  it('returns active titles, phantom titles with counts, and trashed titles flagged', () => {
    createNote('Ghost Ship')
    const wreck = createNote('Ghostly Wreck')
    trash(wreck)
    createNote('A', 'see [[Ghost Fleet]]')
    createNote('B', 'also [[ghost fleet|them]] and [[Kraken]]')

    const suggestions = run<TitleSuggestion[]>('suggestTitles', { query: 'GHOST' })
    expect(suggestions).toHaveLength(3)

    expect(suggestions).toContainEqual({
      title: 'Ghost Ship',
      titleKey: 'ghost ship',
      noteId: expect.any(String),
      phantom: false,
      inTrash: false,
      referenceCount: null,
    })
    expect(suggestions).toContainEqual({
      title: 'Ghostly Wreck',
      titleKey: 'ghostly wreck',
      noteId: wreck,
      phantom: false,
      inTrash: true,
      referenceCount: null,
    })
    // Phantom spelling comes from the earliest unresolved record.
    expect(suggestions).toContainEqual({
      title: 'Ghost Fleet',
      titleKey: 'ghost fleet',
      noteId: null,
      phantom: true,
      inTrash: false,
      referenceCount: 2,
    })
  })

  it('matches by title_key substring, normalizing the query', () => {
    createNote('Ghost Ship')
    expect(run<TitleSuggestion[]>('suggestTitles', { query: '  ST   SH ' })).toHaveLength(1)
    expect(run<TitleSuggestion[]>('suggestTitles', { query: 'kraken' })).toHaveLength(0)
  })

  it('treats LIKE wildcards in the query literally', () => {
    createNote('Ghost Ship')
    createNote('100% Proof')
    const percent = run<TitleSuggestion[]>('suggestTitles', { query: '%' })
    expect(percent.map((s) => s.title)).toEqual(['100% Proof'])
    expect(run<TitleSuggestion[]>('suggestTitles', { query: '_' })).toHaveLength(0)
  })
})

describe('getPhantom (§7.2, invariant 28)', () => {
  it('groups references by source note and derives the would-be title', () => {
    const a = createNote('A', 'one [[Ghost Fleet]] and two [[Ghost Fleet|them]]')
    const b = createNote('B', 'three [[ghost FLEET]]')

    const phantom = run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })
    expect(phantom).toMatchObject({
      titleKey: 'ghost fleet',
      title: 'Ghost Fleet',
      referenceCount: 3,
    })
    expect(phantom.sources).toHaveLength(2)
    const sourceA = phantom.sources.find((s) => s.noteId === a)!
    expect(sourceA.noteTitle).toBe('A')
    expect(sourceA.references).toHaveLength(2)
    const sourceB = phantom.sources.find((s) => s.noteId === b)!
    expect(sourceB.references[0].displayText).toBe('ghost FLEET')

    // Ranges point back at the tokens in the source bodies.
    const bodyA = 'one [[Ghost Fleet]] and two [[Ghost Fleet|them]]'
    const ref = sourceA.references[0]
    expect(bodyA.slice(ref.rangeStart, ref.rangeEnd)).toBe('[[Ghost Fleet]]')
  })

  it('normalizes the requested key and returns null when no phantom exists', () => {
    createNote('A', 'see [[Ghost Fleet]]')
    expect(run<PhantomView>('getPhantom', { titleKey: ' Ghost  FLEET ' })).not.toBeNull()
    expect(run<PhantomView | null>('getPhantom', { titleKey: 'kraken' })).toBeNull()
  })

  it('is a projection only: no note row exists for a phantom (invariant 28)', () => {
    createNote('A', 'see [[Ghost Fleet]]')
    expect(run<PhantomView>('getPhantom', { titleKey: 'ghost fleet' })).not.toBeNull()
    expect(
      handle.db.get('SELECT id FROM note WHERE title_key = ?', 'ghost fleet'),
    ).toBeUndefined()
    // No reservation either: the title is still creatable.
    expect(createNote('Ghost Fleet')).toBeDefined()
    expect(run<PhantomView | null>('getPhantom', { titleKey: 'ghost fleet' })).toBeNull()
  })
})
