import type { Rect } from './camera'

/**
 * Content-defined stage (§6.7 rev 0.50, PureRef-inspired). On a board
 * with no background image the lit stage extent derives from content:
 * the bounding box of all placement + decoration world rects plus a
 * padding margin. Beyond it the renderer paints a darker void with a
 * dimmed grid. Within a session the extent is a RATCHET — it grows as
 * items push past an edge (eased, not snapped) and never retreats, so
 * rearranging inward cannot visibly shrink the world. On board open it
 * recomputes snug (host resets the ratchet), which keeps the rule
 * fully derivable from live state: no persisted extent, no migration.
 *
 * Pure and renderer-agnostic. The host owns the per-frame state (the
 * ratcheted target and the eased displayed rect); this module owns the
 * math: bounds, grow-only union, eased approach, and the void tone
 * derived from the effective background color (color-mix equivalent —
 * never a second raw color).
 *
 * Visual magnitudes here are placeholders behind exported constants;
 * Design-letter-3 item 15 restyles.
 */

/** Padding (world units) added around the content bbox to form the
 * lit stage extent. Placeholder. */
export const STAGE_CONTENT_PADDING = 320

/** Fraction the void tone is mixed toward black from the effective
 * background color, IN OKLAB (0 = identical to the lit stage, 1 =
 * black). The void is a DERIVED tone, not a second raw color. Ratified
 * at ~22% toward black in oklab (design pass, RFC rev 0.55 §6.7) — a
 * gentle, perceptually-even step down from the lit stage rather than
 * the old blunt 0.55 sRGB fade toward black. */
export const STAGE_VOID_MIX = 0.22

/** Opacity of the void-tone veil painted over grid lines beyond the
 * extent — this is what "dims the grid in the void" (§6.7). The grid
 * itself renders at full strength across both regions; the veil pulls
 * the void portion toward the void tone. Placeholder. */
export const STAGE_VOID_VEIL_ALPHA = 0.55

/** Time constant (ms) of the eased approach of the displayed extent
 * toward its ratcheted target: the stage GLIDES rather than snaps as
 * an edge grows (and as the first placement blooms). Placeholder. */
export const STAGE_EASE_TAU_MS = 120

/** World-unit threshold below which every eased edge snaps to target,
 * ending the animation (kills perpetual sub-pixel redraws). */
export const STAGE_EASE_EPSILON = 0.5

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Bounding box of the given world rects, expanded by `padding` on
 * every side. Null when there are no rects (empty board → all void).
 */
export function computeContentBounds(
  rects: readonly Rect[],
  padding: number,
): Rect | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rc of rects) {
    if (rc.x < left) left = rc.x
    if (rc.y < top) top = rc.y
    if (rc.x + rc.width > right) right = rc.x + rc.width
    if (rc.y + rc.height > bottom) bottom = rc.y + rc.height
  }
  if (left > right || top > bottom) return null
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + 2 * padding,
    height: bottom - top + 2 * padding,
  }
}

/**
 * Grow-only union: the ratchet. Returns a rect that contains both
 * `prev` and `next` and is never smaller than `prev` — so moving an
 * item inward (a smaller `next`) leaves the extent unchanged. A null
 * side is absorbed (bootstrap / mid-session all-items-deleted keeps
 * the last extent; board open re-snugs by resetting `prev` to null).
 */
