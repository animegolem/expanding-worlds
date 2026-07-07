import { describe, expect, it } from 'vitest'
import { parseNodeRadius, parseNodeShadow, shadowGeometry } from './image-treatment'

describe('parseNodeShadow (§8.5, AI-IMP-140)', () => {
  it('reads offsets, blur, and alpha from a box-shadow token', () => {
    const parsed = parseNodeShadow('0 8px 22px rgba(0, 0, 0, 0.3)')
    expect(parsed.offsetX).toBe(0)
    expect(parsed.offsetY).toBe(8)
    expect(parsed.blur).toBe(22)
    expect(parsed.alpha).toBeCloseTo(0.3)
  })

  it('defaults alpha to opaque when the color carries none', () => {
    expect(parseNodeShadow('0 4px 10px rgb(0, 0, 0)').alpha).toBe(1)
    expect(parseNodeShadow('1px 2px 3px black').alpha).toBe(1)
  })

  it('clamps a stray alpha into range', () => {
    expect(parseNodeShadow('0 0 5px rgba(0,0,0,2)').alpha).toBe(1)
  })
})

describe('parseNodeRadius', () => {
  it('reads a pixel length', () => {
    expect(parseNodeRadius('3px')).toBe(3)
    expect(parseNodeRadius('0')).toBe(0)
    expect(parseNodeRadius('garbage')).toBe(0)
  })
})

describe('shadowGeometry', () => {
  const shadow = parseNodeShadow('0 8px 22px rgba(0, 0, 0, 0.3)')

  it('sizes the 9-slice to contain the corner curve plus the blur tail', () => {
    const geo = shadowGeometry(3, shadow)
    // sigma = 22 * 0.5 = 11; tail = ceil(11 * 3) = 33.
    expect(geo.sigma).toBeCloseTo(11)
    expect(geo.spread).toBe(33)
    // inset = ceil(radius + tail) = 3 + 33 = 36.
    expect(geo.inset).toBe(36)
    // textureSize = inset*2 + center strip.
    expect(geo.textureSize).toBe(36 * 2 + 2)
    // The 9-slice insets never overlap (both edges fit the texture).
    expect(geo.inset * 2).toBeLessThan(geo.textureSize)
    // inset must equal spread + radius so the corner aligns with the body.
    expect(geo.inset).toBe(geo.spread + geo.radius)
    expect(geo.offsetY).toBe(8)
    expect(geo.alpha).toBeCloseTo(0.3)
  })

  it('scales the tail with the blur radius', () => {
    const soft = shadowGeometry(3, parseNodeShadow('0 2px 40px rgba(0,0,0,0.2)'))
    const tight = shadowGeometry(3, parseNodeShadow('0 2px 4px rgba(0,0,0,0.2)'))
    expect(soft.spread).toBeGreaterThan(tight.spread)
  })
})
