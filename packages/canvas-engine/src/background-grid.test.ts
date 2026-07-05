import { describe, expect, it } from 'vitest'
import {
  GRID_BASE_SPACING,
  GRID_MAX_ALPHA,
  gridLevels,
  gridLinePositions,
  stageExtent,
} from './background-grid'

describe('adaptive grid levels (AI-IMP-032)', () => {
  it('keeps the coarse level in the legible screen band at any zoom', () => {
    for (const zoom of [0.02, 0.1, 0.37, 1, 2.7, 8, 64]) {
      const [coarse, fine] = gridLevels(zoom)
      expect(coarse.spacing * zoom).toBeGreaterThanOrEqual(48)
      expect(coarse.spacing * zoom).toBeLessThan(96)
      expect(fine.spacing).toBe(coarse.spacing / 2)
      expect(coarse.alpha).toBe(GRID_MAX_ALPHA)
      expect(fine.alpha).toBeGreaterThanOrEqual(0)
      expect(fine.alpha).toBeLessThanOrEqual(GRID_MAX_ALPHA)
    }
  })

  it('subdivides forever: zooming 2x halves the coarse spacing', () => {
    const [atOne] = gridLevels(1)
    const [atTwo] = gridLevels(2)
    expect(atTwo.spacing).toBe(atOne.spacing / 2)
    expect(gridLevels(1)[0].spacing % GRID_BASE_SPACING === 0 ||
      GRID_BASE_SPACING % gridLevels(1)[0].spacing === 0).toBe(true)
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
