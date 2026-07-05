/**
 * Render-only minimum stroke width (AI-IMP-040): a stroke whose
 * world width maps below one device pixel rasterizes as broken
 * fragments along diagonals — antialiasing cannot express a 0.2px
 * line. Presentation clamps to exactly 1 screen pixel instead
 * ("the least hacky sub-pixel hinting" — owner); stored data is
 * never touched, and true width returns as soon as zoom covers it.
 */

export const MIN_STROKE_SCREEN_PX = 1

/** World-unit width to RENDER at, for a stored world width at zoom. */
export function renderStrokeWidth(worldWidth: number, zoom: number): number {
  const safeZoom = Math.max(zoom, 1e-6)
  return Math.max(worldWidth, MIN_STROKE_SCREEN_PX / safeZoom)
}
