import { describe, expect, it } from 'vitest'
import { reorderPayloads } from './reorder'
import { makeDecoration, makePlacement } from './test-helpers'
import type { ReorderContentPayload } from '@ew/commands'
import type { SceneItem } from './types'

/**
 * Applies payloads to an id array the way the ReorderContent handler
 * would, so tests assert the RESULTING order, not implementation
 * details of which neighbor each payload names.
 */
function apply(order: string[], payloads: ReorderContentPayload[]): string[] {
  let next = [...order]
  for (const p of payloads) {
    expect(p.afterId === null && p.beforeId === null).toBe(false)
    expect(p.afterId).not.toBe(p.itemId)
    expect(p.beforeId).not.toBe(p.itemId)
    next = next.filter((id) => id !== p.itemId)
    if (p.beforeId === null) {
      next.push(p.itemId) // bring to front of the plane
    } else if (p.afterId === null) {
      next.unshift(p.itemId) // send to back of the plane
    } else {
      const lower = next.indexOf(p.afterId)
      const upper = next.indexOf(p.beforeId)
      expect(lower).toBeGreaterThanOrEqual(0)
      expect(upper).toBe(lower + 1) // neighbors must be adjacent at execution time
      next.splice(lower + 1, 0, p.itemId)
    }
  }
  return next
}

function scene(count: number): { items: SceneItem[]; ids: string[] } {
  const items: SceneItem[] = []
  for (let i = 0; i < count; i += 1) {
    items.push(i % 2 === 0 ? makePlacement() : makeDecoration())
  }
  return { items, ids: items.map((item) => item.id) }
}

describe('reorderPayloads', () => {
  it('bring-to-front moves the selection to the top preserving relative order', () => {
    const { items, ids } = scene(5)
    const [a, b, c, d, e] = ids as [string, string, string, string, string]
    const payloads = reorderPayloads('cv', items, [b, d], 'front')
    expect(apply(ids, payloads)).toEqual([a, c, e, b, d])
  })

  it('bring-to-front of an already-front block emits nothing', () => {
    const { items, ids } = scene(4)
    const selection = [ids[2]!, ids[3]!]
    expect(reorderPayloads('cv', items, selection, 'front')).toEqual([])
  })

  it('send-to-back mirrors bring-to-front', () => {
    const { items, ids } = scene(5)
    const [a, b, c, d, e] = ids as [string, string, string, string, string]
    const payloads = reorderPayloads('cv', items, [b, d], 'back')
    expect(apply(ids, payloads)).toEqual([b, d, a, c, e])
    expect(reorderPayloads('cv', items, [a, b], 'back')).toEqual([])
  })

  it('bring-forward moves each member one step past its neighbor', () => {
    const { items, ids } = scene(4)
    const [a, b, c, d] = ids as [string, string, string, string]
    const payloads = reorderPayloads('cv', items, [b], 'forward')
    expect(payloads).toHaveLength(1)
    expect(apply(ids, payloads)).toEqual([a, c, b, d])
  })

  it('bring-forward: an adjacent selected pair moves as a block', () => {
    const { items, ids } = scene(4)
    const [a, b, c, d] = ids as [string, string, string, string]
    const payloads = reorderPayloads('cv', items, [a, b], 'forward')
    expect(apply(ids, payloads)).toEqual([c, a, b, d])
  })

  it('bring-forward at the top blocks and stays put', () => {
    const { items, ids } = scene(3)
    expect(reorderPayloads('cv', items, [ids[2]!], 'forward')).toEqual([])
    // Contiguous top block: neither member can move.
    expect(reorderPayloads('cv', items, [ids[1]!, ids[2]!], 'forward')).toEqual([])
  })

  it('send-backward mirrors bring-forward including edge blocking', () => {
    const { items, ids } = scene(4)
    const [a, b, c, d] = ids as [string, string, string, string]
    expect(apply(ids, reorderPayloads('cv', items, [c], 'backward'))).toEqual([a, c, b, d])
    expect(reorderPayloads('cv', items, [a], 'backward')).toEqual([])
    expect(reorderPayloads('cv', items, [a, b], 'backward')).toEqual([])
    expect(apply(ids, reorderPayloads('cv', items, [b, c], 'backward'))).toEqual([b, c, a, d])
  })

  it('ignores selected ids that are not on the canvas and full-scene selections', () => {
    const { items, ids } = scene(3)
    expect(reorderPayloads('cv', items, ['ghost'], 'front')).toEqual([])
    expect(reorderPayloads('cv', items, ids, 'front')).toEqual([])
  })

  it('single item to front from the bottom emits exactly one payload', () => {
    const { items, ids } = scene(3)
    const payloads = reorderPayloads('cv', items, [ids[0]!], 'front')
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      canvasId: 'cv',
      itemId: ids[0],
      afterId: ids[2],
      beforeId: null,
    })
  })
})
