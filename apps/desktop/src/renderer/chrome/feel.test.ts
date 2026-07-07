import { describe, expect, it } from 'vitest'
import {
  PANEL_LEGIBILITY_FADE,
  PANEL_LEGIBILITY_FLOOR,
  PANEL_TETHER_MAX_SCALE,
  tetheredPanelOpacity,
  tetheredPanelScale,
} from './feel'

// §8.5 rev 0.47: a tethered panel scales with the world, capped at the
// full-size default, and fades below a legibility floor rather than
// shrinking into unreadable confetti.
describe('tethered panel scale + legibility floor (RFC §8.5 rev 0.47)', () => {
  it('scales proportionally with zoom, capped at the full-size default', () => {
    expect(tetheredPanelScale(0.5)).toBe(0.5)
    expect(tetheredPanelScale(0.25)).toBe(0.25)
    // Never balloons past the default when zoomed in.
    expect(tetheredPanelScale(3)).toBe(PANEL_TETHER_MAX_SCALE)
    expect(tetheredPanelScale(1)).toBe(1)
    // Degenerate cameras never go negative.
    expect(tetheredPanelScale(-1)).toBe(0)
  })

  it('is fully opaque at or above the floor', () => {
    expect(tetheredPanelOpacity(1)).toBe(1)
    expect(tetheredPanelOpacity(PANEL_LEGIBILITY_FLOOR)).toBe(1)
    expect(tetheredPanelOpacity(PANEL_LEGIBILITY_FLOOR + 0.1)).toBe(1)
  })

  it('ramps smoothly to zero across the fade band (no pop)', () => {
    const gone = PANEL_LEGIBILITY_FLOOR - PANEL_LEGIBILITY_FADE
    expect(tetheredPanelOpacity(gone)).toBe(0)
    expect(tetheredPanelOpacity(gone - 0.05)).toBe(0)
    // Monotonic, continuous, bounded in (0,1) inside the band.
    const mid = tetheredPanelOpacity(gone + PANEL_LEGIBILITY_FADE / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(mid).toBeCloseTo(0.5, 5)
  })
})