export function ratchetExtent(prev: Rect | null, next: Rect | null): Rect | null {
  if (!prev) return next ? { ...next } : null
  if (!next) return { ...prev }
  const left = Math.min(prev.x, next.x)
  const top = Math.min(prev.y, next.y)
  const right = Math.max(prev.x + prev.width, next.x + next.width)
  const bottom = Math.max(prev.y + prev.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * One eased step of the displayed extent toward `target` over `dtMs`.
 * When `current` is null the stage BLOOMS out of the target's center
 * (a zero-size rect grows to the target) — the first-placement feel.
 * Snaps to `target` once every edge is within STAGE_EASE_EPSILON, so
 * the animation terminates. `target` null → null (empty board).
 */
export function approachExtent(
  current: Rect | null,
  target: Rect | null,
  dtMs: number,
  tauMs: number = STAGE_EASE_TAU_MS,
): Rect | null {
  if (!target) return null
  const start: Rect = current ?? {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    width: 0,
    height: 0,
  }
  const k = tauMs <= 0 ? 1 : clamp01(1 - Math.exp(-Math.max(0, dtMs) / tauMs))
  const left = lerp(start.x, target.x, k)
  const top = lerp(start.y, target.y, k)
  const right = lerp(start.x + start.width, target.x + target.width, k)
  const bottom = lerp(start.y + start.height, target.y + target.height, k)
  const tRight = target.x + target.width
  const tBottom = target.y + target.height
  if (
    Math.abs(left - target.x) < STAGE_EASE_EPSILON &&
    Math.abs(top - target.y) < STAGE_EASE_EPSILON &&
    Math.abs(right - tRight) < STAGE_EASE_EPSILON &&
    Math.abs(bottom - tBottom) < STAGE_EASE_EPSILON
  ) {
    return { ...target }
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Exact-equality of two nullable rects (host redraw gate). */
export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Rectangle subtraction: `outer` minus `hole`, as up to four bands
 * (top, bottom, left, right) covering exactly the part of `outer`
 * outside `hole`. Empty when `hole` covers `outer`; `[outer]` when
 * they do not overlap. Used to paint the void veil around the lit
 * extent without masking. */
export function subtractRect(outer: Rect, hole: Rect | null): Rect[] {
  if (!hole) return [outer]
  const oL = outer.x
  const oT = outer.y
  const oR = outer.x + outer.width
  const oB = outer.y + outer.height
  const hL = Math.max(oL, hole.x)
  const hT = Math.max(oT, hole.y)
  const hR = Math.min(oR, hole.x + hole.width)
  const hB = Math.min(oB, hole.y + hole.height)
  if (hL >= hR || hT >= hB) return [outer] // no overlap
  const bands: Rect[] = []
  if (hT > oT) bands.push({ x: oL, y: oT, width: oR - oL, height: hT - oT })
  if (hB < oB) bands.push({ x: oL, y: hB, width: oR - oL, height: oB - hB })
  if (hL > oL) bands.push({ x: oL, y: hT, width: hL - oL, height: hB - hT })
  if (hR < oR) bands.push({ x: hR, y: hT, width: oR - hR, height: hB - hT })
  return bands
}

/** Parses a CSS color string (`#rgb`, `#rrggbb[aa]`, `rgb()/rgba()`)
 * to 8-bit channels. Null on anything unrecognized. */
export function parseCssRgb(color: string): { r: number; g: number; b: number } | null {
  const s = color.trim()
  if (s.startsWith('#')) {
    let hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length >= 6) {
      const n = Number.parseInt(hex.slice(0, 6), 16)
      if (!Number.isNaN(n)) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
    return null
  }
  const open = s.indexOf('(')
  const close = s.indexOf(')')
  if (s.slice(0, 3).toLowerCase() === 'rgb' && open > 0 && close > open) {
    const parts = s
      .slice(open + 1, close)
      .split(/[\s,/]+/)
      .filter((p) => p.length > 0)
      .map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]! }
    }
  }
  return null
}

// ── OKLab (Björn Ottosson) ──────────────────────────────────────────
// The void tone is a perceptual step toward black, mirroring the CSS
// `color-mix(in oklab, [board] (1-mix)*100%, black)` the design kit uses
// for --ew-void-surface. This is TRUE oklab (not an approximation), so
// the engine tone and any CSS surface derive the void identically (ΔE 0
// against a CSS oklab mix, modulo 8-bit rounding). Mixing toward black,
// whose oklab is (0,0,0), reduces to scaling (L,a,b) by (1-mix).

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055

/** Linear sRGB (0–1) → OKLab (L, a, b). */
export function linearRgbToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

/** OKLab (L, a, b) → linear sRGB (0–1, unclamped). */
export function oklabToLinearRgb(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/**
 * The void tone derived from the effective background color by mixing
 * it toward black by `mix` IN OKLAB. Returns a packed 0xRRGGBB number
 * for the renderer. Never introduces a second raw color — the tone
 * always follows the chosen background, so both light and dark boards
 * get a readable void for free. Unparseable input falls back to black
 * (the darkest possible void).
 */
export function voidTone(fill: string, mix: number = STAGE_VOID_MIX): number {
  const rgb = parseCssRgb(fill) ?? { r: 0, g: 0, b: 0 }
  const [L, a, b] = linearRgbToOklab(
    srgbToLinear(rgb.r / 255),
    srgbToLinear(rgb.g / 255),
    srgbToLinear(rgb.b / 255),
  )
  const f = 1 - clamp01(mix)
  const lin = oklabToLinearRgb(L * f, a * f, b * f)
  const to8 = (c: number): number =>
    Math.min(255, Math.max(0, Math.round(linearToSrgb(clamp01(c)) * 255)))
  return (to8(lin[0]) << 16) | (to8(lin[1]) << 8) | to8(lin[2])
}

/**
 * Whether the void (the darker beyond-content veil and its dimmed grid)
 * renders for the given effective theme. It renders on every theme
 * EXCEPT glass: there the window is translucent and the desktop is the
 * stage (§6.7), so painting a dark void over it would defeat the glass.
 * The host reads the active theme (documentElement `data-theme`) and
 * gates the veil + dimmed grid on this.
 */
export function voidEnabledForTheme(theme: string): boolean {
  return theme !== 'glass'
}
