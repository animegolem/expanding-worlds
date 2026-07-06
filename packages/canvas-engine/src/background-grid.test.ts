import { describe, expect, it } from 'vitest'
import {
  GRID_BASE_SPACING,
  GRID_MAJOR_EASE_PX,
  GRID_MAJOR_FULL_PX,
  GRID_MAJOR_MIN_PX,
  GRID_MAX_ALPHA,
  GRID_MINOR_FADE_START_PX,
  GRID_MINOR_MAX,
  GRID_SUBDIVISION,
  gridLevels,
  gridLinePositions,
  majorAlpha,
  minorAlpha,
  stageExtent,
} from './background-grid'

/**
 * The alpha a single world line renders at, per the two-tier draw
 * contract: major lines carry the major alpha; minor-only lines
 * (not coincident with major) carry the minor alpha; finer lines
 * are not drawn. Mirrors drawGrid's stroke assignment so the
 * continuity proof speaks about actual pixels, not tier labels.
 */
function lineAlphaAt(zoom: number, lineLevelSpacing: number): number {
  const [major, minor] = gridLevels(zoom)
  if (lineLevelSpacing % major.spacing === 0) return major.alpha
  if (lineLevelSpacing % minor.spacing === 0) return minor.alpha
  return 0
}

describe('two-tier grid levels (AI-IMP-099)', () => {
  it('keeps the major cell in the sane screen band at any zoom', () => {
    for (const zoom of [0.003, 0.02, 0.1, 0.37, 1, 2.7, 8, 64, 500]) {
      const [major, minor] = gridLevels(zoom)
      expect(major.spacing * zoom).toBeGreaterThanOrEqual(GRID_MAJOR_MIN_PX)
      expect(major.spacing * zoom).toBeLessThan(GRID_MAJOR_MIN_PX * GRID_SUBDIVISION)
      expect(minor.spacing).toBe(major.spacing / GRID_SUBDIVISION)
    }
  })

  it('tier promotion happens at the right thresholds across a zoom sweep', () => {
    // Spacing 64 is major exactly while its cell is in [48, 192)px:
    // zoom ∈ [0.75, 3); below that it is the minor of spacing 256.
    expect(gridLevels(0.74)[1].spacing).toBe(GRID_BASE_SPACING)
    expect(gridLevels(0.74)[0].spacing).toBe(GRID_BASE_SPACING * GRID_SUBDIVISION)
    expect(gridLevels(0.76)[0].spacing).toBe(GRID_BASE_SPACING)
    expect(gridLevels(2.9)[0].spacing).toBe(GRID_BASE_SPACING)
    expect(gridLevels(3.1)[0].spacing).toBe(GRID_BASE_SPACING / GRID_SUBDIVISION)
    // Powers of the subdivision factor, indefinitely in both directions.
    const [deepIn] = gridLevels(1000)
    const [deepOut] = gridLevels(0.001)
    const ratioIn = GRID_BASE_SPACING / deepIn.spacing
    const ratioOut = deepOut.spacing / GRID_BASE_SPACING
    expect(Math.log(ratioIn) / Math.log(GRID_SUBDIVISION)).toBeCloseTo(
      Math.round(Math.log(ratioIn) / Math.log(GRID_SUBDIVISION)),
      10,
    )
    expect(Math.log(ratioOut) / Math.log(GRID_SUBDIVISION)).toBeCloseTo(
      Math.round(Math.log(ratioOut) / Math.log(GRID_SUBDIVISION)),
      10,
    )
  })

  it('minor stays capped well below the full grid opacity at every zoom', () => {
    const cap = GRID_MINOR_MAX * GRID_MAX_ALPHA
    for (let z = 0.01, i = 0; i < 400; i += 1, z *= 1.035) {
      const [major, minor] = gridLevels(z)
      expect(minor.alpha).toBeLessThanOrEqual(cap + 1e-12)
      expect(minor.alpha).toBeGreaterThanOrEqual(0)
      // Subordination: the minor never outweighs the major.
      expect(minor.alpha).toBeLessThanOrEqual(major.alpha + 1e-12)
      // The major peaks at (and never exceeds) the theme opacity.
      expect(major.alpha).toBeLessThanOrEqual(GRID_MAX_ALPHA + 1e-12)
      expect(major.alpha).toBeGreaterThanOrEqual(cap - 1e-12)
    }
  })

  it('major carries full grid opacity through the heart of its band', () => {
    // Mid-band cell sizes — the plateau [FULL, EASE] px.
    for (const cellPx of [GRID_MAJOR_FULL_PX, 100, 128, GRID_MAJOR_EASE_PX]) {
      expect(majorAlpha(cellPx)).toBe(GRID_MAX_ALPHA)
    }
  })

  it('opacity is continuous across a tier promotion (the seamlessness proof)', () => {
    // Promotion boundary for spacing 64: zoom* = 48/64 = 0.75, where
    // 64 stops being minor and becomes major. Evaluate the drawn
    // alpha of each line class just below and just above.
    const zStar = GRID_MAJOR_MIN_PX / GRID_BASE_SPACING
    const eps = 1e-9
    // The promoted lines themselves (spacing-64-only lines).
    const before = lineAlphaAt(zStar - eps, GRID_BASE_SPACING)
    const after = lineAlphaAt(zStar + eps, GRID_BASE_SPACING)
    expect(after).toBeCloseTo(before, 6)
    // Both sides sit at the handoff value: minor's ramp lands
    // exactly where major's begins.
    expect(before).toBeCloseTo(GRID_MINOR_MAX * GRID_MAX_ALPHA, 6)
    // The outgoing major (spacing 256): eased down to the handoff
    // value, then absorbed into the new major at that same value.
    const coarseBefore = lineAlphaAt(zStar - eps, GRID_BASE_SPACING * GRID_SUBDIVISION)
    const coarseAfter = lineAlphaAt(zStar + eps, GRID_BASE_SPACING * GRID_SUBDIVISION)
    expect(coarseAfter).toBeCloseTo(coarseBefore, 6)
    // The incoming minor (spacing 16): enters at exactly zero.
    const fineBefore = lineAlphaAt(zStar - eps, GRID_BASE_SPACING / GRID_SUBDIVISION)
    const fineAfter = lineAlphaAt(zStar + eps, GRID_BASE_SPACING / GRID_SUBDIVISION)
    expect(fineBefore).toBe(0)
    expect(fineAfter).toBeCloseTo(0, 6)
  })

  it('no line class ever jumps: dense zoom sweep is Lipschitz-small', () => {
    // Sweep four octaves of zoom in fine geometric steps; every
    // line level's drawn alpha must change by less than what the
    // steepest ramp allows — no discontinuity hides between the
    // hand-picked boundary probes above.
    const spacings = [16, 64, 256, 1024]
    const step = 1.002
    let z = 0.2
    let prev = spacings.map((s) => lineAlphaAt(z, s))
    for (let i = 0; i < 1400; i += 1) {
      z *= step
      const next = spacings.map((s) => lineAlphaAt(z, s))
      for (let k = 0; k < spacings.length; k += 1) {
        expect(Math.abs(next[k]! - prev[k]!)).toBeLessThan(0.01)
      }
      prev = next
    }
  })

  it('ramp endpoints satisfy the two handoff invariants', () => {
    const handoff = GRID_MINOR_MAX * GRID_MAX_ALPHA
    // 1. Minor's ramp ends exactly where major's begins.
    expect(minorAlpha(GRID_MAJOR_MIN_PX)).toBeCloseTo(handoff, 12)
    expect(majorAlpha(GRID_MAJOR_MIN_PX)).toBeCloseTo(handoff, 12)
    // 2. Major's ease returns to the handoff value at the top of
    //    the band (its lines join the next major there), and a
    //    freshly entering minor starts from zero.
    expect(majorAlpha(GRID_MAJOR_MIN_PX * GRID_SUBDIVISION)).toBeCloseTo(handoff, 12)
    expect(minorAlpha(GRID_MAJOR_MIN_PX / GRID_SUBDIVISION)).toBe(0)
    expect(GRID_MINOR_FADE_START_PX).toBeGreaterThanOrEqual(
      GRID_MAJOR_MIN_PX / GRID_SUBDIVISION,
    )
  })

  it('line positions cover exactly the visible world rect', () => {
    const { vertical, horizontal } = gridLinePositions(
      { x: 95, y: -10, zoom: 1 },
      { width: 200, height: 100 },
      64,
    )
    expect(vertical[0]).toBe(64)
    expect(vertical[vertical.length - 1]).toBeLessThanOrEqual(295)
    expect(horizontal[0]).toBe(-64)
    expect(horizontal[horizontal.length - 1]).toBeLessThanOrEqual(90)
  })

  it('minor positions exclude lines coincident with the major', () => {
    // Overdraw would alpha-blend shared lines darker and pop at
    // promotion; the minor tier skips every SUBDIVISION-th line.
    const { vertical } = gridLinePositions(
      { x: -10, y: 0, zoom: 1 },
      { width: 300, height: 100 },
      16,
      GRID_SUBDIVISION,
    )
    expect(vertical.length).toBeGreaterThan(0)
    for (const x of vertical) expect(x % 64).not.toBe(0)
    expect(vertical).toContain(16)
    expect(vertical).toContain(48)
    expect(vertical).not.toContain(0)
    expect(vertical).not.toContain(64)
  })

  // Dots mode: honestly excluded. The none/lines/dots vocabulary is
  // RFC §11.5 inventory — the settings row is a disabled placeholder
  // ("arrives with the grid feature") and no dots renderer exists in
  // the engine or the host. The tier/opacity math above is
  // presentation-agnostic (gridLevels knows nothing about strokes),
  // so a future dots renderer inherits the crossfade by consuming
  // the same levels.
})

describe('stage extent (AI-IMP-032)', () => {
  const background = {
    color: null,
    assetId: 'a',
    assetContentHash: 'h'.repeat(64),
    assetMimeType: 'image/png',
    assetWidth: 800,
    assetHeight: 600,
    settings: { x: 10, y: 20, scale: 2.56, opacity: 1 },
  }

  it('derives the extent from native dims and the stored transform', () => {
    expect(stageExtent(background)).toEqual({ x: 10, y: 20, width: 2048, height: 1536 })
  })

  it('is null without an image or without known dims', () => {
    expect(stageExtent(null)).toBeNull()
    expect(stageExtent({ ...background, assetContentHash: null })).toBeNull()
    expect(stageExtent({ ...background, assetWidth: null })).toBeNull()
  })
})
