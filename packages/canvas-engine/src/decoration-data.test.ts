import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  TEXT_LEGIBLE_SCREEN_PX,
  isConnectorData,
  isLineData,
  isPathData,
  isShapeData,
  isTextData,
  legibleFontSize,
  validateDecorationData,
} from './decoration-data'

const stroke = { stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH }

describe('decoration data validators', () => {
  it('accepts and rejects text data', () => {
    expect(isTextData({ x: 1, y: 2, text: 'hi', fontSize: 16, color: '#fff' })).toBe(true)
    expect(isTextData({ x: 1, y: 2, text: '', fontSize: 16, color: '#fff' })).toBe(true)
    expect(isTextData({ x: 1, y: 2, text: 'hi', fontSize: 16, color: '#fff', width: 120 })).toBe(
      true,
    )
    expect(isTextData({ x: 1, y: 2, text: 'hi', fontSize: 0, color: '#fff' })).toBe(false)
    expect(isTextData({ x: 1, y: 2, text: 'hi', fontSize: 16, color: '' })).toBe(false)
    expect(isTextData({ x: 1, y: 2, fontSize: 16, color: '#fff' })).toBe(false)
    expect(isTextData({ x: Number.NaN, y: 2, text: 'hi', fontSize: 16, color: '#fff' })).toBe(false)
    expect(isTextData(null)).toBe(false)
    expect(isTextData([])).toBe(false)
  })

  it('accepts and rejects shape data for every shape discriminator', () => {
    for (const shape of ['rect', 'ellipse', 'triangle'] as const) {
      expect(isShapeData({ shape, x: 0, y: 0, width: 10, height: 5, ...stroke })).toBe(true)
      expect(
        isShapeData({ shape, x: 0, y: 0, width: 10, height: 5, rotation: 0.4, fill: '#123', ...stroke }),
      ).toBe(true)
    }
    expect(isShapeData({ shape: 'hexagon', x: 0, y: 0, width: 10, height: 5, ...stroke })).toBe(
      false,
    )
    expect(isShapeData({ shape: 'rect', x: 0, y: 0, width: -1, height: 5, ...stroke })).toBe(false)
    expect(isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5 })).toBe(false)
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, stroke: '#fff', strokeWidth: 0 }),
    ).toBe(false)
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, rotation: 'ccw', ...stroke }),
    ).toBe(false)
    // §4.9 rev 0.16: cornerRadius is a 0–1 fraction.
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, cornerRadius: 0.5, ...stroke }),
    ).toBe(true)
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, cornerRadius: 1, ...stroke }),
    ).toBe(true)
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, cornerRadius: 1.2, ...stroke }),
    ).toBe(false)
    expect(
      isShapeData({ shape: 'rect', x: 0, y: 0, width: 10, height: 5, cornerRadius: -0.1, ...stroke }),
    ).toBe(false)
  })

  it('accepts and rejects path data', () => {
    expect(
      isPathData({
        points: [
          [0, 0],
          [3, 4],
        ],
        ...stroke,
      }),
    ).toBe(true)
    expect(isPathData({ points: [[0, 0]], ...stroke })).toBe(false)
    expect(isPathData({ points: [], ...stroke })).toBe(false)
    expect(
      isPathData({
        points: [
          [0, 0],
          [3, Number.NaN],
        ],
        ...stroke,
      }),
    ).toBe(false)
    expect(isPathData({ points: [[0, 0], [1]], ...stroke })).toBe(false)
    expect(
      isPathData({
        points: [
          [0, 0],
          [3, 4],
        ],
      }),
    ).toBe(false)
  })

  it('accepts and rejects line data', () => {
    expect(isLineData({ x1: 0, y1: 0, x2: 5, y2: 5, ...stroke })).toBe(true)
    expect(isLineData({ x1: 0, y1: 0, x2: 5, ...stroke })).toBe(false)
    expect(isLineData({ x1: 0, y1: 0, x2: 5, y2: Number.POSITIVE_INFINITY, ...stroke })).toBe(false)
    expect(isLineData({ x1: 0, y1: 0, x2: 5, y2: 5 })).toBe(false)
  })

  it('accepts connector data with optional freed-anchor fallback points', () => {
    expect(isConnectorData({ x1: 0, y1: 0, x2: 5, y2: 5, ...stroke })).toBe(true)
    expect(
      isConnectorData({ x1: 0, y1: 0, x2: 5, y2: 5, start: { x: 1, y: 2 }, ...stroke }),
    ).toBe(true)
    expect(
      isConnectorData({ x1: 0, y1: 0, x2: 5, y2: 5, end: { x: 1, y: 2 }, ...stroke }),
    ).toBe(true)
    expect(isConnectorData({ x1: 0, y1: 0, x2: 5, y2: 5, start: { x: 1 }, ...stroke })).toBe(false)
    expect(isConnectorData({ x1: 0, y1: 0, x2: 5, y2: 5, end: 'north', ...stroke })).toBe(false)
  })

  it('dispatches by kind and rejects unknown kinds', () => {
    expect(validateDecorationData('text', { x: 0, y: 0, text: 't', fontSize: 8, color: '#fff' })).toBe(
      true,
    )
    expect(
      validateDecorationData('shape', { shape: 'rect', x: 0, y: 0, width: 1, height: 1, ...stroke }),
    ).toBe(true)
    expect(
      validateDecorationData('path', {
        points: [
          [0, 0],
          [1, 1],
        ],
        ...stroke,
      }),
    ).toBe(true)
    expect(validateDecorationData('line', { x1: 0, y1: 0, x2: 1, y2: 1, ...stroke })).toBe(true)
    expect(validateDecorationData('arrow', { x1: 0, y1: 0, x2: 1, y2: 1, ...stroke })).toBe(true)
    expect(validateDecorationData('connector', { x1: 0, y1: 0, x2: 1, y2: 1, ...stroke })).toBe(true)
    expect(validateDecorationData('guide', { x: 0 })).toBe(false)
    expect(validateDecorationData('cloud', {})).toBe(false)
    expect(validateDecorationData('line', { x: 0, y: 0 })).toBe(false)
  })
})

