import { describe, expect, it } from 'vitest'
import { renderStrokeWidth } from './stroke-render'

describe('renderStrokeWidth (AI-IMP-040)', () => {
  it('passes through widths at or above one screen pixel', () => {
    expect(renderStrokeWidth(2, 1)).toBe(2)
    expect(renderStrokeWidth(2, 0.5)).toBe(2) // exactly 1px
    expect(renderStrokeWidth(40, 0.1)).toBe(40)
  })

  it('clamps sub-pixel widths to exactly one screen pixel', () => {
    expect(renderStrokeWidth(2, 0.05)).toBeCloseTo(20) // 1 / 0.05
    expect(renderStrokeWidth(0.5, 1)).toBe(1)
  })
})
