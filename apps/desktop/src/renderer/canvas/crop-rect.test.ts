import { describe, expect, it } from 'vitest'
import {
  clampCrop,
  FULL_CROP,
  isFullCrop,
  isValidCrop,
  MIN_CROP_SIZE,
  moveCrop,
  normalizeCrop,
  resetCrop,
  resizeCropByHandle,
} from './crop-rect'

describe('crop-rect math (§4.6)', () => {
  it('clamps a rect back inside the unit square', () => {
    const clamped = clampCrop({ x: -0.2, y: 0.5, width: 0.6, height: 0.9 })
    expect(clamped.x).toBe(0)
    expect(clamped.y + clamped.height).toBeCloseTo(1)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1 + 1e-9)
    expect(clamped.y).toBeGreaterThanOrEqual(0)
  })

  it('enforces the minimum size on a collapsed rect', () => {
    const clamped = clampCrop({ x: 0.5, y: 0.5, width: 0, height: -1 })
    expect(clamped.width).toBeGreaterThanOrEqual(MIN_CROP_SIZE)
    expect(clamped.height).toBeGreaterThanOrEqual(MIN_CROP_SIZE)
  })

  it('treats the full frame as uncropped (normalizes to null)', () => {
    expect(isFullCrop(FULL_CROP)).toBe(true)
    expect(normalizeCrop(FULL_CROP)).toBeNull()
    expect(normalizeCrop(resetCrop())).toBeNull()
  })

  it('normalizes a genuine crop to a clamped rect', () => {
    const norm = normalizeCrop({ x: 0.25, y: 0.1, width: 0.5, height: 0.6 })
    expect(norm).not.toBeNull()
    expect(norm).toEqual({ x: 0.25, y: 0.1, width: 0.5, height: 0.6 })
  })

  it('reset restores the whole image', () => {
    expect(resetCrop()).toEqual(FULL_CROP)
  })

  it('drags a corner handle, holding the opposite edges', () => {
    // Start full-frame, drag the NW corner in by (0.2, 0.3).
    const next = resizeCropByHandle(FULL_CROP, 'nw', 0.2, 0.3)
    expect(next.x).toBeCloseTo(0.2)
    expect(next.y).toBeCloseTo(0.3)
    // The SE corner (opposite) stays pinned at the image edge.
    expect(next.x + next.width).toBeCloseTo(1)
    expect(next.y + next.height).toBeCloseTo(1)
  })

  it('an edge handle moves only its own edge', () => {
    const next = resizeCropByHandle(FULL_CROP, 'e', -0.4, 0.9)
    expect(next.x).toBeCloseTo(0)
    expect(next.width).toBeCloseTo(0.6)
    // Vertical edges untouched by the east handle.
    expect(next.y).toBeCloseTo(0)
    expect(next.height).toBeCloseTo(1)
  })

  it('a handle cannot invert past the minimum size', () => {
    // Drag the west edge far past the east edge.
    const next = resizeCropByHandle({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 'w', 5, 0)
    expect(next.width).toBeGreaterThanOrEqual(MIN_CROP_SIZE - 1e-9)
    expect(next.x + next.width).toBeCloseTo(0.8)
  })

  it('moves a rect while preserving its size and staying in bounds', () => {
    const rect = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }
    const moved = moveCrop(rect, 5, -5)
    expect(moved.width).toBe(0.4)
    expect(moved.height).toBe(0.4)
    expect(moved.x).toBeCloseTo(0.6) // pinned at 1 - width
    expect(moved.y).toBeCloseTo(0)
  })

  it('validates committed rects', () => {
    expect(isValidCrop({ x: 0.25, y: 0.1, width: 0.5, height: 0.6 })).toBe(true)
    expect(isValidCrop(FULL_CROP)).toBe(true)
    expect(isValidCrop({ x: -0.1, y: 0, width: 0.5, height: 0.5 })).toBe(false)
    expect(isValidCrop({ x: 0.8, y: 0, width: 0.5, height: 0.5 })).toBe(false)
    expect(isValidCrop({ x: 0, y: 0, width: 0.01, height: 0.5 })).toBe(false)
    expect(isValidCrop({ x: 0, y: 0, width: Number.NaN, height: 0.5 })).toBe(false)
  })
})
