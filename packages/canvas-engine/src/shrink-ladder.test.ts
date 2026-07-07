import { describe, expect, it } from 'vitest'
import {
  EW_FURNITURE_MIN_PX,
  EW_PAGE_FLOOR_PX,
  isFurnitureVisible,
  pageDegradeStage,
} from './shrink-ladder'

describe('shrink ladder (AI-IMP-133, §8.2)', () => {
  it('pins the two ratified constants', () => {
    // Behavior-equivalent to the pre-133 scattered gates: the icon LOD
    // floor was 8, the charm/page floor 48. Changing these is a feel
    // dial (owner), not a refactor — so the values are locked here.
    expect(EW_FURNITURE_MIN_PX).toBe(8)
    expect(EW_PAGE_FLOOR_PX).toBe(48)
    expect(EW_FURNITURE_MIN_PX).toBeLessThan(EW_PAGE_FLOOR_PX)
  })

  describe('isFurnitureVisible', () => {
    it('hides furniture below the floor and shows it at/above (inclusive)', () => {
      expect(isFurnitureVisible(EW_FURNITURE_MIN_PX - 0.01)).toBe(false)
      expect(isFurnitureVisible(EW_FURNITURE_MIN_PX)).toBe(true)
      expect(isFurnitureVisible(EW_FURNITURE_MIN_PX + 0.01)).toBe(true)
      expect(isFurnitureVisible(0)).toBe(false)
      expect(isFurnitureVisible(1000)).toBe(true)
    })
  })

  describe('pageDegradeStage (ring → stroke → fade)', () => {
    it('is full at/above the page floor', () => {
      expect(pageDegradeStage(EW_PAGE_FLOOR_PX)).toBe('full')
      expect(pageDegradeStage(EW_PAGE_FLOOR_PX + 1)).toBe('full')
    })
    it('degrades to a stroke between the two floors', () => {
      expect(pageDegradeStage(EW_PAGE_FLOOR_PX - 0.01)).toBe('degraded')
      expect(pageDegradeStage(EW_FURNITURE_MIN_PX)).toBe('degraded')
    })
    it('fades whole below the furniture floor', () => {
      expect(pageDegradeStage(EW_FURNITURE_MIN_PX - 0.01)).toBe('hidden')
      expect(pageDegradeStage(0)).toBe('hidden')
    })
    it('shares its lower boundary with furniture visibility (one gesture reveals both)', () => {
      // At the furniture floor: furniture appears AND the page leaves
      // 'hidden' for 'degraded' — the §8.2 "reveal together" property.
      expect(isFurnitureVisible(EW_FURNITURE_MIN_PX)).toBe(true)
      expect(pageDegradeStage(EW_FURNITURE_MIN_PX)).not.toBe('hidden')
    })
  })
})
