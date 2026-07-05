import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import {
  CommandRegistry,
  type CommittedResult,
  type CreatePinPayload,
  type InverseCommand,
} from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { registerAssetHandlers } from './assets'
import { registerNoteHandlers } from './notes'
import { registerPinHandlers } from './pin'
import { registerTagHandlers } from './tags'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-pin-'))
  handle = createProject(dir, 'Pin Test')
  const registry = new CommandRegistry<CommandContext>()
  registerPinHandlers(registry)
  registerNoteHandlers(registry)
  registerTagHandlers(registry)
  registerAssetHandlers(registry)
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

function revision(): number {
  return handle.db.get<{ project_revision: number }>(
    'SELECT project_revision FROM project WHERE id = ?',
    handle.projectId,
  )!.project_revision
}

function counts() {
  return handle.db.get<{ nodes: number; notes: number; placements: number; tags: number }>(
    `SELECT
       (SELECT count(*) FROM node) AS nodes,
       (SELECT count(*) FROM note) AS notes,
       (SELECT count(*) FROM placement) AS placements,
       (SELECT count(*) FROM tag_assignment) AS tags`,
  )!
}

function importAsset(width: number | null = 640, height: number | null = 480): string {
  const assetId = uuidv7()
  const hash = uuidv7().replaceAll('-', '').padEnd(64, 'a')
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: hash,
    originalFilename: 'ref.png',
    mimeType: 'image/png',
    width,
    height,
    storagePath: join('assets', hash.slice(0, 2), hash),
  })
  return assetId
}

function pinPayload(overrides: Partial<CreatePinPayload> = {}): CreatePinPayload {
  return {
    nodeId: uuidv7(),
    canvasId: handle.rootCanvasId,
    placementId: uuidv7(),
    x: 100,
    y: 60,
    appearance: { kind: 'dot', color: '#ff7700' },
    ...overrides,
  }
}

