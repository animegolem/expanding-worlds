import { describe, expect, it } from 'vitest'
import {
  boundEdgeLength,
  chooseBindSide,
  DEFAULT_PAGE_EXTENT,
  MAX_RINGS,
  MIN_RINGS,
  pageBaseSize,
  ringCount,
  ringOffsets,
  WIDE_ASPECT,
  type BindSide,
} from './bound-geometry'

describe('chooseBindSide (§8.5/§8.8, AI-IMP-134)', () => {
  // The matrix: aspect × viewport position. Viewport is 1000 wide; the
  // image is a 200-px-wide band whose left/right shift across it.
  const V = 1000
  const cases: Array<{ name: string; aspect: number; left: number; right: number; want: BindSide }> =
    [
      // Wide images ignore position entirely — always below.
      { name: 'wide, centered', aspect: 2.0, left: 400, right: 600, want: 'below' },
      { name: 'wide, hard left', aspect: 1.6, left: 0, right: 200, want: 'below' },
      { name: 'wide, exactly the threshold', aspect: WIDE_ASPECT, left: 400, right: 600, want: 'below' },
      // Tall/square images pick the freer side.
      { name: 'tall, image on the left → more room right', aspect: 0.6, left: 40, right: 240, want: 'right' },
      { name: 'tall, image on the right → more room left', aspect: 0.6, left: 760, right: 960, want: 'left' },
      { name: 'square, image on the left', aspect: 1.0, left: 100, right: 300, want: 'right' },
      { name: 'square, image on the right', aspect: 1.0, left: 700, right: 900, want: 'left' },
      // Dead-centered, just under the wide threshold → tie breaks right.
      { name: 'centered tie → right', aspect: 1.39, left: 400, right: 600, want: 'right' },
    ]

  for (const c of cases) {
    it(c.name, () => {
      expect(chooseBindSide({ aspect: c.aspect, imageLeft: c.left, imageRight: c.right, viewportWidth: V })).toBe(
        c.want,
      )
    })
  }
})

describe('pageBaseSize (shared-edge sizing)', () => {
  const image = { width: 200, height: 360 }

  it('side-bound locks HEIGHT to the image, width free', () => {
    expect(pageBaseSize('right', image)).toEqual({ width: DEFAULT_PAGE_EXTENT, height: 360 })
    expect(pageBaseSize('left', image)).toEqual({ width: DEFAULT_PAGE_EXTENT, height: 360 })
  })

  it('bottom-bound locks WIDTH to the image, height free', () => {
    expect(pageBaseSize('below', { width: 480, height: 220 })).toEqual({
      width: 480,
      height: DEFAULT_PAGE_EXTENT,
    })
  })

  it('honors an explicit free extent', () => {
    expect(pageBaseSize('right', image, 250)).toEqual({ width: 250, height: 360 })
  })
})

describe('boundEdgeLength', () => {
  it('is the image height side-bound, the image width bottom-bound', () => {
    const image = { width: 200, height: 360 }
    expect(boundEdgeLength('right', image)).toBe(360)
    expect(boundEdgeLength('left', image)).toBe(360)
    expect(boundEdgeLength('below', image)).toBe(200)
  })
})

describe('ringCount (page-height-driven hardware)', () => {
  it('never drops below the floor, even for a sliver of an edge', () => {
    expect(ringCount(0)).toBe(MIN_RINGS)
    expect(ringCount(10)).toBe(MIN_RINGS)
    expect(ringCount(-5)).toBe(MIN_RINGS)
    expect(ringCount(Number.NaN)).toBe(MIN_RINGS)
  })

  it('grows monotonically with the edge length', () => {
    let prev = 0
    for (const edge of [64, 128, 256, 512, 900]) {
      const n = ringCount(edge)
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
  })

  it('clamps to the ceiling for a very long edge', () => {
    expect(ringCount(100000)).toBe(MAX_RINGS)
  })

  it('a taller page carries more rings than a shorter one', () => {
    expect(ringCount(400)).toBeGreaterThan(ringCount(120))
  })
})

describe('ringOffsets', () => {
  it('returns one inset center per ring, all within the edge', () => {
    const offsets = ringOffsets(300, 3)
    expect(offsets).toHaveLength(3)
    for (const o of offsets) {
      expect(o).toBeGreaterThan(0)
      expect(o).toBeLessThan(300)
    }
    // Evenly distributed midpoints of thirds.
    expect(offsets).toEqual([50, 150, 250])
  })

  it('is empty for a non-positive count', () => {
    expect(ringOffsets(300, 0)).toEqual([])
  })
})
