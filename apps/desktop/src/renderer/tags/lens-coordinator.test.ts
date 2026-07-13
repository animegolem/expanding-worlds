import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CanvasHostHandle } from '../canvas/host'
import {
  bindTagLensHost,
  clearTagLens,
  engageTagLens,
  engageTagLensMembers,
  onTagLensChanged,
  tagLensState,
} from './lens-coordinator'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

function fakeHost(canvasId = 'canvas-a') {
  let lens: string[] | null = null
  const listeners = new Set<(ids: readonly string[] | null) => void>()
  const setLens = vi.fn((ids: readonly string[]) => {
    lens = [...ids]
    for (const listener of listeners) listener(lens)
  })
  const clearLens = vi.fn(() => {
    lens = null
    for (const listener of listeners) listener(null)
  })
  const handle = {
    canvasId,
    setLens,
    clearLens,
    lens: () => lens,
    onLensChanged(listener: (ids: readonly string[] | null) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  } as unknown as CanvasHostHandle
  return { handle, setLens, clearLens }
}

let cleanup: (() => void) | null = null
afterEach(() => {
  clearTagLens()
  cleanup?.()
  cleanup = null
  vi.unstubAllGlobals()
})

describe('tag lens coordinator', () => {
  it('keeps semantic identity in step with engine set and clear', () => {
    const host = fakeHost()
    cleanup = bindTagLensHost(host.handle)
    const observed: Array<string | null> = []
    const off = onTagLensChanged((state) => observed.push(state?.tagId ?? null))

    expect(engageTagLensMembers({ id: 'tag-1', name: 'One' }, ['p-1', 'p-1'])).toBe(true)
    expect(host.setLens).toHaveBeenCalledWith(['p-1'])
    expect(tagLensState()).toEqual({ tagId: 'tag-1', name: 'One', placementIds: ['p-1'] })

    host.clearLens()
    expect(tagLensState()).toBeNull()
    expect(observed).toEqual([null, 'tag-1', null])
    off()
  })

  it('resolves only members on the active canvas', async () => {
    const host = fakeHost('canvas-a')
    cleanup = bindTagLensHost(host.handle)
    vi.stubGlobal('window', {
      ew: {
        project: {
          query: vi.fn().mockResolvedValue({
            ok: true,
            result: {
              tag: { id: 'tag-1', name: 'One' },
              nodes: [
                {
                  placements: [
                    { placementId: 'p-a', canvasId: 'canvas-a' },
                    { placementId: 'p-b', canvasId: 'canvas-b' },
                  ],
                },
              ],
            },
          }),
        },
      },
    })

    await expect(engageTagLens({ id: 'tag-1', name: 'One' })).resolves.toBe(true)
    expect(host.setLens).toHaveBeenCalledWith(['p-a'])
  })

  it('ignores an older query that resolves after a newer door', async () => {
    const host = fakeHost()
    cleanup = bindTagLensHost(host.handle)
    const first = deferred<unknown>()
    vi.stubGlobal('window', {
      ew: { project: { query: vi.fn().mockReturnValue(first.promise) } },
    })

    const pending = engageTagLens({ id: 'old', name: 'Old' })
    engageTagLensMembers({ id: 'new', name: 'New' }, ['p-new'])
    first.resolve({
      ok: true,
      result: {
        tag: { id: 'old', name: 'Old' },
        nodes: [{ placements: [{ placementId: 'p-old', canvasId: 'canvas-a' }] }],
      },
    })

    await expect(pending).resolves.toBe(false)
    expect(tagLensState()?.tagId).toBe('new')
    expect(host.setLens).toHaveBeenCalledTimes(1)
  })
})
