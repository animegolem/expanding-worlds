import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { titleKey, uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { refreshNoteLinks } from '../links'
import { createProject, type ProjectHandle } from '../project'
import { registerNodeHandlers } from './nodes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-node-'))
  handle = createProject(dir, 'Node Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function exec(commandType: string, payload: unknown) {
  return dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = exec(commandType, payload)
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

/** Note rows are AI-IMP-011's commands; tests seed them directly. */
function insertNote(title: string, body = '', lifecycle: 'active' | 'trashed' = 'active'): string {
  const noteId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO note (id, project_id, title, title_key, body, lifecycle_state,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    noteId,
    handle.projectId,
    title,
    titleKey(title),
    body,
    lifecycle,
    now,
    now,
  )
  return noteId
}

function insertAsset(): string {
  const assetId = uuidv7()
  const now = new Date().toISOString()
  handle.db.run(
    `INSERT INTO asset (id, project_id, kind, content_hash, original_filename,
       mime_type, storage_path, created_at, updated_at)
     VALUES (?, ?, 'image', 'hash', 'a.png', 'image/png', 'assets/a.png', ?, ?)`,
    assetId,
    handle.projectId,
    now,
    now,
  )
  return assetId
}

function nodeRow(id: string) {
  return handle.db.get<Record<string, unknown>>('SELECT * FROM node WHERE id = ?', id)
}

describe('AttachNoteToNode / DetachNoteFromNode (§6.6)', () => {
  it('attaches a note and rejects a second one (invariant 3)', () => {
    const nodeId = createNode()
    const noteId = insertNote('Person')
    const attach = committed('AttachNoteToNode', { nodeId, noteId })
    expect(nodeRow(nodeId)!.note_id).toBe(noteId)
    expect(attach.inverse).toMatchObject({ commandType: 'DetachNoteFromNode' })

    expect(exec('AttachNoteToNode', { nodeId, noteId: insertNote('Other') })).toMatchObject({
      status: 'error',
      code: 'NODE_HAS_NOTE',
      details: { nodeId, noteId },
    })
  })

  it('rejects missing and trashed notes', () => {
    const nodeId = createNode()
    expect(exec('AttachNoteToNode', { nodeId, noteId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'NOTE_NOT_FOUND',
    })
    const trashed = insertNote('Gone', '', 'trashed')
    expect(exec('AttachNoteToNode', { nodeId, noteId: trashed })).toMatchObject({
      status: 'error',
      code: 'NOTE_TRASHED',
    })
  })

  it('detaching from one node leaves the note and other nodes untouched (invariants 4, 12)', () => {
    const noteId = insertNote('Shared person', 'lore body')
    const nodeX = createNode()
    const nodeY = createNode()
    committed('AttachNoteToNode', { nodeId: nodeX, noteId })
    committed('AttachNoteToNode', { nodeId: nodeY, noteId })
    const noteBefore = handle.db.get('SELECT * FROM note WHERE id = ?', noteId)

    const detach = committed('DetachNoteFromNode', { nodeId: nodeX })
    expect(nodeRow(nodeX)!.note_id).toBeNull()
    expect(nodeRow(nodeY)!.note_id).toBe(noteId)
    expect(handle.db.get('SELECT * FROM note WHERE id = ?', noteId)).toEqual(noteBefore)

    // Detaching the last referent still leaves the note intact and active.
    committed('DetachNoteFromNode', { nodeId: nodeY })
    expect(handle.db.get('SELECT * FROM note WHERE id = ?', noteId)).toEqual(noteBefore)

    // Undo restores the original attachment.
    undo(detach.inverse)
    expect(nodeRow(nodeX)!.note_id).toBe(noteId)
  })

  it('rejects detaching when no note is attached', () => {
    const nodeId = createNode()
    expect(exec('DetachNoteFromNode', { nodeId })).toMatchObject({
      status: 'error',
      code: 'NODE_HAS_NO_NOTE',
    })
  })
})

describe('MakeNoteIndependent (§6.6, §7.7)', () => {
  it('copies the body into a new note under the new title and swaps the reference', () => {
    const sharedId = insertNote('Person', 'generic person lore')
    const nodeX = createNode()
    const nodeY = createNode()
    committed('AttachNoteToNode', { nodeId: nodeX, noteId: sharedId })
    committed('AttachNoteToNode', { nodeId: nodeY, noteId: sharedId })

    const newNoteId = uuidv7()
    const result = committed('MakeNoteIndependent', {
      nodeId: nodeX,
      newNoteId,
      newTitle: 'Captain Vane',
    })
    const newNote = handle.db.get<{ title: string; title_key: string; body: string }>(
      'SELECT title, title_key, body FROM note WHERE id = ?',
      newNoteId,
    )
    expect(newNote).toMatchObject({
      title: 'Captain Vane',
      title_key: 'captain vane',
      body: 'generic person lore',
    })
    expect(nodeRow(nodeX)!.note_id).toBe(newNoteId)
    // The other node keeps the shared note (invariant 12).
    expect(nodeRow(nodeY)!.note_id).toBe(sharedId)

    // Undo removes the copy and reattaches the shared note.
    undo(result.inverse)
    expect(nodeRow(nodeX)!.note_id).toBe(sharedId)
    expect(handle.db.get('SELECT id FROM note WHERE id = ?', newNoteId)).toBeUndefined()
  })

  it('returns the §7.7 structured conflict for active and trashed titles', () => {
    const sharedId = insertNote('Person')
    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId: sharedId })

    const activeConflict = insertNote('Taken Title')
    expect(
      exec('MakeNoteIndependent', { nodeId, newNoteId: uuidv7(), newTitle: ' TAKEN  title ' }),
    ).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: {
        existingNoteId: activeConflict,
        requestedTitle: ' TAKEN  title ',
        titleKey: 'taken title',
        conflictingLifecycle: 'active',
      },
    })

    // Invariant 5: trashed notes keep their title reservation.
    const trashedConflict = insertNote('Buried Title', '', 'trashed')
    expect(
      exec('MakeNoteIndependent', { nodeId, newNoteId: uuidv7(), newTitle: 'Buried Title' }),
    ).toMatchObject({
      status: 'error',
      code: 'NOTE_TITLE_CONFLICT',
      details: { existingNoteId: trashedConflict, conflictingLifecycle: 'trashed' },
    })
  })

  it('requires an attached note and a non-empty title', () => {
    const bare = createNode()
    expect(
      exec('MakeNoteIndependent', { nodeId: bare, newNoteId: uuidv7(), newTitle: 'X' }),
    ).toMatchObject({ status: 'error', code: 'NODE_HAS_NO_NOTE' })

    const nodeId = createNode()
    committed('AttachNoteToNode', { nodeId, noteId: insertNote('Person') })
    expect(
      exec('MakeNoteIndependent', { nodeId, newNoteId: uuidv7(), newTitle: '   ' }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})

describe('SetNodeAppearance (§4.6)', () => {
  it('sets dot, icon, and image appearances with prior-state inverses', () => {
    const nodeId = createNode()
    const dot = committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'dot', color: '#abc' },
    })
    expect(nodeRow(nodeId)).toMatchObject({ appearance_kind: 'dot', appearance_color: '#abc' })
    expect(dot.inverse).toMatchObject({ payload: { nodeId, appearance: null } })

    const icon = committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'icon', icon: 'castle' },
    })
    expect(nodeRow(nodeId)).toMatchObject({
      appearance_kind: 'icon',
      appearance_icon: 'castle',
      appearance_color: null,
    })

    const assetId = insertAsset()
    const crop = { x: 1, y: 2, width: 30, height: 40 }
    committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'image', assetId, crop },
    })
    const row = nodeRow(nodeId)!
    expect(row).toMatchObject({ appearance_kind: 'image', appearance_asset_id: assetId })
    // Non-destructive crop settings live on the node, not the asset.
    expect(JSON.parse(row.appearance_crop as string)).toEqual(crop)

    // Undo chain: image → icon → dot.
    undo(icon.inverse)
    expect(nodeRow(nodeId)).toMatchObject({ appearance_kind: 'dot', appearance_color: '#abc' })
  })

  it('validates the image asset and clears appearance with null', () => {
    const nodeId = createNode()
    expect(
      exec('SetNodeAppearance', {
        nodeId,
        appearance: { kind: 'image', assetId: uuidv7(), crop: null },
      }),
    ).toMatchObject({ status: 'error', code: 'ASSET_NOT_FOUND' })

    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#000' } })
    committed('SetNodeAppearance', { nodeId, appearance: null })
    expect(nodeRow(nodeId)).toMatchObject({
      appearance_kind: null,
      appearance_color: null,
      appearance_icon: null,
      appearance_asset_id: null,
      appearance_crop: null,
    })
  })

  it('accepts the payload-less card appearance with prior-state undo (§4.6 rev 0.31)', () => {
    const nodeId = createNode()
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'dot', color: '#abc' } })

    // Card carries NO payload columns — content comes from the note.
    const card = committed('SetNodeAppearance', { nodeId, appearance: { kind: 'card' } })
    expect(nodeRow(nodeId)).toMatchObject({
      appearance_kind: 'card',
      appearance_color: null,
      appearance_icon: null,
      appearance_asset_id: null,
      appearance_crop: null,
    })

    // Undo restores the dot it replaced.
    expect(card.inverse).toMatchObject({
      payload: { nodeId, appearance: { kind: 'dot', color: '#abc' } },
    })
    undo(card.inverse)
    expect(nodeRow(nodeId)).toMatchObject({ appearance_kind: 'dot', appearance_color: '#abc' })

    // And card round-trips as a PRIOR state too.
    committed('SetNodeAppearance', { nodeId, appearance: { kind: 'card' } })
    const icon = committed('SetNodeAppearance', {
      nodeId,
      appearance: { kind: 'icon', icon: 'castle' },
    })
    expect(icon.inverse).toMatchObject({ payload: { nodeId, appearance: { kind: 'card' } } })
    undo(icon.inverse)
    expect(nodeRow(nodeId)).toMatchObject({ appearance_kind: 'card', appearance_icon: null })
  })

  it('still rejects unknown appearance kinds', () => {
    const nodeId = createNode()
    expect(
      exec('SetNodeAppearance', { nodeId, appearance: { kind: 'hologram' } }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})

/**
 * Lead merge wiring (AI-IMP-011 × AI-IMP-012): MakeNoteIndependent
 * creates a note, so it must index the copied body (invariant 26) and
 * run the re-resolution sweep (invariant 27); its inverse must remove
 * that link footprint without FK violations.
 */
describe('MakeNoteIndependent link integration', () => {
  function linkCtx(): CommandContext {
    return {
      db: handle.db,
      projectId: handle.projectId,
      rootNodeId: handle.rootNodeId,
      rootCanvasId: handle.rootCanvasId,
      now: () => new Date().toISOString(),
    }
  }

  it('indexes the copied body, binds matching phantoms, and reverts on undo', () => {
    const sharedNote = insertNote('Shared Person', 'see [[Alpha Target]]')
    const nodeA = createNode()
    const nodeB = createNode()
    committed('AttachNoteToNode', { nodeId: nodeA, noteId: sharedNote })
    committed('AttachNoteToNode', { nodeId: nodeB, noteId: sharedNote })

    // A third note already references the future independent title.
    const sourceNote = insertNote('Source', 'ref [[Indie Note]]')
    refreshNoteLinks(linkCtx(), sourceNote)
    expect(
      handle.db.get(
        "SELECT id FROM link WHERE source_note_id = ? AND state = 'unresolved'",
        sourceNote,
      ),
    ).toBeDefined()

    const newNoteId = uuidv7()
    const make = committed('MakeNoteIndependent', {
      nodeId: nodeA,
      newNoteId,
      newTitle: 'Indie Note',
    })

    // Copied body's token is indexed for the new note (invariant 26).
    expect(
      handle.db.get(
        "SELECT id FROM link WHERE source_note_id = ? AND state = 'unresolved' AND target_title_key = ?",
        newNoteId,
        titleKey('Alpha Target'),
      ),
    ).toBeDefined()
    // The phantom reference bound project-wide (invariant 27).
    expect(
      handle.db.get(
        "SELECT id FROM link WHERE source_note_id = ? AND state = 'bound' AND target_note_id = ?",
        sourceNote,
        newNoteId,
      ),
    ).toBeDefined()
    // Node B still uses the shared note (invariant 12).
    expect(
      handle.db.get<{ note_id: string }>('SELECT note_id FROM node WHERE id = ?', nodeB)?.note_id,
    ).toBe(sharedNote)

    const undone = undo(make.inverse)
    // Copied note and its entire link footprint are gone…
    expect(handle.db.get('SELECT id FROM note WHERE id = ?', newNoteId)).toBeUndefined()
    expect(
      handle.db.get(
        'SELECT id FROM link WHERE source_note_id = ?1 OR target_note_id = ?1',
        newNoteId,
      ),
    ).toBeUndefined()
    // …and the source's token is unresolved again, not dangling.
    expect(
      handle.db.get(
        "SELECT id FROM link WHERE source_note_id = ? AND state = 'unresolved' AND target_title_key = ?",
        sourceNote,
        titleKey('Indie Note'),
      ),
    ).toBeDefined()
    expect(undone.inverse?.commandType).toBe('MakeNoteIndependent')
  })

  it('applies the same Phase 1 title rules as CreateNote', () => {
    const note = insertNote('Rules Note', '')
    const node = createNode()
    committed('AttachNoteToNode', { nodeId: node, noteId: note })
    const result = exec('MakeNoteIndependent', {
      nodeId: node,
      newNoteId: uuidv7(),
      newTitle: 'Bad|Title',
    })
    expect(result).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})
