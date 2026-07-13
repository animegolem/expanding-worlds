import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shortCode, uuidv7 } from '@ew/domain'
import { CommandRegistry } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from './dispatcher'
import { registerAssetHandlers } from './handlers/assets'
import { registerCanvasHandlers } from './handlers/canvases'
import { registerLifecycleHandlers } from './handlers/lifecycle'
import { registerNodeHandlers } from './handlers/nodes'
import { registerNoteHandlers } from './handlers/notes'
import { registerPlacementHandlers } from './handlers/placements'
import { registerTagHandlers } from './handlers/tags'
import { createProject, type ProjectHandle } from './project'
import { QueryRegistry } from './queries'
import {
  registerGalleryQueries,
  type GalleryIndexEntry,
  type GalleryItem,
  type GalleryTagCount,
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
  registerPlacementHandlers(registry)
  registerTagHandlers(registry)
  registerLifecycleHandlers(registry)
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
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
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

function commitAsset(hash: string, width = 640, height = 480): string {
  const assetId = uuidv7()
  committed('CommitAssetImport', {
    assetId,
    kind: 'image',
    contentHash: hash,
    originalFilename: 'pic.png',
    mimeType: 'image/png',
    width,
    height,
    storagePath: `assets/${hash.slice(0, 2)}/${hash}`,
  })
  return assetId
}

function attachNote(nodeId: string, title: string, body = ''): void {
  const noteId = uuidv7()
  committed('CreateNote', { noteId, title, body })
  committed('AttachNoteToNode', { nodeId, noteId })
}

function createTag(name: string): string {
  const tagId = uuidv7()
  committed('CreateTag', { tagId, name })
  return tagId
}

function indexIds(args?: unknown): string[] {
  return query<GalleryIndexEntry[]>('getGalleryIndex', args).map((e) => e.nodeId)
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
    expect(index.find((entry) => entry.nodeId === noted)?.noteTitle).toBe('Clipping')
    expect(index.find((entry) => entry.nodeId === bare)?.noteTitle).toBeNull()
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
    const imagePlacement = uuidv7()
    committed('CreatePlacement', {
      placementId: imagePlacement,
      canvasId: handle.rootCanvasId,
      nodeId: image,
    })
    committed('SetPlacementCaption', {
      placementId: imagePlacement,
      caption: 'gallery-blind private observation',
    })

    const board = createNode()
    const canvasId = uuidv7()
    committed('CreateCanvas', { canvasId, nodeId: board })
    const boardNote = uuidv7()
    committed('CreateNote', { noteId: boardNote, title: 'Ruins Board', body: '' })
    committed('AttachNoteToNode', { nodeId: board, noteId: boardNote })

    const items = query<GalleryItem[]>('getGalleryItems', { nodeIds: [board, image] })
    expect(JSON.stringify(items)).not.toContain('gallery-blind private observation')
    expect(items.every((item) => !('caption' in item))).toBe(true)
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

  it('hydrates text posts: clamped excerpt on note kinds only, tags in name order', () => {
    const clipping = createNode()
    attachNote(clipping, 'Clipping', 'lorem '.repeat(60)) // 360 chars

    const board = createNode()
    committed('CreateCanvas', { canvasId: uuidv7(), nodeId: board })
    attachNote(board, 'Board With Note', 'a board body')

    const zulu = createTag('zulu')
    const alpha = createTag('alpha')
    committed('AssignTagToNode', { tagId: zulu, nodeId: clipping })
    committed('AssignTagToNode', { tagId: alpha, nodeId: clipping })

    const [clip, brd] = query<GalleryItem[]>('getGalleryItems', { nodeIds: [clipping, board] })
    expect(clip!.noteExcerpt).toBe('lorem '.repeat(60).slice(0, 140))
    expect(clip!.tagNames).toEqual(['alpha', 'zulu'])
    // Excerpts ride NOTE entries only, the way hashes ride images.
    expect(brd).toMatchObject({ kind: 'board', noteExcerpt: null, tagNames: [] })
  })
})

