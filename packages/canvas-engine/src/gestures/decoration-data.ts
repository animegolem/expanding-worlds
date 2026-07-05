/**
 * Decoration geometry lives inside the opaque `data` JSON (§4.9), so
 * gesture drivers rewrite coordinates in place of a schema. The three
 * coordinate forms the engine understands today mirror hit-testing
 * (`decorationAABB`): a point/rect `{x, y[, width, height]}`, a
 * segment `{x1, y1, x2, y2}`, and a polyline `{points: [[x, y]…]}`.
 * Unknown keys pass through untouched; a form is only rewritten when
 * its coordinates are finite numbers.
 */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Applies `map` to every recognised coordinate pair in `data`. */
export function mapDecorationPoints(
  data: Record<string, unknown>,
  map: (x: number, y: number) => { x: number; y: number },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data }
  if (isNum(next['x']) && isNum(next['y'])) {
    const p = map(next['x'], next['y'])
    next['x'] = p.x
    next['y'] = p.y
  }
  if (isNum(next['x1']) && isNum(next['y1']) && isNum(next['x2']) && isNum(next['y2'])) {
    const p1 = map(next['x1'], next['y1'])
    const p2 = map(next['x2'], next['y2'])
    next['x1'] = p1.x
    next['y1'] = p1.y
    next['x2'] = p2.x
    next['y2'] = p2.y
  }
  if (Array.isArray(next['points'])) {
    next['points'] = (next['points'] as Array<[number, number]>).map((point) => {
      if (!Array.isArray(point) || !isNum(point[0]) || !isNum(point[1])) return point
      const p = map(point[0], point[1])
      return [p.x, p.y] as [number, number]
    })
  }
  return next
}

export function translateDecorationData(
  data: Record<string, unknown>,
  dx: number,
  dy: number,
): Record<string, unknown> {
  return mapDecorationPoints(data, (x, y) => ({ x: x + dx, y: y + dy }))
}

/**
 * Scales positions about (ax, ay) and, for the rect form, the
 * width/height extents by the same factors.
 */
export function scaleDecorationData(
  data: Record<string, unknown>,
  anchor: { x: number; y: number },
  sx: number,
  sy: number,
): Record<string, unknown> {
  const next = mapDecorationPoints(data, (x, y) => ({
    x: anchor.x + (x - anchor.x) * sx,
    y: anchor.y + (y - anchor.y) * sy,
  }))
  if (isNum(next['width'])) next['width'] = next['width'] * sx
  if (isNum(next['height'])) next['height'] = next['height'] * sy
  return next
}

/**
 * Rotates a shape (rect form with a `rotation` field) as a rigid
 * body: its CENTER orbits the pivot and the delta accumulates onto
 * its own rotation, so a sole-selected shape spins in place
 * (AI-IMP-031 — mapping the stored top-left instead made shapes
 * orbit without spinning). Extents are untouched.
 */
export function rotateShapeData(
  data: Record<string, unknown>,
  center: { x: number; y: number },
  angle: number,
): Record<string, unknown> {
  if (!isNum(data['x']) || !isNum(data['y']) || !isNum(data['width']) || !isNum(data['height'])) {
    return rotateDecorationData(data, center, angle)
  }
  const cx = data['x'] + data['width'] / 2
  const cy = data['y'] + data['height'] / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = cx - center.x
  const dy = cy - center.y
  const ncx = center.x + dx * cos - dy * sin
  const ncy = center.y + dx * sin + dy * cos
  const prior = isNum(data['rotation']) ? data['rotation'] : 0
  return {
    ...data,
    x: ncx - data['width'] / 2,
    y: ncy - data['height'] / 2,
    rotation: prior + angle,
  }
}

/** Rotates every coordinate pair about (cx, cy); extents untouched. */
export function rotateDecorationData(
  data: Record<string, unknown>,
  center: { x: number; y: number },
  angle: number,
): Record<string, unknown> {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return mapDecorationPoints(data, (x, y) => {
    const dx = x - center.x
    const dy = y - center.y
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
  })
}
