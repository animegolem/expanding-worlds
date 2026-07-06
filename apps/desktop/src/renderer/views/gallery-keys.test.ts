import { describe, expect, it } from 'vitest'
import type { GalleryBucket } from './gallery-buckets'
import {
  bucketJumpTarget,
  cellRows,
  columnOf,
  horizontalTarget,
  linearRange,
  rowOf,
  verticalTarget,
} from './gallery-keys'

/**
 * §14.4 cursor math (AI-IMP-080). The e2e suite drives the real
 * grid, but commands cannot backdate created_at, so multi-bucket
 * layouts — the interesting Up/Down and Mod+Up/Down cases — are
 * only reachable here, over the same row structure the grid renders.
 */

const bucket = (key: string, startIndex: number, count: number): GalleryBucket => ({
  key,
  label: key,
  startIndex,
  count,
})

// 10 entries, 3 columns, two buckets: 7 + 3.
// Rows: [0,1,2] [3,4,5] [6] | [7,8,9] — a ragged bucket tail, then
// a fresh bucket row.
const BUCKETS = [bucket('a', 0, 7), bucket('b', 7, 3)]
const ROWS = cellRows(10, 3, BUCKETS)

describe('cellRows', () => {
  it('chunks per bucket under date sort, ragged tails included', () => {
    expect(ROWS).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 },
      { start: 6, count: 1 },
      { start: 7, count: 3 },
    ])
  })

  it('renders one flat run without buckets', () => {
    expect(cellRows(7, 3, [])).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 },
      { start: 6, count: 1 },
    ])
  })

  it('is empty for an empty grid', () => {
    expect(cellRows(0, 3, [])).toEqual([])
  })
})

describe('rowOf / columnOf', () => {
  it('locates a document index in the visual grid', () => {
    expect(rowOf(ROWS, 4)).toBe(1)
    expect(columnOf(ROWS, 4)).toBe(1)
    expect(rowOf(ROWS, 6)).toBe(2)
    expect(columnOf(ROWS, 6)).toBe(0)
    expect(rowOf(ROWS, 9)).toBe(3)
    expect(columnOf(ROWS, 9)).toBe(2)
  })

  it('returns -1 / 0 for an index outside the grid', () => {
    expect(rowOf(ROWS, 42)).toBe(-1)
    expect(columnOf(ROWS, 42)).toBe(0)
  })
})

describe('horizontalTarget', () => {
  it('walks document order across row and bucket boundaries', () => {
    expect(horizontalTarget(10, 2, 1)).toBe(3) // row wrap
    expect(horizontalTarget(10, 6, 1)).toBe(7) // bucket wrap
    expect(horizontalTarget(10, 7, -1)).toBe(6)
  })

  it('clamps at the ends — no torus', () => {
    expect(horizontalTarget(10, 0, -1)).toBe(0)
    expect(horizontalTarget(10, 9, 1)).toBe(9)
  })
})

describe('verticalTarget', () => {
  it('moves by visual column', () => {
    expect(verticalTarget(ROWS, 1, 1, 1)).toBe(4)
    expect(verticalTarget(ROWS, 4, -1, 1)).toBe(1)
  })

  it('takes the nearest column when the next row is short', () => {
    // From (row 1, col 2) down into the single-cell row.
    expect(verticalTarget(ROWS, 5, 1, 2)).toBe(6)
  })

  it('hops across the bucket boundary', () => {
    // From the short bucket tail into the next bucket's first row.
    expect(verticalTarget(ROWS, 6, 1, 2)).toBe(9)
  })

  it('restores the remembered column after a short row', () => {
    // Down through the short row with preferredCol 2, then down
    // again: the run re-widens to column 2, not the pinched 0.
    const throughShort = verticalTarget(ROWS, 5, 1, 2)
    expect(throughShort).toBe(6)
    expect(verticalTarget(ROWS, throughShort!, 1, 2)).toBe(9)
  })

  it('is null at the grid edges and for unknown indices', () => {
    expect(verticalTarget(ROWS, 1, -1, 1)).toBeNull()
    expect(verticalTarget(ROWS, 9, 1, 2)).toBeNull()
    expect(verticalTarget(ROWS, 42, 1, 0)).toBeNull()
  })
})

describe('linearRange', () => {
  it('orders the span both directions', () => {
    expect(linearRange(2, 6)).toEqual([2, 6])
    expect(linearRange(6, 2)).toEqual([2, 6])
    expect(linearRange(4, 4)).toEqual([4, 4])
  })
})

describe('bucketJumpTarget', () => {
  const THREE = [bucket('a', 0, 4), bucket('b', 4, 5), bucket('c', 9, 2)]

  it('jumps to the next/previous bucket header entry', () => {
    expect(bucketJumpTarget(THREE, 5, 1)).toBe(9)
    expect(bucketJumpTarget(THREE, 5, -1)).toBe(0)
    expect(bucketJumpTarget(THREE, 0, 1)).toBe(4)
  })

  it('is a no-op past the ends', () => {
    expect(bucketJumpTarget(THREE, 1, -1)).toBeNull()
    expect(bucketJumpTarget(THREE, 10, 1)).toBeNull()
  })

  it('is a no-op on flat sorts (no buckets)', () => {
    expect(bucketJumpTarget([], 3, 1)).toBeNull()
  })

  it('is a no-op for an index outside every bucket', () => {
    expect(bucketJumpTarget(THREE, 99, 1)).toBeNull()
  })
})
