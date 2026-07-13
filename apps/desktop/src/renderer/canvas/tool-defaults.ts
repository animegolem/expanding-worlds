import { legibleFontSize, type ToolKind, type ToolStyle } from '@ew/canvas-engine'

export type ToolDefaultsKind = 'text' | 'shape' | 'line'

const SHAPES = new Set<ToolKind>(['rect', 'ellipse', 'triangle', 'diamond', 'shape-arrow'])
const LINES = new Set<ToolKind>(['path', 'line', 'arrow', 'connector'])

/** Which defaults the armed tool consumes; null means the Dock stays at rest. */
export function defaultsKind(tool: ToolKind): ToolDefaultsKind | null {
  if (tool === 'text') return 'text'
  if (SHAPES.has(tool)) return 'shape'
  if (LINES.has(tool)) return 'line'
  return null
}

/** One MRU queue feeds the kit's 3/6/9 color windows. */
export function rememberToolColor(recent: readonly string[], color: string): string[] {
  return [color, ...recent.filter((entry) => entry !== color)].slice(0, 9)
}

/** Defaults for a new text decoration. Size remains legible at the
 * creating zoom; the Dock stores only the artist's 0.5–3× multiplier. */
export function nextTextDefaults(style: ToolStyle, zoom: number): {
  fontSize: number
  color: string
  fontFamily: string
} {
  return {
    fontSize: legibleFontSize(zoom) * (style.textSizeScale ?? 1),
    color: style.textColor,
    fontFamily: style.textFontFamily ?? 'sans-serif',
  }
}
