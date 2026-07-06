import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shortCode, uuidv7 } from '@ew/domain'
import { CommandRegistry } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers } from './handlers/assets'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import {
  registerGalleryQueries,
  type GalleryIndexEntry,
  type GalleryItem,
} from './queries-gallery'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher
let queries: QueryRegistry
let queryCtx: Omit<CommandContext, 'now'>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-qgallery-'))
  handle = createProject(dir, 'Gallery Query Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerNoteHandlers(registry)
  registerAssetHandlers(registry)
  registerCanvasHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
  queries = new QueryRegistry()
  registerGalleryQueries(queries)
  queryCtx = {
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

function committed(commandType: string, payload: unknown): void {
  const result = dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
  expect(result).toMatchObject({ status: 'committed' })
}

function query<T>(name: string, args?: unknown): T {
  const result = queries.run(queryCtx, name, args)
  expect(result).toMatchObject({ ok: true })
  return (result as { result: T }).result
}

function createNode(): string {
  const nodeId = uuidv7()
  committed('CreateNode', { nodeId })
  return nodeId
}

function commitAsset(hash: string): string {
  const assetId = uuidv7()
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: hash,
    originalFilename: 'pic.png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    storagePath: `assets/${hash.slice(0, 2)}/${hash}`,
  })
  return assetId
}

describe('gallery read models (§14.4)', () => {
  it('indexes every active node except the root, kinds by precedence, newest first', () => {
    const bare = createNode()

    const noted = createNode()
    const noteId = uuidv7()
    committed('CreateNote', { noteId, title: 'Clipping', body: 'text' })
    committed('AttachNoteToNode', { nodeId: noted, noteId })

    const image = createNode()
    const assetId = commitAsset('ab'.repeat(32))
    committed('SetNodeAppearance', {
      nodeId: image,
      appearance: { kind: 'image', assetId, crop: null },
    })

    // Board wins the precedence even over an image appearance.
    const board = createNode()
    committed('SetNodeAppearance', {
      nodeId: board,
      appearance: { kind: 'image', assetId, crop: null },
    })
    committed('CreateCanvas', { canvasId: uuidv7(), nodeId: board })

    const index = query<GalleryIndexEntry[]>('getGalleryIndex')
    expect(index.map((e) => e.nodeId)).not.toContain(handle.rootNodeId)
    const kinds = new Map(index.map((e) => [e.nodeId, e.kind]))
    expect(kinds.get(bare)).toBe('note')
    expect(kinds.get(noted)).toBe('note')
    expect(kinds.get(image)).toBe('image')
    expect(kinds.get(board)).toBe('board')
    // Newest first: creation order was bare→noted→image→board.
    expect(index.map((e) => e.nodeId)).toEqual([board, image, noted, bare])

    // Trashed nodes drop out.
    handle.db.run(`UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?`, bare)
    expect(query<GalleryIndexEntry[]>('getGalleryIndex').map((e) => e.nodeId)).not.toContain(bare)
  })

  it('hydrates items in request order with labels, hashes, and doors', () => {
    const image = createNode()
    const assetId = commitAsset('cd'.repeat(32))
    committed('SetNodeAppearance', {
      nodeId: image,
      appearance: { kind: 'image', assetId, crop: null },
    })

    const board = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: board })
    const boardNote = uuidv7()
    committed('CreateNote', { noteId: boardNote, title: 'Ruins Board', body: '' })
    committed('AttachNoteToNode', { nodeId: board, noteId: boardNote })

    const items = query<GalleryItem[]>('getGalleryItems', { nodeIds: [board, image] })
    expect(items.map((i) => i.nodeId)).toEqual([board, image])
    expect(items[0]).toMatchObject({
      kind: 'board',
      label: 'Ruins Board',
      childCanvasId: canvasId,
      contentHash: null, // hash only rides IMAGE entries
    })
    expect(items[1]).toMatchObject({
      kind: 'image',
      label: shortCode(image),
      contentHash: 'cd'.repeat(32),
      width: 640,
      height: 480,
      childCanvasId: null,
    })

    expect(query<GalleryItem[]>('getGalleryItems', { nodeIds: [] })).toEqual([])
    expect(query<GalleryItem[]>('getGalleryItems', {})).toEqual([])
  })
})
