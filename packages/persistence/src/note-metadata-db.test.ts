import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommandEnvelope } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPlacementHandlers } from './handlers/placements'
import {
  computeNoteMetadata,
  metadataNoteKey,
  refreshNoteMetadataBlock,
} from './note-metadata-db'
import { createProject, type ProjectHandle } from './project'
import { setProjectSetting } from './settings'
import { stripMetadataBlock } from '@ew/domain'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let ctx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-notemeta-'))
  handle = createProject(dir, 'Note Metadata Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  registerCanvasHandlers(registry)
  registerPlacementHandlers(registry)
  registerLifecycleHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  ctx = {
    db: handle.db,
    projectId: handle.projectId,
    rootNodeId: handle.rootNodeId,
    rootCanvasId: handle.rootCanvasId,
  }
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true })
})

function commit(commandType: string, payload: unknown): void {
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  } satisfies CommandEnvelope)
  expect(result.status).toBe('committed')
}

function createNote(title: string, body = ''): string {
  const noteId = uuidv7()
  commit('CreateNote', { noteId, title, body })
  return noteId
}

/** A node attached to `noteId` (direct write — the test exercises the
 * read model, not the attach command). */
function createAttachedNode(noteId: string): string {
  const nodeId = uuidv7()
  commit('CreateNode', { nodeId })
  handle.db.run('UPDATE node SET note_id = ? WHERE id = ?', noteId, nodeId)
  return nodeId
}

function place(nodeId: string, canvasId: string, x = 0, y = 0): string {
  const placementId = uuidv7()
  commit('CreatePlacement', { placementId, canvasId, nodeId, x, y })
  return placementId
}

function noteBody(noteId: string): string {
  return handle.db.get<{ body: string }>('SELECT body FROM note WHERE id = ?', noteId)!.body
}

describe('computeNoteMetadata', () => {
  it('groups placements by board with counts and nesting depth', () => {
    // A nested board: node OWNS a child canvas, placed on root → depth 1.
    const boardNoteId = createNote('Inner Board')
    const boardNode = createAttachedNode(boardNoteId)
    const childCanvas = uuidv7()
    commit('CreateCanvas', { canvasId: childCanvas, nodeId: boardNode })
    place(boardNode, handle.rootCanvasId)

    // The subject note's node is placed on the root (Home, depth 0)
    // twice and on the nested board (depth 1) once.
    const noteId = createNote('Multi')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId, 10, 10)
    place(node, handle.rootCanvasId, 20, 20)
    place(node, childCanvas, 5, 5)

    const view = computeNoteMetadata(ctx, noteId)!
    expect(view.boards).toHaveLength(2)
    const home = view.boards.find((b) => b.isRoot)!
    expect(home).toMatchObject({ label: 'Home', depth: 0, count: 2 })
    expect(home.placements).toHaveLength(2)
    const inner = view.boards.find((b) => !b.isRoot)!
    expect(inner).toMatchObject({ label: 'Inner Board', depth: 1, count: 1 })
  })

  it('lists provenance for image-backed nodes with import date and source', () => {
    const noteId = createNote('Art')
    const node = createAttachedNode(noteId)
    const assetId = uuidv7()
    handle.db.run(
      `INSERT INTO asset (id, project_id, kind, content_hash, original_filename, mime_type,
                          storage_path, source_url, created_at, updated_at)
       VALUES (?, ?, 'image', 'hash1', 'castle.png', 'image/png', 'blobs/hash1',
               'https://ref.example/castle', '2026-07-06T12:00:00.000Z', '2026-07-06T12:00:00.000Z')`,
      assetId,
      handle.projectId,
    )
    handle.db.run(
      "UPDATE node SET appearance_kind = 'image', appearance_asset_id = ? WHERE id = ?",
      assetId,
      node,
    )
    const view = computeNoteMetadata(ctx, noteId)!
    expect(view.provenance).toEqual([
      {
        nodeId: node,
        originalFilename: 'castle.png',
        importDate: '2026-07-06',
        sourceUrl: 'https://ref.example/castle',
      },
    ])
  })

  it('returns null for a missing note', () => {
    expect(computeNoteMetadata(ctx, uuidv7())).toBeNull()
  })
})

