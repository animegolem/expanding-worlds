import { describe, expect, it, vi } from 'vitest'
import { loadSearchSnapshot, SearchEpoch, type SearchQuery } from './search-model'

describe('search name-space snapshot', () => {
  it('rejects stale responses after a newer request begins', () => {
    const epoch = new SearchEpoch()
    const old = epoch.begin()
    const current = epoch.begin()
    expect(epoch.isCurrent(old)).toBe(false)
    expect(epoch.isCurrent(current)).toBe(true)
  })

  it('loads all three read models, dedupes notes, and keeps image node ids', async () => {
    const implementation = async (name: string, _args?: unknown): Promise<unknown> => {
      void _args
      if (name === 'listNodeLibrary') return [
        {
          id: 'node-1', noteId: 'note-1', noteTitle: 'Chief', assetFilename: 'chief.png',
          childCanvasId: 'canvas-1', displayLabel: 'Chief', tags: ['chieftain'],
        },
        {
          id: 'node-2', noteId: 'note-1', noteTitle: 'Chief', assetFilename: null,
          childCanvasId: null, displayLabel: 'Chief', tags: ['life-debt'],
        },
        {
          id: 'node-3', noteId: null, noteTitle: null, assetFilename: null,
          childCanvasId: 'canvas-3', displayLabel: 'unnamed · 2 items', tags: [],
        },
      ]
      if (name === 'listLooseNotes') return [{ id: 'note-1', title: 'duplicate' }, { id: 'note-2', title: 'Loose' }]
      return [{ id: 'tag-1', name: 'chieftain' }]
    }
    const mock = vi.fn(implementation)
    const query: SearchQuery = async <T>(name: string, args?: unknown) => mock(name, args) as Promise<T>
    const snapshot = await loadSearchSnapshot(query)
    expect(mock.mock.calls.map(([name]) => name).sort()).toEqual(['listLooseNotes', 'listNodeLibrary', 'listTags'])
    expect(snapshot.candidates.filter((candidate) => candidate.kind === 'note')).toHaveLength(2)
    expect(snapshot.candidates.find((candidate) => candidate.kind === 'note' && candidate.noteId === 'note-1')?.tags).toEqual(['chieftain', 'life-debt'])
    expect(snapshot.candidates.find((candidate) => candidate.kind === 'image-node')).toMatchObject({ nodeId: 'node-1' })
    expect(snapshot.candidates).toContainEqual(expect.objectContaining({
      kind: 'canvas',
      canvasId: 'canvas-3',
      label: 'unnamed · 2 items',
    }))
  })

  it('can recover on a clean retry after one read-model rejection', async () => {
    let fail = true
    const query: SearchQuery = async <T>(name: string) => {
      if (fail && name === 'listTags') throw new Error('transient query failure')
      const result = name === 'listNodeLibrary' ? [] : name === 'listLooseNotes' ? [] : [{ id: 'tag-1', name: 'ready' }]
      return result as T
    }
    await expect(loadSearchSnapshot(query)).rejects.toThrow('transient query failure')
    fail = false
    await expect(loadSearchSnapshot(query)).resolves.toMatchObject({ tags: [{ name: 'ready' }] })
  })
})