describe('gallery facets (§14.4, AI-IMP-078)', () => {
  interface Seed {
    imageBig: string
    imageSmall: string
    clipping: string
    bare: string
    board: string
    ruins: string
    ink: string
  }

  /** Two images (one placed, both tagged ruins; the small one also
   * ink), a tagged text note, a bare untagged node, a board. */
  function seedFacetWorld(): Seed {
    const imageBig = createNode()
    committed('SetNodeAppearance', {
      nodeId: imageBig,
      appearance: { kind: 'image', assetId: commitAsset('aa'.repeat(32), 2000, 1500), crop: null },
    })
    attachNote(imageBig, 'Harbor')

    const imageSmall = createNode()
    committed('SetNodeAppearance', {
      nodeId: imageSmall,
      appearance: { kind: 'image', assetId: commitAsset('bb'.repeat(32), 100, 100), crop: null },
    })
    attachNote(imageSmall, 'Anchor')

    const clipping = createNode()
    attachNote(clipping, 'Zeppelin Clipping', 'body text of a saved clipping')

    const bare = createNode()

    const board = createNode()
    committed('CreateCanvas', { canvasId: uuidv7(), nodeId: board })

    const ruins = createTag('ruins')
    const ink = createTag('ink')
    committed('AssignTagToNode', { tagId: ruins, nodeId: imageBig })
    committed('AssignTagToNode', { tagId: ruins, nodeId: imageSmall })
    committed('AssignTagToNode', { tagId: ruins, nodeId: clipping })
    committed('AssignTagToNode', { tagId: ink, nodeId: imageSmall })

    committed('CreatePlacement', {
      placementId: uuidv7(),
      canvasId: handle.rootCanvasId,
      nodeId: imageBig,
    })
    return { imageBig, imageSmall, clipping, bare, board, ruins, ink }
  }

  it('filters by kind mask alone', () => {
    const s = seedFacetWorld()
    expect(indexIds({ kinds: ['image'] }).sort()).toEqual([s.imageBig, s.imageSmall].sort())
    expect(indexIds({ kinds: ['note', 'board'] }).sort()).toEqual(
      [s.clipping, s.bare, s.board].sort(),
    )
    // Empty and full masks do not narrow.
    expect(indexIds({ kinds: [] })).toHaveLength(5)
    expect(indexIds({ kinds: ['image', 'note', 'board'] })).toHaveLength(5)
  })

  it('filters by tags alone; several tag ids intersect', () => {
    const s = seedFacetWorld()
    expect(indexIds({ tagIds: [s.ruins] }).sort()).toEqual(
      [s.imageBig, s.imageSmall, s.clipping].sort(),
    )
    expect(indexIds({ tagIds: [s.ruins, s.ink] })).toEqual([s.imageSmall])
    // A trashed tag stops filtering-in its carriers.
    handle.db.run(`UPDATE tag SET lifecycle_state = 'trashed' WHERE id = ?`, s.ink)
    expect(indexIds({ tagIds: [s.ink] })).toEqual([])
  })

  it('cleanup flags: untagged and unplaced use the §14.1 vocabulary', () => {
    const s = seedFacetWorld()
    expect(indexIds({ untagged: true }).sort()).toEqual([s.bare, s.board].sort())
    // imageBig is the only placed node; everything else is unplaced.
    expect(indexIds({ unplaced: true }).sort()).toEqual(
      [s.imageSmall, s.clipping, s.bare, s.board].sort(),
    )
    // An assignment to a TRASHED tag does not count as tagged.
    handle.db.run(`UPDATE tag SET lifecycle_state = 'trashed' WHERE id = ?`, s.ink)
    handle.db.run(`UPDATE tag SET lifecycle_state = 'trashed' WHERE id = ?`, s.ruins)
    expect(indexIds({ untagged: true })).toHaveLength(5)
  })

  it('stacks facets: kind mask × tag × unplaced compose in one query', () => {
    const s = seedFacetWorld()
    expect(indexIds({ kinds: ['image'], tagIds: [s.ruins] }).sort()).toEqual(
      [s.imageBig, s.imageSmall].sort(),
    )
    expect(indexIds({ kinds: ['image'], tagIds: [s.ruins], unplaced: true })).toEqual([
      s.imageSmall,
    ])
  })

  it('sorts by name (title_key collation, id fallback) and by size (pixel-area proxy)', () => {
    const s = seedFacetWorld()
    // Titles collate: Anchor < Harbor < Zeppelin. Untitled (bare,
    // board) fall back to node-id order — uuidv7 hex leads with
    // digits, so they group ahead of the letters, in creation order.
    const byName = indexIds({ sort: 'name' })
    expect(byName.slice(0, 2)).toEqual([s.bare, s.board])
    expect(byName.slice(2)).toEqual([s.imageSmall, s.imageBig, s.clipping])

    // Size: 3M px > 10k px > 29-char body > empty carriers.
    const bySize = indexIds({ sort: 'size' })
    expect(bySize.slice(0, 3)).toEqual([s.imageBig, s.imageSmall, s.clipping])

    // Unknown sort falls back to date order (newest first).
    expect(indexIds({ sort: 'sneaky' })).toEqual(indexIds({ sort: 'date' }))
  })

  it('galleryTagCounts scopes to the kind mask and orders by count or name', () => {
    const s = seedFacetWorld()
    const byCount = query<GalleryTagCount[]>('galleryTagCounts')
    expect(byCount.map((t) => [t.name, t.count])).toEqual([
      ['ruins', 3],
      ['ink', 1],
    ])
    const byName = query<GalleryTagCount[]>('galleryTagCounts', { order: 'name' })
    expect(byName.map((t) => t.name)).toEqual(['ink', 'ruins'])

    // Kind mask rescopes counts; tags with no in-scope carrier drop.
    const noteScoped = query<GalleryTagCount[]>('galleryTagCounts', { kinds: ['note'] })
    expect(noteScoped).toEqual([{ id: s.ruins, name: 'ruins', count: 1 }])

    // Trashed carriers stop counting.
    handle.db.run(`UPDATE node SET lifecycle_state = 'trashed' WHERE id = ?`, s.imageSmall)
    const after = query<GalleryTagCount[]>('galleryTagCounts')
    expect(after).toEqual([{ id: s.ruins, name: 'ruins', count: 2 }])
  })
})

// §9.6 (AI-IMP-163): a placement onto a board whose OWNER node is
// trashed no longer places — the node row flips alone while the canvas
// row stays 'active', so the gallery's unplaced facet (listNodeLibrary's
// clause) must treat the carrier as unplaced. Seeded through real
// commands; RestoreRecord reverses it.
describe('unplaced facet follows owner-trashed boards (§9.6, AI-IMP-163)', () => {
  it('a node placed only on an owner-trashed board reads as unplaced, restore reverses it', () => {
    const owner = createNode()
    const boardCanvas = uuidv7()
    committed('CreateCanvas', { canvasId: boardCanvas, nodeId: owner })
    const content = createNode()
    committed('CreatePlacement', { placementId: uuidv7(), canvasId: boardCanvas, nodeId: content })

    expect(indexIds({ unplaced: true })).not.toContain(content)
    committed('TrashNode', { nodeId: owner })
    expect(indexIds({ unplaced: true })).toContain(content)
    committed('RestoreRecord', { kind: 'node', id: owner })
    expect(indexIds({ unplaced: true })).not.toContain(content)
  })
})
