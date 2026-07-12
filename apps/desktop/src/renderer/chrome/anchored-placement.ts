/** Pure §8.8 placement for every measured surface anchored to a point or rect. */
export interface PlacementRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PlacementSize {
  width: number
  height: number
}

export interface ChromeBands {
  top: number
  right: number
  bottom: number
  left: number
}

export type AxisPlacement = 'before' | 'start' | 'center' | 'end' | 'after'

export interface AxisPreference {
  preferred: AxisPlacement
  fallback?: AxisPlacement
}

export interface PlacementGap {
  x: number
  y: number
}

export interface AnchoredPlacementOptions {
  anchor: PlacementRect
  surface: PlacementSize
  host: PlacementRect
  bands?: Partial<ChromeBands>
  x: AxisPreference
  y: AxisPreference
  gap?: number | Partial<PlacementGap>
  margin?: number
  avoid?: PlacementRect | undefined
}

export interface AnchoredPlacement {
  x: number
  y: number
  flipped: boolean
  avoided?: boolean
}

export const DEFAULT_CHROME_BANDS: Readonly<ChromeBands> = {
  top: 46,
  right: 56,
  bottom: 64,
  left: 0,
}
export const DEFAULT_RESERVATION_GUTTER = 24

interface AxisInput {
  anchorStart: number
  anchorSize: number
  surfaceSize: number
  freeStart: number
  freeEnd: number
  preference: AxisPreference
  gap: number
}

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0
}

function candidate(
  placement: AxisPlacement,
  anchorStart: number,
  anchorSize: number,
  surfaceSize: number,
  gap: number,
): number {
  switch (placement) {
    case 'before':
      return anchorStart - surfaceSize - gap
    case 'start':
      return anchorStart
    case 'center':
      return anchorStart + anchorSize / 2 - surfaceSize / 2
    case 'end':
      return anchorStart + anchorSize - surfaceSize
    case 'after':
      return anchorStart + anchorSize + gap
  }
}

function placeAxis(input: AxisInput): { position: number; flipped: boolean } {
  const freeStart = Math.min(input.freeStart, input.freeEnd)
  const freeEnd = Math.max(input.freeStart, input.freeEnd)
  const maxPosition = freeEnd - input.surfaceSize
  const preferred = candidate(
    input.preference.preferred,
    input.anchorStart,
    input.anchorSize,
    input.surfaceSize,
    input.gap,
  )

  // An oversize surface cannot fit. Pin it to the leading margin instead
  // of letting a negative maximum pull it outside the host.
  if (maxPosition < freeStart) return { position: freeStart, flipped: false }

  const fits = (position: number): boolean => position >= freeStart && position <= maxPosition
  if (fits(preferred)) return { position: preferred, flipped: false }

  if (input.preference.fallback) {
    const fallback = candidate(
      input.preference.fallback,
      input.anchorStart,
      input.anchorSize,
      input.surfaceSize,
      input.gap,
    )
    if (fits(fallback)) return { position: fallback, flipped: true }
    return {
      position: Math.min(Math.max(freeStart, fallback), maxPosition),
      flipped: true,
    }
  }

  return {
    position: Math.min(Math.max(freeStart, preferred), maxPosition),
    flipped: false,
  }
}

