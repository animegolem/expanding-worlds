import { describe, expect, it } from 'vitest'
import { makePlacement } from './test-helpers'
import {
  PIN_DEFAULT_DIAMETER_PX,
  PIN_MAX_DIAMETER_PX,
  PIN_MIN_DIAMETER_PX,
  clampPinResizeFactor,
  pinDiameterWorld,
  pinEffectiveDiameterWorld,
  pinWorldDiameterAtZoom,
} from './pin-geometry'

describe('pin geometry (AI-IMP-310)', () => {
  it('turns the 26px ghost into replayable world units at placement zoom', () => {
    expect(pinWorldDiameterAtZoom(1)).toBe(PIN_DEFAULT_DIAMETER_PX)
    expect(pinWorldDiameterAtZoom(0.25)).toBe(104)
    expect(pinWorldDiameterAtZoom(2)).toBe(13)
  })

  it('resolves legacy disagreement to one diameter for render, hit, and resize', () => {
    const item = makePlacement({ appearanceKind: 'dot', width: 40, height: 90, scale: 2 })
    expect(pinDiameterWorld(item)).toBe(40)
    expect(pinEffectiveDiameterWorld(item)).toBe(80)
  })

  it('clamps uniform resize against the screen-space feel bounds', () => {
    const item = makePlacement({ appearanceKind: 'dot', width: 104, height: 104 })
    expect(clampPinResizeFactor([item], 0.01, 0.25)).toBeCloseTo(
      PIN_MIN_DIAMETER_PX / PIN_DEFAULT_DIAMETER_PX,
    )
    expect(clampPinResizeFactor([item], 99, 0.25)).toBeCloseTo(
      PIN_MAX_DIAMETER_PX / PIN_DEFAULT_DIAMETER_PX,
    )
  })

  it('prioritizes minimum legibility for an impossible mixed-dot range', () => {
    const tiny = makePlacement({ appearanceKind: 'dot', width: 1, height: 1 })
    const huge = makePlacement({ appearanceKind: 'dot', width: 1_000, height: 1_000 })
    // No uniform factor can make both dots fit 13–104px. The minimum
    // legibility law wins deliberately, even though huge remains over max.
    expect(clampPinResizeFactor([tiny, huge], 1, 1)).toBe(13)
  })
})
