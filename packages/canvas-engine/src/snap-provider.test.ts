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

/**
 * Scripted drag: queries the provider with the moving 40×40 box's
 * left edge at `x` (y far from any stop) and reports the applied
 * x-adjustment plus whether an x-guide is engaged.
 */
function step(snap: ReturnType<typeof provider>, x: number, zoom = 1) {
  const result = snap.query(query({ movingBounds: { x, y: 300, width: 40, height: 40 }, zoom }))
  return { adjust: result.dx, engaged: result.guides.some((g) => g.axis === 'x') }
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

  it('scales the engage threshold with zoom (screen-pixel radius)', () => {
    // Fresh provider per zoom level: hysteresis is intentionally
    // stateful across queries within one gesture.
    // 4 world px from the static right edge 120.
    const bounds = { x: 124, y: 300, width: 40, height: 40 }
    // zoom 1 → engage radius 6 world px: snaps.
    expect(provider().query(query({ movingBounds: bounds, zoom: 1 })).dx).toBe(-4)
    // zoom 2 → engage radius 3 world px: no snap.
    const zoomed = provider().query(query({ movingBounds: bounds, zoom: 2 }))
    expect(zoomed.dx).toBe(0)
    expect(zoomed.guides).toHaveLength(0)
    // zoom 0.5 → engage radius 12 world px: an 8 px offset snaps.
    expect(
      provider().query(query({ movingBounds: { ...bounds, x: 128 }, zoom: 0.5 })).dx,
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

describe('hysteresis (§6.9 rev 0.9)', () => {
  it('engages at ≤6px/zoom and not beyond', () => {
    // Static right edge at 120; distances relative to it.
    expect(step(provider(), 126.5)).toEqual({ adjust: 0, engaged: false }) // 6.5 px: out
    expect(step(provider(), 126)).toEqual({ adjust: -6, engaged: true }) // exactly 6: in
  })

  it('holds an engaged snap through the 6–9px band and releases beyond 9', () => {
    const snap = provider()
    expect(step(snap, 123)).toEqual({ adjust: -3, engaged: true }) // engage at 3
    expect(step(snap, 127)).toEqual({ adjust: -7, engaged: true }) // 7 > engage, ≤ release: hold
    expect(step(snap, 129)).toEqual({ adjust: -9, engaged: true }) // exactly release: hold
    expect(step(snap, 129.5)).toEqual({ adjust: 0, engaged: false }) // 9.5 > release: gone
    // Once released, the hold band no longer captures.
    expect(step(snap, 127)).toEqual({ adjust: 0, engaged: false })
    // Re-entering the engage radius re-engages.
    expect(step(snap, 125)).toEqual({ adjust: -5, engaged: true })
  })

  it('does not flap under jitter across the 6px engage boundary', () => {
    const snap = provider()
    expect(step(snap, 125.5).engaged).toBe(true) // first contact at 5.5
    // Pointer wobble across the engage boundary, all within release:
    // every frame stays engaged and snapped to 120.
    for (const x of [126.5, 125.8, 127, 126.2, 128, 125]) {
      expect(step(snap, x)).toEqual({ adjust: 120 - x, engaged: true })
    }
    // Approaching from outside without crossing 6 never engages.
    const cold = provider()
    for (const x of [128, 127, 126.5]) {
      expect(step(cold, x)).toEqual({ adjust: 0, engaged: false })
    }
  })

  it('scales both thresholds with zoom', () => {
    // zoom 2: engage 3 world px, release 4.5 world px.
    const snap = provider()
    expect(step(snap, 123.5, 2)).toEqual({ adjust: 0, engaged: false }) // 3.5 > engage
    expect(step(snap, 122.5, 2)).toEqual({ adjust: -2.5, engaged: true }) // 2.5 ≤ engage
    expect(step(snap, 124, 2)).toEqual({ adjust: -4, engaged: true }) // 4 ≤ release: hold
    expect(step(snap, 125, 2)).toEqual({ adjust: 0, engaged: false }) // 5 > release
  })

  it('prefers the engaged stop over a closer new candidate while held', () => {
    const snap = createSnapProvider()
    // Facing edges at 100 and 108 (8 px apart, inside the release band).
    snap.begin([
      makePlacement({ x: 80, y: 100, width: 40, height: 40 }),
      makePlacement({ x: 128, y: 100, width: 40, height: 40 }),
    ])
    const engage = snap.query(
      query({ movingBounds: { x: 102, y: 300, width: 40, height: 40 } }),
    )
    expect(engage.dx).toBe(-2)
    expect(engage.guides[0]!.position).toBe(100) // engaged on 100
    // Left edge at 106: 6 px from 100 (held) but only 2 px from 108 —
    // stability beats optimality, the engaged stop wins.
    const held = snap.query(
      query({ movingBounds: { x: 106, y: 300, width: 40, height: 40 } }),
    )
    expect(held.dx).toBe(-6)
    expect(held.guides[0]!.position).toBe(100)
  })

  it('tracks engagement per axis independently', () => {
    const snap = provider()
    // Engage both axes near the static corner (120, 120).
    const both = snap.query(
      query({ movingBounds: { x: 123, y: 123, width: 40, height: 40 } }),
    )
    expect(both.guides.map((g) => g.axis)).toEqual(['x', 'y'])
    // Move y out past release while x stays in the hold band.
    const xOnly = snap.query(
      query({ movingBounds: { x: 127, y: 133, width: 40, height: 40 } }),
    )
    expect(xOnly.dx).toBe(-7)
    expect(xOnly.dy).toBe(0)
    expect(xOnly.guides.map((g) => g.axis)).toEqual(['x'])
  })

  it('resets engaged state in begin() and end()', () => {
    const snap = provider()
    expect(step(snap, 123).engaged).toBe(true)
    snap.begin([makePlacement({ x: 100, y: 100, width: 40, height: 40 })])
    // 7 px would be held if still engaged; a fresh gesture must not be.
    expect(step(snap, 127)).toEqual({ adjust: 0, engaged: false })

    expect(step(snap, 123).engaged).toBe(true)
    snap.end()
    snap.begin([makePlacement({ x: 100, y: 100, width: 40, height: 40 })])
    expect(step(snap, 127)).toEqual({ adjust: 0, engaged: false })
  })

  it('drops engagement while the disable modifier is held', () => {
    const snap = provider()
    expect(step(snap, 123).engaged).toBe(true)
    const off = snap.query(
      query({ movingBounds: { x: 123, y: 300, width: 40, height: 40 }, disabled: true }),
    )
    expect(off.guides).toHaveLength(0)
    // Re-enabled inside the hold band but outside the engage radius:
    // the broken engagement does not silently resume.
    expect(step(snap, 127)).toEqual({ adjust: 0, engaged: false })
    expect(step(snap, 125)).toEqual({ adjust: -5, engaged: true })
  })
})

describe('edge mask (AI-IMP-082)', () => {
  it('offers only the named edge as a moving candidate', () => {
    // Static AABB 80..120. Moving max edge at 77: 3 px from stop 80.
    const bounds = { x: 37, y: 300, width: 40, height: 40 }
    const max = provider().query(query({ movingBounds: bounds, edges: { x: 'max' } }))
    expect(max.dx).toBe(3)
    expect(max.guides[0]).toMatchObject({ axis: 'x', position: 80 })
    // The same bounds with a min mask: the min edge (37) is near no
    // stop, and the max edge is no longer a candidate.
    const min = provider().query(query({ movingBounds: bounds, edges: { x: 'min' } }))
    expect(min.dx).toBe(0)
    expect(min.guides).toHaveLength(0)
  })

  it('excludes the opposite edge and the center under a mask', () => {
    // Min edge at 123 (3 px from 120) snaps unmasked; masked to max
    // (candidate 163, near nothing) it must not.
    const opposite = provider().query(
      query({ movingBounds: { x: 123, y: 300, width: 40, height: 40 }, edges: { x: 'max' } }),
    )
    expect(opposite.dx).toBe(0)
    expect(opposite.guides).toHaveLength(0)
    // Moving center at 103 (3 px from the static center 100) snaps
    // unmasked; with a min mask (candidate 53) it must not.
    const center = provider().query(
      query({ movingBounds: { x: 53, y: 300, width: 100, height: 40 }, edges: { x: 'min' } }),
    )
    expect(center.dx).toBe(0)
    expect(center.guides).toHaveLength(0)
  })

  it('never snaps an axis omitted from the mask', () => {
    // Both axes within threshold of the static corner (120, 120); the
    // mask names only x, so y passes through untouched, guide-free.
    const result = provider().query(
      query({ movingBounds: { x: 77, y: 117, width: 40, height: 40 }, edges: { x: 'max' } }),
    )
    expect(result.dx).toBe(3) // max edge 117 → static max edge 120
    expect(result.dy).toBe(0)
    expect(result.guides.map((g) => g.axis)).toEqual(['x'])
    // An empty mask disables both axes outright.
    const none = provider().query(
      query({ movingBounds: { x: 123, y: 117, width: 40, height: 40 }, edges: {} }),
    )
    expect(none).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('keeps hysteresis semantics for masked candidates', () => {
    const snap = provider()
    const at = (x: number) =>
      snap.query(query({ movingBounds: { x, y: 300, width: 40, height: 40 }, edges: { x: 'max' } }))
    expect(at(77).dx).toBe(3) // max edge 117: engages 3 px from stop 120
    expect(at(87).dx).toBe(-7) // max edge 127, 7 px from 120: hold band
    expect(at(90).dx).toBe(0) // max edge 130, 10 px: past release
  })

  it('unmasked queries are unchanged (mask absent = move semantics)', () => {
    const masked = provider().query(
      query({ movingBounds: { x: 123, y: 300, width: 40, height: 40 } }),
    )
    expect(masked.dx).toBe(-3)
    expect(masked.guides[0]).toMatchObject({ axis: 'x', position: 120 })
  })
})