function intersects(a: PlacementRect, b: PlacementRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/**
 * Place a measured surface in the host coordinate system. Reserved bands
 * and the outer margin reduce the usable region before either axis flips
 * or clamps. The two axes are independent so mixed placements stay intact.
 */
export function placeAnchored(options: AnchoredPlacementOptions): AnchoredPlacement {
  // Legacy callers supplied small viewport margins. Once they adopt the
  // default reservation frame, its named gutter owns edge clearance; an
  // explicit bands object is the deliberate custom/opt-out seam.
  const margin =
    options.bands === undefined
      ? DEFAULT_RESERVATION_GUTTER
      : finiteNonNegative(options.margin)
  const bands = {
    top: finiteNonNegative(options.bands?.top ?? DEFAULT_CHROME_BANDS.top),
    right: finiteNonNegative(options.bands?.right ?? DEFAULT_CHROME_BANDS.right),
    bottom: finiteNonNegative(options.bands?.bottom ?? DEFAULT_CHROME_BANDS.bottom),
    left: finiteNonNegative(options.bands?.left ?? DEFAULT_CHROME_BANDS.left),
  }
  const gap =
    typeof options.gap === 'number'
      ? { x: finiteNonNegative(options.gap), y: finiteNonNegative(options.gap) }
      : {
          x: finiteNonNegative(options.gap?.x),
          y: finiteNonNegative(options.gap?.y),
        }
  const surface = {
    width: finiteNonNegative(options.surface.width),
    height: finiteNonNegative(options.surface.height),
  }

  const freeLeft = options.host.x + bands.left + margin
  const freeRight = Math.max(
    freeLeft,
    options.host.x + finiteNonNegative(options.host.width) - bands.right - margin,
  )
  const freeTop = options.host.y + bands.top + margin
  const freeBottom = Math.max(
    freeTop,
    options.host.y + finiteNonNegative(options.host.height) - bands.bottom - margin,
  )

  const x = placeAxis({
    anchorStart: options.anchor.x,
    anchorSize: finiteNonNegative(options.anchor.width),
    surfaceSize: surface.width,
    freeStart: freeLeft,
    freeEnd: freeRight,
    preference: options.x,
    gap: gap.x,
  })
  const y = placeAxis({
    anchorStart: options.anchor.y,
    anchorSize: finiteNonNegative(options.anchor.height),
    surfaceSize: surface.height,
    freeStart: freeTop,
    freeEnd: freeBottom,
    preference: options.y,
    gap: gap.y,
  })

  const normal = { x: x.position, y: y.position, flipped: x.flipped || y.flipped }
  if (!options.avoid) return normal

  const avoid = {
    x: options.avoid.x,
    y: options.avoid.y,
    width: finiteNonNegative(options.avoid.width),
    height: finiteNonNegative(options.avoid.height),
  }
  const normalRect = { x: normal.x, y: normal.y, ...surface }
  if (!intersects(normalRect, avoid)) return { ...normal, avoided: true }

  const clampX = (value: number): number =>
    Math.min(Math.max(freeLeft, value), Math.max(freeLeft, freeRight - surface.width))
  const clampY = (value: number): number =>
    Math.min(Math.max(freeTop, value), Math.max(freeTop, freeBottom - surface.height))
  const bySide = {
    above: { x: clampX(normal.x), y: avoid.y - surface.height },
    below: { x: clampX(normal.x), y: avoid.y + avoid.height },
    left: { x: avoid.x - surface.width, y: clampY(normal.y) },
    right: { x: avoid.x + avoid.width, y: clampY(normal.y) },
  }
  const order: Array<keyof typeof bySide> = []
  const add = (side: keyof typeof bySide): void => {
    if (!order.includes(side)) order.push(side)
  }
  if (options.y.preferred === 'after') add('below')
  if (options.y.preferred === 'before') add('above')
  if (options.x.preferred === 'after') add('right')
  if (options.x.preferred === 'before') add('left')
  if (options.y.fallback === 'after') add('below')
  if (options.y.fallback === 'before') add('above')
  if (options.x.fallback === 'after') add('right')
  if (options.x.fallback === 'before') add('left')
  ;(['below', 'above', 'right', 'left'] as const).forEach(add)

  for (const side of order) {
    const at = bySide[side]
    const rect = { ...at, ...surface }
    const inside =
      at.x >= freeLeft &&
      at.y >= freeTop &&
      at.x + surface.width <= freeRight &&
      at.y + surface.height <= freeBottom
    if (inside && !intersects(rect, avoid)) return { ...normal, ...at, avoided: true }
  }
  return { ...normal, avoided: false }
}

export function pointAnchor(x: number, y: number): PlacementRect {
  return { x, y, width: 0, height: 0 }
}