describe('legibleFontSize', () => {
  it('yields the legible screen size at the creating zoom', () => {
    expect(legibleFontSize(1)).toBe(TEXT_LEGIBLE_SCREEN_PX)
    expect(legibleFontSize(2)).toBe(TEXT_LEGIBLE_SCREEN_PX / 2)
    expect(legibleFontSize(0.5) * 0.5).toBe(TEXT_LEGIBLE_SCREEN_PX)
  })

  it('never divides by zero', () => {
    expect(Number.isFinite(legibleFontSize(0))).toBe(true)
  })
})

describe('TextData measured extents (AI-IMP-030)', () => {
  it('accepts optional positive measured fields and rejects invalid ones', () => {
    const base = { x: 0, y: 0, text: 'hi', fontSize: 12, color: '#fff' }
    expect(isTextData(base)).toBe(true)
    expect(isTextData({ ...base, measuredWidth: 40, measuredHeight: 14 })).toBe(true)
    expect(isTextData({ ...base, measuredWidth: 0 })).toBe(false)
    expect(isTextData({ ...base, measuredHeight: Number.NaN })).toBe(false)
  })
})

describe('text style fields (AI-IMP-034)', () => {
  it('accepts whole-object style fields and rejects bad ones', () => {
    const base = { x: 0, y: 0, text: 'hi', fontSize: 12, color: '#fff' }
    expect(isTextData({ ...base, fontFamily: 'serif', bold: true, italic: false })).toBe(true)
    expect(isTextData({ ...base, fontFamily: '' })).toBe(false)
    expect(isTextData({ ...base, bold: 'yes' })).toBe(false)
  })
})

describe('arrow ShapeKind (AI-IMP-038)', () => {
  it('accepts the arrow variant', () => {
    expect(
      isShapeData({
        shape: 'arrow',
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        stroke: '#fff',
        strokeWidth: 2,
      }),
    ).toBe(true)
  })
})
