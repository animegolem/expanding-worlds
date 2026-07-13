/**
 * Normative decoration `data` schemas (RFC §4.9, AI-IMP-021). All
 * units are world-space: a decoration owns a fixed world size and
 * scales only with canvas zoom, never rescaled afterwards. The `kind`
 * column discriminates the family ('text' | 'path' | 'shape' | 'line'
 * | 'arrow' | 'connector'); basic shapes are discriminated
 * INSIDE shape data via `data.shape`. Text MUST store its string at
 * `data.text` — canvas_text_fts extracts `$.text` (§9).
 */

export interface TextData {
  x: number
  y: number
  text: string
  /** World units, fixed at creation (rev 0.8: never rescaled). */
  fontSize: number
  color: string
  /** Optional word-wrap width in world units. */
  width?: number
  /** Measured rendered extents in world units, refreshed on every
   * create/edit (AI-IMP-030). Hit-testing estimates from font
   * metrics when absent (legacy rows), so text stays selectable. */
  measuredWidth?: number
  measuredHeight?: number
  /** Whole-object styling (§4.9 rev 0.12): one face per text
   * decoration from a curated set of CSS stacks. Per-span rich text
   * is deferred — styled runs in data if ever, never HTML. */
  fontFamily?: string
  bold?: boolean
  italic?: boolean
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'arrow'

export interface ShapeData {
  shape: ShapeKind
  /** Top-left of the unrotated bounding box. */
  x: number
  y: number
  width: number
  height: number
  /** Radians about the box center. */
  rotation?: number
  stroke: string
  strokeWidth: number
  fill?: string
  /** Rect corner rounding as a fraction (0–1) of the shorter box
   * dimension's half (§4.9 rev 0.16); absent/0 = sharp. */
  cornerRadius?: number
}

export interface PathData {
  points: Array<[number, number]>
  stroke: string
  strokeWidth: number
}

export interface LineData {
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
}

/**
 * Connector: while an endpoint is anchored, the corresponding
 * anchorStart/EndPlacementId column overrides the stored point; the
 * stored point is the free/fallback position. When the domain
 * releases an anchor (anchored placement deleted) it writes the last
 * rendered position into `data.start` / `data.end`, which then takes
 * precedence over x1/y1/x2/y2.
 */
export interface ConnectorData extends LineData {
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

// ------------------------------------------------------------ validators

function isFinite_(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hasStroke(d: Record<string, unknown>): boolean {
  return isNonEmptyString(d['stroke']) && isFinite_(d['strokeWidth']) && d['strokeWidth'] > 0
}

export function isTextData(data: unknown): data is TextData {
  if (!isRecord(data)) return false
  return (
    isFinite_(data['x']) &&
    isFinite_(data['y']) &&
    typeof data['text'] === 'string' &&
    isFinite_(data['fontSize']) &&
    data['fontSize'] > 0 &&
    isNonEmptyString(data['color']) &&
    (data['width'] === undefined || (isFinite_(data['width']) && data['width'] > 0)) &&
    (data['measuredWidth'] === undefined ||
      (isFinite_(data['measuredWidth']) && data['measuredWidth'] > 0)) &&
    (data['measuredHeight'] === undefined ||
      (isFinite_(data['measuredHeight']) && data['measuredHeight'] > 0)) &&
    (data['fontFamily'] === undefined || isNonEmptyString(data['fontFamily'])) &&
    (data['bold'] === undefined || typeof data['bold'] === 'boolean') &&
    (data['italic'] === undefined || typeof data['italic'] === 'boolean')
  )
}

export function isShapeData(data: unknown): data is ShapeData {
  if (!isRecord(data)) return false
  return (
    (data['shape'] === 'rect' ||
      data['shape'] === 'ellipse' ||
      data['shape'] === 'triangle' ||
      data['shape'] === 'diamond' ||
      data['shape'] === 'arrow') &&
    isFinite_(data['x']) &&
    isFinite_(data['y']) &&
    isFinite_(data['width']) &&
    data['width'] >= 0 &&
    isFinite_(data['height']) &&
    data['height'] >= 0 &&
    (data['rotation'] === undefined || isFinite_(data['rotation'])) &&
    hasStroke(data) &&
    (data['fill'] === undefined || isNonEmptyString(data['fill'])) &&
    (data['cornerRadius'] === undefined ||
      (isFinite_(data['cornerRadius']) && data['cornerRadius'] >= 0 && data['cornerRadius'] <= 1))
  )
}

export function isPathData(data: unknown): data is PathData {
  if (!isRecord(data)) return false
  const points = data['points']
  if (!Array.isArray(points) || points.length < 2) return false
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || !isFinite_(p[0]) || !isFinite_(p[1])) return false
  }
  return hasStroke(data)
}

export function isLineData(data: unknown): data is LineData {
  if (!isRecord(data)) return false
  return (
    isFinite_(data['x1']) &&
    isFinite_(data['y1']) &&
    isFinite_(data['x2']) &&
    isFinite_(data['y2']) &&
    hasStroke(data)
  )
}

function isPoint(v: unknown): v is { x: number; y: number } {
  return isRecord(v) && isFinite_(v['x']) && isFinite_(v['y'])
}

export function isConnectorData(data: unknown): data is ConnectorData {
  if (!isLineData(data)) return false
  const d = data as unknown as Record<string, unknown>
  return (
    (d['start'] === undefined || isPoint(d['start'])) &&
    (d['end'] === undefined || isPoint(d['end']))
  )
}

/** Dispatch by decoration `kind` column value. Unknown kinds reject. */
export function validateDecorationData(kind: string, data: unknown): boolean {
  switch (kind) {
    case 'text':
      return isTextData(data)
    case 'shape':
      return isShapeData(data)
    case 'path':
      return isPathData(data)
    case 'line':
    case 'arrow':
      return isLineData(data)
    case 'connector':
      return isConnectorData(data)
    default:
      return false
  }
}

// -------------------------------------------------------------- defaults

export const DEFAULT_STROKE = '#dde3ea'
export const DEFAULT_STROKE_WIDTH = 2

/** Screen pixels a fresh text decoration should occupy when created. */
export const TEXT_LEGIBLE_SCREEN_PX = 16

/** Screen pixels a fresh stroke should span at the creating zoom
 * (§6.8 rev 0.14), scaled by the toolbar's weight multiplier. */
export const STROKE_LEGIBLE_SCREEN_PX = 2

/** Pen arrows use a thicker baseline so the head (~3x) reads. */
export const ARROW_LEGIBLE_SCREEN_PX = 4

/**
 * §4.9 rev 0.8: new text SHOULD default to a world size legible at
 * the creating viewport, fixed thereafter. World fontSize such that
 * the text renders at TEXT_LEGIBLE_SCREEN_PX on screen at `zoom`.
 */
export function legibleFontSize(zoom: number): number {
  return TEXT_LEGIBLE_SCREEN_PX / Math.max(zoom, 1e-6)
}
