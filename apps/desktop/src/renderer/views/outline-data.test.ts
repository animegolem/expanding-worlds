import { describe, expect, it, vi } from 'vitest'
import {
  OutlineData,
  outlineThumbnailUrl,
  type BoardFilmstrip,
  type OutlinePreview,
  type OutlineQuery,
} from './outline-data'

function queryHarness(results: Record<string, unknown>): {
  query: OutlineQuery
  calls: Array<{ name: string; args: unknown }>
} {
  const calls: Array<{ name: string; args: unknown }> = []
  return {
    calls,
    query: vi.fn(async (name: string, args?: unknown) => {
      calls.push({ name, args })
      return { ok: true, result: results[name] }
    }),
  }
}

const strip = (canvasId: string): BoardFilmstrip => ({
  canvasId,
  totalCount: 2,
  remainderCount: 0,
  items: [
    {
      kind: 'image',
      placementId: 'placement-image',
      nodeId: 'node-image',
      renderOrder: 1,
      label: 'ridge.png',
      contentHash: 'ab'.repeat(32),
      filename: 'ridge.png',
      thumbnailReady: false,
    },
    {
      kind: 'glyph',
      placementId: 'placement-board',
      nodeId: 'node-board',
      renderOrder: 2,
      label: 'unnamed · 3 items',
      appearanceKind: 'board',
      appearanceColor: null,
      appearanceIcon: null,
    },
  ],
})

describe('outline thumbnail resolution', () => {
  it('uses the 076 ew-asset derivative route', () => {
    expect(outlineThumbnailUrl('a1b2')).toBe('ew-asset://a1b2/thumb')
  })
})

describe('OutlineData', () => {
  it('queries one preview for one selection without a project or row waterfall', async () => {
    const preview = {
      targetKind: 'node',
      nodeId: 'node-a',
      noteId: null,
      noteTitle: null,
      noteExcerpt: null,
      appearanceKind: 'dot',
      appearanceColor: null,
      appearanceIcon: null,
      assetContentHash: null,
      assetFilename: null,
      childCanvasId: null,
      childCount: 0,
      placementCount: 0,
      tags: [],
      places: [],
    } satisfies OutlinePreview
    const h = queryHarness({ getOutlinePreview: preview })
    const data = new OutlineData(h.query)

    await expect(data.getPreview({ kind: 'node', nodeId: 'node-a' })).resolves.toEqual(preview)
    expect(h.calls).toEqual([
      { name: 'getOutlinePreview', args: { kind: 'node', nodeId: 'node-a' } },
    ])
  })

  it('exposes the separate facet-count envelope without touching the tree projection', async () => {
    const counts = { all: 8, unplaced: 2, orphans: 3, disconnected: 4, untagged: 5 }
    const h = queryHarness({ getOutlineFacetCounts: counts })
    const data = new OutlineData(h.query)

    await expect(data.getFacetCounts()).resolves.toEqual(counts)
    expect(h.calls).toEqual([{ name: 'getOutlineFacetCounts', args: undefined }])
  })

  it('caches by canvas + revision and invalidates on a changed revision', async () => {
    let revision = 7
    const calls: Array<{ name: string; args: unknown }> = []
    const query: OutlineQuery = vi.fn(async (name, args) => {
      calls.push({ name, args })
      if (name === 'getProject') return { ok: true, result: { revision } }
      return { ok: true, result: strip((args as { canvasId: string }).canvasId) }
    })
    const data = new OutlineData(query)

    await data.refreshRevision()
    const first = await data.getFilmstrip('canvas-a')
    const cached = await data.getFilmstrip('canvas-a')
    expect(cached).toBe(first)
    expect(first?.items[0]).toMatchObject({
      label: 'ridge.png',
      renderOrder: 1,
      thumbnailUrl: `ew-asset://${'ab'.repeat(32)}/thumb`,
    })
    expect(calls.filter((call) => call.name === 'getBoardFilmstrip')).toHaveLength(1)

    revision = 8
    await data.refreshRevision()
    await data.getFilmstrip('canvas-a')
    expect(calls.filter((call) => call.name === 'getProject')).toHaveLength(2)
    expect(calls.filter((call) => call.name === 'getBoardFilmstrip')).toHaveLength(2)
  })

  it('evicts least-recently-used filmstrips and keeps limit variants distinct', async () => {
    const h = queryHarness({ getProject: { revision: 1 } })
    h.query = vi.fn(async (name, args) => {
      h.calls.push({ name, args })
      if (name === 'getProject') return { ok: true, result: { revision: 1 } }
      return { ok: true, result: strip((args as { canvasId: string }).canvasId) }
    })
    const data = new OutlineData(h.query, 2)
    await data.refreshRevision()
    await data.getFilmstrip('canvas-a', 4)
    await data.getFilmstrip('canvas-b', 5)
    await data.getFilmstrip('canvas-a', 4) // A is now most recent.
    await data.getFilmstrip('canvas-c', 5) // Evicts B.
    await data.getFilmstrip('canvas-b', 5)
    await data.getFilmstrip('canvas-a', 3) // Different cap, different entry.

    const boardCalls = h.calls.filter((call) => call.name === 'getBoardFilmstrip')
    expect(boardCalls.map((call) => call.args)).toEqual([
      { canvasId: 'canvas-a', limit: 4 },
      { canvasId: 'canvas-b', limit: 5 },
      { canvasId: 'canvas-c', limit: 5 },
      { canvasId: 'canvas-b', limit: 5 },
      { canvasId: 'canvas-a', limit: 3 },
    ])
  })

  it('fails loudly on transport errors and invalid revision envelopes', async () => {
    const failed = new OutlineData(async () => ({ ok: false, code: 'NO_PROJECT' }))
    await expect(failed.getPreview({ kind: 'note', noteId: 'note-a' })).rejects.toThrow(
      'getOutlinePreview: NO_PROJECT',
    )
    const invalid = new OutlineData(async () => ({ ok: true, result: { revision: '7' } }))
    await expect(invalid.refreshRevision()).rejects.toThrow('invalid project revision')
  })
})
