import { describe, expect, it } from 'vitest'
import { isAppearanceCrop, MIN_APPEARANCE_CROP_SIZE } from './records'

describe('appearance crop contract', () => {
  it('accepts a finite normalized rectangle at the shared minimum', () => {
    expect(
      isAppearanceCrop({
        x: 0.25,
        y: 0.5,
        width: MIN_APPEARANCE_CROP_SIZE,
        height: MIN_APPEARANCE_CROP_SIZE,
      }),
    ).toBe(true)
  })

  it('rejects non-finite, undersized, and out-of-bounds rectangles', () => {
    expect(isAppearanceCrop({ x: 0, y: 0, width: Number.NaN, height: 1 })).toBe(false)
    expect(isAppearanceCrop({ x: 0, y: 0, width: 0.01, height: 1 })).toBe(false)
    expect(isAppearanceCrop({ x: 0.8, y: 0, width: 0.3, height: 1 })).toBe(false)
    expect(isAppearanceCrop({ x: 0, y: -0.1, width: 1, height: 1 })).toBe(false)
  })
})
