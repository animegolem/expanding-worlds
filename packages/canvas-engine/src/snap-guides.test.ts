import { Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import {
  drawSnapGuides,
  snapGuideSegments,
  SNAP_GUIDE_ALPHA,
  SNAP_GUIDE_COLOR,
  SNAP_GUIDE_DASH_PX,
  SNAP_GUIDE_GAP_PX,
  SNAP_GUIDE_WIDTH_PX,
} from './snap-guides'
import type { SnapGuide } from './snap'

const view = (zoom: number) => ({ x: 0, y: 0, zoom })

/** Recording stand-in for a PixiJS Graphics (chainable subset). */
function stubGfx() {
  const calls = {
    cleared: 0,
    moveTo: [] as Array<[number, number]>,
    lineTo: [] as Array<[number, number]>,
    strokes: [] as Array<Record<string, unknown>>,
  }
  const gfx = {
    clear: () => {
      calls.cleared += 1
      return gfx
    },
    moveTo: (x: number, y: number) => {
      calls.moveTo.push([x, y])
      return gfx
    },
    lineTo: (x: number, y: number) => {
      calls.lineTo.push([x, y])
      return gfx
    },
    stroke: (style: Record<string, unknown>) => {
      calls.strokes.push(style)
      return gfx
    },
  }
  return { gfx: gfx as unknown as Graphics, calls }
}

describe('snapGuideSegments', () => {
  it('dashes a vertical (axis x) guide with screen-constant segments', () => {
    const guide: SnapGuide = { axis: 'x', position: 120, from: 0, to: 100 }
    const segments = snapGuideSegments(guide, view(1))
    // dash 4 + gap 4 = period 8 → ceil(100 / 8) = 13 dashes.
    expect(segments).toHaveLength(13)
    expect(segments[0]).toEqual({ fromX: 120, fromY: 0, toX: 120, toY: 4 })
    expect(segments[1]).toEqual({ fromX: 120, fromY: 8, toX: 120, toY: 12 })
    expect(segments[12]).toEqual({ fromX: 120, fromY: 96, toX: 120, toY: 100 })
    for (const s of segments) {
      expect(s.fromX).toBe(120) // vertical line: constant x
      expect(s.toX).toBe(120)
      expect(s.toY - s.fromY).toBeLessThanOrEqual(SNAP_GUIDE_DASH_PX)
    }
  })

  it('dashes a horizontal (axis y) guide along x at constant y', () => {
    const guide: SnapGuide = { axis: 'y', position: -30, from: 10, to: 20 }
    const segments = snapGuideSegments(guide, view(1))
    // Period 8 over span 10 → dashes at 10..14 and 18..20 (clamped).
    expect(segments).toEqual([
      { fromX: 10, fromY: -30, toX: 14, toY: -30 },
      { fromX: 18, fromY: -30, toX: 20, toY: -30 },
    ])
  })

  it('divides dash and gap by zoom so dashes stay screen-sized', () => {
    const guide: SnapGuide = { axis: 'x', position: 0, from: 0, to: 9 }
    // zoom 2 → dash 2, gap 2, period 4 → dashes at 0, 4, 8 (last clamped).
    expect(snapGuideSegments(guide, view(2))).toEqual([
      { fromX: 0, fromY: 0, toX: 0, toY: 2 },
      { fromX: 0, fromY: 4, toX: 0, toY: 6 },
      { fromX: 0, fromY: 8, toX: 0, toY: 9 },
    ])
    // zoom 0.5 → dash 8, gap 8: one dash covers 0..8, next starts at 16.
    expect(snapGuideSegments(guide, view(0.5))).toEqual([
      { fromX: 0, fromY: 0, toX: 0, toY: 8 },
    ])
  })

  it('emits nothing for a degenerate zero-length span', () => {
    expect(
      snapGuideSegments({ axis: 'x', position: 5, from: 40, to: 40 }, view(1)),
    ).toEqual([])
  })
})

describe('drawSnapGuides', () => {
  it('clears, dashes every guide, and strokes quiet 1px screen-width lines', () => {
    const { gfx, calls } = stubGfx()
    const guides: SnapGuide[] = [
      { axis: 'x', position: 120, from: 0, to: 100 }, // 13 dashes at zoom 1
      { axis: 'y', position: -30, from: 10, to: 20 }, // 2 dashes at zoom 1
    ]
    drawSnapGuides(gfx, guides, view(1))
    expect(calls.cleared).toBe(1)
    expect(calls.moveTo).toHaveLength(15)
    expect(calls.lineTo).toHaveLength(15)
    expect(calls.strokes).toEqual([
      { width: SNAP_GUIDE_WIDTH_PX, color: SNAP_GUIDE_COLOR, alpha: SNAP_GUIDE_ALPHA },
    ])
  })

  it('scales stroke width by 1/zoom (screen-equivalent 1px)', () => {
    const { gfx, calls } = stubGfx()
    drawSnapGuides(gfx, [{ axis: 'x', position: 0, from: 0, to: 16 }], view(4))
    expect(calls.strokes[0]!['width']).toBe(SNAP_GUIDE_WIDTH_PX / 4)
    // dash 1 + gap 1 at zoom 4 → period 2 over span 16 → 8 dashes.
    expect(calls.moveTo).toHaveLength(16 / ((SNAP_GUIDE_DASH_PX + SNAP_GUIDE_GAP_PX) / 4))
  })

  it('only clears when given no guides (release erases the overlay)', () => {
    const { gfx, calls } = stubGfx()
    drawSnapGuides(gfx, [], view(1))
    expect(calls.cleared).toBe(1)
    expect(calls.moveTo).toHaveLength(0)
    expect(calls.strokes).toHaveLength(0)
  })

  it('runs against a real PixiJS Graphics without throwing', () => {
    const gfx = new Graphics()
    expect(() =>
      drawSnapGuides(gfx, [{ axis: 'y', position: 50, from: 0, to: 64 }], view(1)),
    ).not.toThrow()
    expect(() => drawSnapGuides(gfx, [], view(1))).not.toThrow()
    gfx.destroy()
  })
})