describe('CreatePin', () => {
  it('creates a note-less image pin sized to the asset natural dimensions', () => {
    const assetId = importAsset(640, 480)
    const crop = { x: 10, y: 20, width: 300, height: 200 }
    const payload = pinPayload({ appearance: { kind: 'image', assetId, crop } })
    const result = committed('CreatePin', payload)

    const node = handle.db.get<Record<string, unknown>>(
      'SELECT * FROM node WHERE id = ?',
      payload.nodeId,
    )!
    expect(node).toMatchObject({
      note_id: null,
      appearance_kind: 'image',
      appearance_asset_id: assetId,
      appearance_crop: JSON.stringify(crop),
      lifecycle_state: 'active',
    })
    const placement = handle.db.get<Record<string, unknown>>(
      'SELECT * FROM placement WHERE id = ?',
      payload.placementId,
    )!
    // §6.1: natural aspect from the asset; §4.5: label defaults visible.
    expect(placement).toMatchObject({
      canvas_id: handle.rootCanvasId,
      node_id: payload.nodeId,
      x: 100,
      y: 60,
      width: 640,
      height: 480,
      scale: 1,
      rotation: 0,
      label_visible: 1,
    })
    expect(result.affected).toEqual(
      expect.arrayContaining([
        { kind: 'node', id: payload.nodeId },
        { kind: 'placement', id: payload.placementId },
      ]),
    )
    expect(result.inverse).toEqual({
      commandType: 'DeleteDraftPin',
      commandVersion: 1,
      payload: { nodeId: payload.nodeId, placementId: payload.placementId, createdNoteId: null },
    })
  })

  it('leaves placement dimensions null for dot pins and unsized assets', () => {
    const dot = pinPayload()
    committed('CreatePin', dot)
    expect(
      handle.db.get('SELECT width, height FROM placement WHERE id = ?', dot.placementId),
    ).toMatchObject({ width: null, height: null })

    const assetId = importAsset(null, null)
    const image = pinPayload({ appearance: { kind: 'image', assetId, crop: null } })
    committed('CreatePin', image)
    expect(
      handle.db.get('SELECT width, height FROM placement WHERE id = ?', image.placementId),
    ).toMatchObject({ width: null, height: null })
  })

  it('creates and attaches a new note, binding unresolved links to its title', () => {
    // A note whose body references [[Target]] before the pin exists.
    committed('CreateNote', { noteId: uuidv7(), title: 'Source', body: 'see [[Target]]' })
    const link = handle.db.get<{ state: string }>(
      "SELECT state FROM link WHERE target_title_key = 'target'",
    )!
    expect(link.state).toBe('unresolved')

    const noteId = uuidv7()
    const payload = pinPayload({ note: { kind: 'create', noteId, title: 'Target' } })
    const result = committed('CreatePin', payload)

    const note = handle.db.get<Record<string, unknown>>('SELECT * FROM note WHERE id = ?', noteId)!
    expect(note).toMatchObject({ title: 'Target', title_key: 'target', body: '' })
    expect(handle.db.get('SELECT note_id FROM node WHERE id = ?', payload.nodeId)).toMatchObject({
      note_id: noteId,
    })
    // Invariant 27: the materialization sweep bound the phantom
    // (binding stores target_note_id and clears the title key).
    expect(
      handle.db.get('SELECT state FROM link WHERE target_note_id = ?', noteId),
    ).toMatchObject({ state: 'bound' })
    expect(result.inverse?.payload).toMatchObject({ createdNoteId: noteId })
  })

  it('attaches an existing active note and assigns tags', () => {
    const noteId = uuidv7()
    committed('CreateNote', { noteId, title: 'Shared' })
    const tagA = uuidv7()
    const tagB = uuidv7()
    committed('CreateTag', { tagId: tagA, name: 'alpha' })
    committed('CreateTag', { tagId: tagB, name: 'beta' })

    const payload = pinPayload({ note: { kind: 'attach', noteId }, tagIds: [tagA, tagB] })
    const result = committed('CreatePin', payload)

    expect(handle.db.get('SELECT note_id FROM node WHERE id = ?', payload.nodeId)).toMatchObject({
      note_id: noteId,
    })
    const assignments = handle.db.all<{ tag_id: string }>(
      'SELECT tag_id FROM tag_assignment WHERE node_id = ? ORDER BY tag_id',
      payload.nodeId,
    )
    expect(assignments.map((a) => a.tag_id).sort()).toEqual([tagA, tagB].sort())
    expect(result.affected).toEqual(
      expect.arrayContaining([
        { kind: 'note', id: noteId },
        { kind: 'tag', id: tagA },
        { kind: 'tag', id: tagB },
      ]),
    )
    expect(result.inverse?.payload).toMatchObject({ createdNoteId: null })
  })

  it('rejects a duplicate title leaving zero records (§7.7)', () => {
    committed('CreateNote', { noteId: uuidv7(), title: 'Taken' })
    const before = counts()
    const beforeRevision = revision()
    const result = exec(
      'CreatePin',
      pinPayload({ note: { kind: 'create', noteId: uuidv7(), title: 'Taken' } }),
    )
    expect(result).toMatchObject({ status: 'error', code: 'NOTE_TITLE_CONFLICT' })
    expect(counts()).toEqual(before)
    expect(revision()).toBe(beforeRevision)
  })

  it('rejects unknown asset, tag, note, and canvas without writing', () => {
    const before = counts()
    expect(
      exec(
        'CreatePin',
        pinPayload({ appearance: { kind: 'image', assetId: uuidv7(), crop: null } }),
      ),
    ).toMatchObject({ status: 'error', code: 'ASSET_NOT_FOUND' })
    expect(exec('CreatePin', pinPayload({ tagIds: [uuidv7()] }))).toMatchObject({
      status: 'error',
      code: 'TAG_NOT_FOUND',
    })
    expect(
      exec('CreatePin', pinPayload({ note: { kind: 'attach', noteId: uuidv7() } })),
    ).toMatchObject({ status: 'error', code: 'NOTE_NOT_FOUND' })
    expect(exec('CreatePin', pinPayload({ canvasId: uuidv7() }))).toMatchObject({
      status: 'error',
      code: 'CANVAS_NOT_FOUND',
    })
    expect(
      exec('CreatePin', { ...pinPayload(), appearance: { kind: 'nope' } }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(counts()).toEqual(before)
  })

  it('rejects attaching a trashed note', () => {
    const noteId = uuidv7()
    committed('CreateNote', { noteId, title: 'Doomed' })
    handle.db.run("UPDATE note SET lifecycle_state = 'trashed' WHERE id = ?", noteId)
    expect(
      exec('CreatePin', pinPayload({ note: { kind: 'attach', noteId } })),
    ).toMatchObject({ status: 'error', code: 'NOTE_NOT_ACTIVE' })
  })

  it('stacks new pins on top via allocated render_order', () => {
    const first = pinPayload()
    const second = pinPayload()
    committed('CreatePin', first)
    committed('CreatePin', second)
    const a = handle.db.get<{ render_order: number }>(
      'SELECT render_order FROM placement WHERE id = ?',
      first.placementId,
    )!
    const b = handle.db.get<{ render_order: number }>(
      'SELECT render_order FROM placement WHERE id = ?',
      second.placementId,
    )!
    expect(b.render_order).toBeGreaterThan(a.render_order)
  })
})

describe('DeleteDraftPin (inverse round-trip)', () => {
  function undo(inverse: InverseCommand | null): CommittedResult {
    expect(inverse).not.toBeNull()
    return committed(inverse!.commandType, inverse!.payload)
  }

  it('unwinds a created-note pin: rows gone, note trashed, revision +1 each', () => {
    const tagId = uuidv7()
    committed('CreateTag', { tagId, name: 'gamma' })
    const before = counts()
    const noteId = uuidv7()
    const payload = pinPayload({
      note: { kind: 'create', noteId, title: 'Ephemeral' },
      tagIds: [tagId],
    })

    const r0 = revision()
    const create = committed('CreatePin', payload)
    expect(create.revision).toBe(r0 + 1)

    const inverse = undo(create.inverse)
    expect(inverse.revision).toBe(r0 + 2)

    // Placement, tag assignment, and node hard-deleted.
    expect(counts()).toEqual({ ...before, notes: before.notes + 1 })
    expect(
      handle.db.get('SELECT id FROM placement WHERE id = ?', payload.placementId),
    ).toBeUndefined()
    expect(handle.db.get('SELECT id FROM node WHERE id = ?', payload.nodeId)).toBeUndefined()
    // The created note is trashed (purge-safe), not deleted: the title
    // reservation holds, matching CreateNote↔TrashNote.
    expect(handle.db.get('SELECT lifecycle_state FROM note WHERE id = ?', noteId)).toMatchObject({
      lifecycle_state: 'trashed',
    })
    // DeleteDraftPin is an internal inverse: no inverse of its own.
    expect(inverse.inverse).toBeNull()
  })

  it('leaves an attached note untouched', () => {
    const noteId = uuidv7()
    committed('CreateNote', { noteId, title: 'Keeper' })
    const payload = pinPayload({ note: { kind: 'attach', noteId } })
    const create = committed('CreatePin', payload)
    undo(create.inverse)
    expect(handle.db.get('SELECT lifecycle_state FROM note WHERE id = ?', noteId)).toMatchObject({
      lifecycle_state: 'active',
    })
  })

  it('refuses when the pin is no longer a draft', () => {
    const payload = pinPayload()
    const create = committed('CreatePin', payload)
    // A second placement of the node makes the aggregate non-draft.
    handle.db.run(
      `INSERT INTO placement (id, project_id, canvas_id, node_id, x, y, render_order,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, 99999, ?, ?)`,
      uuidv7(),
      handle.projectId,
      handle.rootCanvasId,
      payload.nodeId,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    expect(exec(create.inverse!.commandType, create.inverse!.payload)).toMatchObject({
      status: 'error',
      code: 'PIN_NOT_DRAFT',
    })
  })

  it('validates placement/node pairing and existence', () => {
    expect(
      exec('DeleteDraftPin', { nodeId: uuidv7(), placementId: uuidv7(), createdNoteId: null }),
    ).toMatchObject({ status: 'error', code: 'PLACEMENT_NOT_FOUND' })
    const payload = pinPayload()
    committed('CreatePin', payload)
    expect(
      exec('DeleteDraftPin', {
        nodeId: uuidv7(),
        placementId: payload.placementId,
        createdNoteId: null,
      }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})

describe('CreatePin note body (§7.2, AI-IMP-058)', () => {
  it('persists the phantom draft body and indexes its outbound tokens', () => {
    const noteId = uuidv7()
    committed('CreatePin', pinPayload({
      note: { kind: 'create', noteId, title: 'Kestrel', body: 'hunts near [[Harbor]]' },
    }))
    const note = handle.db.get<{ body: string }>('SELECT body FROM note WHERE id = ?', noteId)!
    expect(note.body).toBe('hunts near [[Harbor]]')
    const links = handle.db.all<{ state: string; target_title_key: string | null }>(
      'SELECT state, target_title_key FROM link WHERE source_note_id = ?',
      noteId,
    )
    expect(links).toEqual([{ state: 'unresolved', target_title_key: 'harbor' }])
  })

  it('rejects a non-string body', () => {
    const result = exec('CreatePin', pinPayload({
      note: { kind: 'create', noteId: uuidv7(), title: 'X', body: 42 as unknown as string },
    }))
    expect(result).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
  })
})
