import type { ScenePlacement } from './types'

/** S3 pin-tool kit specimen: the provisional mark is 26 CSS px tall.
 * AI-IMP-310 turns that mark into a circle, so height becomes diameter. */
export const PIN_DEFAULT_DIAMETER_PX = 26

/** Feel bounds from the ruled ghost's proportions: half-size through 4x.
 * These are screen-space resize limits, intentionally owner-tunable. */
export const PIN_MIN_DIAMETER_PX = 13
export const PIN_MAX_DIAMETER_PX = 104

/** Legacy unsized dots render as a 24-world-unit circle. */
export const PIN_FALLBACK_DIAMETER_WORLD = 24

function safeZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

/** Materialization converts the screen-space ghost into replayable world units. */
export function pinWorldDiameterAtZoom(zoom: number): number {
  return PIN_DEFAULT_DIAMETER_PX / safeZoom(zoom)
}

/** ONE raw diameter for dot render geometry. Width wins only to heal legacy
 * width/height disagreement deterministically; new writes persist both equal. */
export function pinDiameterWorld(item: ScenePlacement): number {
  const candidate = item.width ?? item.height
  return candidate !== null && candidate !== undefined && candidate > 0
    ? candidate
    : PIN_FALLBACK_DIAMETER_WORLD
}

/** The diameter after the placement's durable scalar transform. */
export function pinEffectiveDiameterWorld(item: ScenePlacement): number {
  return pinDiameterWorld(item) * (Math.abs(item.scale) || 1)
}

/** Clamp a proposed uniform resize factor against the rendered-pixel feel
 * bounds. Commands remain camera-agnostic; only the live gesture uses zoom. */
export function clampPinResizeFactor(
  items: readonly ScenePlacement[],
  factor: number,
  zoom: number,
): number {
  if (items.length === 0) return factor
  const z = safeZoom(zoom)
  let lower = 0
  let upper = Number.POSITIVE_INFINITY
  for (const item of items) {
    const rendered = pinEffectiveDiameterWorld(item) * z
    lower = Math.max(lower, PIN_MIN_DIAMETER_PX / rendered)
    upper = Math.min(upper, PIN_MAX_DIAMETER_PX / rendered)
  }
  // A mixed selection can contain pre-existing dots whose diameter ratio
  // already exceeds the 8× feel range, so no single uniform factor can put
  // every member inside both bounds. Preserve the minimum-legibility law in
  // that impossible case; the largest member may remain above the feel max.
  if (lower > upper) return lower
  return Math.max(lower, Math.min(factor, upper))
}
