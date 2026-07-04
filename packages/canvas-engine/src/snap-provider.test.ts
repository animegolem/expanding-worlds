import { describe, expect, it } from 'vitest'
import { createSnapProvider } from './snap-provider'
import { makePlacement } from './test-helpers'
import type { SnapQuery } from './snap'

/**
 * Static index fixture: one 40×40 placement centered at (100, 100),
 * i.e. world AABB 80..120 on both axes. Stops per axis: 80 / 100 /
 * 120 plus the canvas origin 0.
 */
function provider() {
  const snap = createSnapProvider()
  snap.begin([makePlacement({ x: 100, y: 100, width: 40, height: 40 })])
  return snap
}

function query(overrides: Partial<SnapQuery>): SnapQuery {
  return {
    movingBounds: { x: 0, y: 0, width: 40, height: 40 },
    proposedDelta: { dx: 0, dy: 0 },
    disabled: false,
    zoom: 1,
    ...overrides,
  }
}

describe('createSnapProvider', () => {
  it('snaps a moving edge to a static edge within the threshold', () => {
    const snap = provider()
    // Moving left edge at 123: 3 world px from the static right edge 120.
    const result = snap.query(
      query({
        movingBounds: { x: 123, y: 300, width: 40, height: 40 },
        proposedDelta: { dx: 23, dy: 0 },
      }),
    )
    expect(result.dx).toBe(20) // 23 − 3
    expect(result.dy).toBe(0)
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0]).toMatchObject({ axis: 'x', position: 120 })
  })

  it('snaps a moving center to a static center', () => {
    const snap = provider()
    // Moving center x at 103 (bounds 53..153, so neither edge is near
    // a stop): 3 px from the static center 100.
    const result = snap.query(
      query({
        movingBounds: { x: 53, y: 300, width: 100, height: 40 },
        proposedDelta: { dx: 0, dy: 0 },
      }),
    )
    expect(result.dx).toBe(-3)
    expect(result.guides[0]).toMatchObject({ axis: 'x', position: 100 })
  })

  it('scales the threshold with zoom (screen-pixel radius)', () => {
    const snap = provider()
    // 4 world px from the static right edge 120.
    const bounds = { x: 124, y: 300, width: 40, height: 40 }
    // zoom 1 → threshold 6 world px: snaps.
    expect(snap.query(query({ movingBounds: bounds, zoom: 1 })).dx).toBe(-4)
    // zoom 2 → threshold 3 world px: no snap.
    const zoomed = snap.query(query({ movingBounds: bounds, zoom: 2 }))
    expect(zoomed.dx).toBe(0)
    expect(zoomed.guides).toHaveLength(0)
    // zoom 0.5 → threshold 12 world px: an 8 px offset snaps.
    expect(
      snap.query(query({ movingBounds: { ...bounds, x: 128 }, zoom: 0.5 })).dx,
    ).toBe(-8)
  })

  it('indexes only the static items it is given (moving-set exclusion)', () => {
    const snap = createSnapProvider()
    snap.begin([]) // nothing static: only the origin axes remain
    const near = snap.query(
      query({ movingBounds: { x: 3, y: 300, width: 40, height: 40 } }),
    )
    expect(near.dx).toBe(-3) // snaps to the origin x axis
    const far = snap.query(
      query({ movingBounds: { x: 83, y: 300, width: 40, height: 40 } }),
    )
    expect(far.dx).toBe(0) // no content stop at 80/100/120
    expect(far.guides).toHaveLength(0)
  })

  it('returns the proposed delta unchanged when disabled', () => {
    const snap = provider()
    const result = snap.query(
      query({
        movingBounds: { x: 123, y: 300, width: 40, height: 40 },
        proposedDelta: { dx: 23, dy: 11 },
        disabled: true,
      }),
    )
    expect(result).toEqual({ dx: 23, dy: 11, guides: [] })
  })

  it('spans guides from the matched static geometry to the moving bounds', () => {
    const snap = provider()
    const result = snap.query(
      query({ movingBounds: { x: 123, y: 300, width: 40, height: 40 } }),
    )
    // Static extent on y is 80..120; moving bounds sit at y 300..340.
    expect(result.guides[0]).toEqual({ axis: 'x', position: 120, from: 80, to: 340 })
  })

  it('snaps both axes independently and returns one guide per axis', () => {
    const snap = provider()
    const result = snap.query(
      query({ movingBounds: { x: 123, y: 117, width: 40, height: 40 } }),
    )
    expect(result.dx).toBe(-3) // left edge 123 → static right 120
    expect(result.dy).toBe(3) // top edge 117 → static bottom 120
    expect(result.guides.map((g) => g.axis)).toEqual(['x', 'y'])
  })

  it('breaks equal-distance ties toward the lowest coordinate', () => {
    const snap = createSnapProvider()
    // Two 40×40 placements whose facing edges sit at 100 and 108.
    snap.begin([
      makePlacement({ x: 80, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 128, y: 100, width: 40, height: 40 }),
    ])
    // Moving left edge at 104: exactly 4 from both stops → lower wins.
    const result = snap.query(
      query({ movingBounds: { x: 104, y: 300, width: 40, height: 40 } }),
    )
    expect(result.dx).toBe(-4)
    expect(result.guides[0]!.position).toBe(100)
  })

  it('clears its index at end()', () => {
    const snap = provider()
    snap.end()
    const result = snap.query(
      query({ movingBounds: { x: 123, y: 300, width: 40, height: 40 } }),
    )
    expect(result.dx).toBe(0)
    expect(result.guides).toHaveLength(0)
  })
})
