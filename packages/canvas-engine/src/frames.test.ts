import { describe, expect, it } from 'vitest'
import {
  indexFrameTree,
  innermostFrameAt,
  pointInFrameBody,
  type FrameCandidate,
  type FrameTreeNodeLike,
} from './frames'
import type { ScenePlacement } from './types'

function frame(id: string, x: number, y: number, w: number, h: number, rotation = 0): ScenePlacement {
  return {
    itemKind: 'placement',
    id,
    nodeId: `n-${id}`,
    x,
    y,
    width: w,
    height: h,
    scale: 1,
    rotation,
    flipX: 0,
    flipY: 0,
    renderOrder: 0,
    labelVisible: 1,
    locked: 0,
    appearanceKind: 'frame',
    appearanceColor: null,
    appearanceIcon: null,
    appearanceAssetId: null,
    appearanceCrop: null,
    noteTitle: null,
    noteId: null,
    childCanvasId: null,
    assetContentHash: null,
    assetMimeType: null,
    assetWidth: null,
    assetHeight: null,
  }
}

describe('pointInFrameBody', () => {
  it('tests against the rotated, scaled body rect about its center', () => {
    const f = frame('f', 0, 0, 100, 60)
    expect(pointInFrameBody({ x: 0, y: 0 }, f)).toBe(true)
    expect(pointInFrameBody({ x: 49, y: 29 }, f)).toBe(true)
    expect(pointInFrameBody({ x: 51, y: 0 }, f)).toBe(false)
    // Rotated 90°: the 100×60 box now reaches ±30 in x, ±50 in y.
    const r = frame('r', 0, 0, 100, 60, Math.PI / 2)
    expect(pointInFrameBody({ x: 0, y: 45 }, r)).toBe(true)
    expect(pointInFrameBody({ x: 45, y: 0 }, r)).toBe(false)
  })
})

describe('innermostFrameAt (§4.9 innermost = deepest membership)', () => {
  it('returns null when no frame contains the point', () => {
    const candidates: FrameCandidate[] = [{ placement: frame('a', 0, 0, 40, 40), depth: 0 }]
    expect(innermostFrameAt({ x: 100, y: 100 }, candidates)).toBeNull()
  })

  it('picks the deepest frame when nested frames both contain the point', () => {
    // Inner frame sits inside the outer; both contain (5,5).
    const outer: FrameCandidate = { placement: frame('outer', 0, 0, 200, 200), depth: 0 }
    const inner: FrameCandidate = { placement: frame('inner', 0, 0, 60, 60), depth: 1 }
    expect(innermostFrameAt({ x: 5, y: 5 }, [outer, inner])).toBe('inner')
    // A point only the outer covers falls to the outer.
    expect(innermostFrameAt({ x: 80, y: 80 }, [outer, inner])).toBe('outer')
  })

  it('breaks a same-depth tie by smaller area, then by id', () => {
    // Two sibling frames (same depth) overlapping the point: the
    // smaller wins; equal area falls to the lexicographically-smaller id.
    const big: FrameCandidate = { placement: frame('b-big', 0, 0, 200, 200), depth: 0 }
    const small: FrameCandidate = { placement: frame('a-small', 0, 0, 80, 80), depth: 0 }
    expect(innermostFrameAt({ x: 0, y: 0 }, [big, small])).toBe('a-small')

    const eqA: FrameCandidate = { placement: frame('a', 0, 0, 80, 80), depth: 0 }
    const eqB: FrameCandidate = { placement: frame('b', 0, 0, 80, 80), depth: 0 }
    expect(innermostFrameAt({ x: 0, y: 0 }, [eqB, eqA])).toBe('a')
  })

  it('deepest wins even when the shallower frame is smaller on screen', () => {
    // A tiny outer frame (depth 0) and a large inner frame (depth 1)
    // both cover the point — membership depth, not area, decides.
    const tinyOuter: FrameCandidate = { placement: frame('outer', 0, 0, 50, 50), depth: 0 }
    const bigInner: FrameCandidate = { placement: frame('inner', 0, 0, 500, 500), depth: 1 }
    expect(innermostFrameAt({ x: 0, y: 0 }, [tinyOuter, bigInner])).toBe('inner')
  })
})

describe('indexFrameTree', () => {
  const tree: FrameTreeNodeLike[] = [
    {
      placementId: 'F1',
      isFrame: true,
      depth: 0,
      members: [
        { placementId: 'i1', isFrame: false, depth: 1, members: [] },
        {
          placementId: 'F2',
          isFrame: true,
          depth: 1,
          members: [{ placementId: 'i2', isFrame: false, depth: 2, members: [] }],
        },
      ],
    },
  ]

  it('resolves isFrame, parentOf, depthOf', () => {
    const index = indexFrameTree(tree)
    expect(index.isFrame('F1')).toBe(true)
    expect(index.isFrame('i1')).toBe(false)
    expect(index.parentOf('i1')).toBe('F1')
    expect(index.parentOf('F2')).toBe('F1')
    expect(index.parentOf('i2')).toBe('F2')
    expect(index.parentOf('F1')).toBeNull()
    expect(index.depthOf('F1')).toBe(0)
    expect(index.depthOf('F2')).toBe(1)
    expect(index.frameIds().sort()).toEqual(['F1', 'F2'])
  })

  it('flattens transitive members (frames and items alike)', () => {
    const index = indexFrameTree(tree)
    expect(index.transitiveMembers('F1').sort()).toEqual(['F2', 'i1', 'i2'])
    expect(index.transitiveMembers('F2')).toEqual(['i2'])
    expect(index.transitiveMembers('i1')).toEqual([])
  })
})