describe('refreshNoteMetadataBlock', () => {
  it('appends the block to the persisted body when enabled', () => {
    const noteId = createNote('Placed', 'the prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)

    expect(refreshNoteMetadataBlock(ctx, noteId)).toBe(true)
    const body = noteBody(noteId)
    expect(body).toMatch(/^the prose\n\n---\n/)
    expect(body).toContain('## Placements')
    expect(body).toContain('- Home (1)')
    // Prose recovers exactly.
    expect(stripMetadataBlock(body).prose).toBe('the prose')
  })

  it('is idempotent — a second refresh with unchanged data is a no-op', () => {
    const noteId = createNote('Placed', 'prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)
    refreshNoteMetadataBlock(ctx, noteId)
    const first = noteBody(noteId)
    expect(refreshNoteMetadataBlock(ctx, noteId)).toBe(false)
    expect(noteBody(noteId)).toBe(first)
  })

  it('regenerates a hand-edited block wholesale', () => {
    const noteId = createNote('Placed', 'prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)
    refreshNoteMetadataBlock(ctx, noteId)
    // Simulate a foreign editor tampering with the block content.
    handle.db.run(
      "UPDATE note SET body = replace(body, '- Home (1)', '- Home (999) hand edit') WHERE id = ?",
      noteId,
    )
    expect(refreshNoteMetadataBlock(ctx, noteId)).toBe(true)
    const body = noteBody(noteId)
    expect(body).toContain('- Home (1)')
    expect(body).not.toContain('hand edit')
  })

  it('strips the block when the per-note toggle is off', () => {
    const noteId = createNote('Placed', 'prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)
    refreshNoteMetadataBlock(ctx, noteId)
    expect(noteBody(noteId)).toContain('## Placements')

    setProjectSetting(handle.db, handle.projectId, metadataNoteKey(noteId), { enabled: false })
    expect(refreshNoteMetadataBlock(ctx, noteId)).toBe(true)
    expect(noteBody(noteId)).toBe('prose')
  })

  it('omits sections turned off in the global defaults', () => {
    setProjectSetting(handle.db, handle.projectId, 'note_metadata_defaults', {
      placements: false,
      provenance: true,
      timestamps: false,
    })
    const noteId = createNote('Placed', 'prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)
    // Placements off and no provenance → nothing to render → no block.
    expect(refreshNoteMetadataBlock(ctx, noteId)).toBe(false)
    expect(noteBody(noteId)).toBe('prose')
  })
})

describe('RenameNote lazy refresh (§7.8 system touch)', () => {
  it('regenerates the renamed note block on rename', () => {
    const noteId = createNote('Home Note', 'my prose')
    const node = createAttachedNode(noteId)
    place(node, handle.rootCanvasId)
    expect(noteBody(noteId)).toBe('my prose')

    commit('RenameNote', { noteId, title: 'Renamed Note' })
    const body = noteBody(noteId)
    expect(body).toContain('## Placements')
    expect(stripMetadataBlock(body).prose).toBe('my prose')
  })

  it('refreshes a source note whose tokens were re-keyed by the rename', () => {
    const target = createNote('Target')
    const source = createNote('Source', 'see [[Target]] here')
    const node = createAttachedNode(source)
    place(node, handle.rootCanvasId)

    commit('RenameNote', { noteId: target, title: 'Renamed Target' })
    const body = noteBody(source)
    // Token re-keyed AND block appended (a single system touch).
    expect(body).toContain('[[Renamed Target]]')
    expect(body).toContain('## Placements')
    expect(stripMetadataBlock(body).prose).toBe('see [[Renamed Target]] here')
  })
})

// §7.8 / §9.6 (AI-IMP-163): the metadata card groups a note's
// placements by board. A placement onto a board whose OWNER node is
// trashed drops out — the node row flips alone while the canvas row
// stays 'active' — and RestoreRecord brings the board back. Trash and
// restore go through the real commands, never a direct lifecycle UPDATE.
describe('computeNoteMetadata hides owner-trashed boards (§9.6, AI-IMP-163)', () => {
  it('drops an owner-trashed board from the note metadata boards; restore revives it', () => {
    const noteId = createNote('Subject')
    const content = createAttachedNode(noteId)

    const owner = uuidv7()
    commit('CreateNode', { nodeId: owner })
    const boardCanvas = uuidv7()
    commit('CreateCanvas', { canvasId: boardCanvas, nodeId: owner })
    place(content, boardCanvas)

    const boardIds = () => computeNoteMetadata(ctx, noteId)!.boards.map((b) => b.canvasId)
    expect(boardIds()).toEqual([boardCanvas])
    commit('TrashNode', { nodeId: owner })
    expect(boardIds()).toEqual([])
    commit('RestoreRecord', { kind: 'node', id: owner })
    expect(boardIds()).toEqual([boardCanvas])
  })
})
