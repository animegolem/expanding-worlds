import type { Graphics } from 'pixi.js'
import type { Rect } from './camera'
import type { SceneBackground, SceneCamera } from './types'

/**
 * Adaptive multi-scale grid and stage extent (§6.7/§6.9 rev 0.11,
 * AI-IMP-032; two-tier crossfade AI-IMP-099). Backgroundless
 * canvases draw two subdivision tiers, PureRef-style: a MAJOR tier
 * carrying the grid's full weight and a MINOR tier (major ÷
 * GRID_SUBDIVISION) that fades in as zoom grows, always markedly
 * fainter than the major — capped at GRID_MINOR_MAX of the full
 * opacity. Tier promotion is seamless by construction: the combined
 * per-line opacity is a continuous function of zoom (see the
 * handoff invariants on the ramp constants below). When a
 * background image defines a stage, the grid hides entirely and the
 * host renders a distinct void beyond the extent. Presentation only.
 */

/** Canonical stage width in world units: Set-as-Background from a
 * file normalizes the extent to this so default pin/text/stroke
 * sizes read proportionate on any map (§6.7). */
export const STAGE_WIDTH = 2048

/** Grid spacing at zoom 1, world units. Tier spacings are this
 * times integer powers of GRID_SUBDIVISION. */
export const GRID_BASE_SPACING = 64
export const GRID_COLOR = 0x2e333b
/** The grid's full opacity — the major tier's plateau. */
export const GRID_MAX_ALPHA = 0.5

/** Cells per major cell side (the minor tier subdivides by this).
 * 4 matches the PureRef look and keeps spacings binary-round
 * against the base-64 spacing (…16, 64, 256, 1024…). */
export const GRID_SUBDIVISION = 4

/** Major-tier on-screen cell size band: [MIN, SUBDIVISION·MIN) px.
 * The tier whose cell lands in this band is the major. */
export const GRID_MAJOR_MIN_PX = 48

/** Minor-tier opacity cap as a fraction of GRID_MAX_ALPHA — the
 * owner's key observation: the incoming grid is ALWAYS
 * significantly fainter than the primary. */
export const GRID_MINOR_MAX = 0.4

/** Minor lines are invisible below this on-screen cell size, then
 * ramp linearly up to the cap at promotion (GRID_MAJOR_MIN_PX).
 * MUST be ≥ GRID_MAJOR_MIN_PX / GRID_SUBDIVISION (= 12) so a
 * freshly demoted-to-nothing tier enters at exactly zero opacity —
 * one of the two continuity conditions of the crossfade. */
export const GRID_MINOR_FADE_START_PX = 16

/** The major tier reaches full opacity by this cell size (ramping
 * up from the handoff value GRID_MINOR_MAX·GRID_MAX_ALPHA at
 * GRID_MAJOR_MIN_PX, where the promoted minor left off). */
export const GRID_MAJOR_FULL_PX = 72

/** Past this cell size the major eases back down toward the
 * handoff value, reaching it exactly at SUBDIVISION·MIN (= 192px),
 * where its lines are absorbed into the next major as plain
 * members. Continuity across a promotion REQUIRES the opacity at
 * the top of the major band to equal the opacity at the bottom
 * (old-major lines re-render as new-major lines); this ease is
 * that requirement, not a stylistic choice. */
export const GRID_MAJOR_EASE_PX = 160

/** Handoff opacity: where the minor ramp ends and the major ramp
 * begins (and ends). */
const HANDOFF_ALPHA = GRID_MAX_ALPHA * GRID_MINOR_MAX

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Minor-tier opacity from its on-screen cell size: 0 below the
 * fade start, linear up to the cap at the promotion threshold. */
export function minorAlpha(cellPx: number): number {
  const t = clamp01(
    (cellPx - GRID_MINOR_FADE_START_PX) / (GRID_MAJOR_MIN_PX - GRID_MINOR_FADE_START_PX),
  )
  return HANDOFF_ALPHA * t
}

/** Major-tier opacity from its on-screen cell size: starts at the
 * handoff value (exactly where the promoted minor landed), ramps
 * to full, plateaus, and eases back to the handoff value at the
 * top of the band (where its lines join the next major). */
export function majorAlpha(cellPx: number): number {
  if (cellPx < GRID_MAJOR_FULL_PX) {
    const t = clamp01((cellPx - GRID_MAJOR_MIN_PX) / (GRID_MAJOR_FULL_PX - GRID_MAJOR_MIN_PX))
    return lerp(HANDOFF_ALPHA, GRID_MAX_ALPHA, t)
  }
  if (cellPx <= GRID_MAJOR_EASE_PX) return GRID_MAX_ALPHA
  const top = GRID_SUBDIVISION * GRID_MAJOR_MIN_PX
  const t = clamp01((cellPx - GRID_MAJOR_EASE_PX) / (top - GRID_MAJOR_EASE_PX))
  return lerp(GRID_MAX_ALPHA, HANDOFF_ALPHA, t)
}

export interface GridLevel {
  /** World-unit spacing between lines. */
  spacing: number
  alpha: number
}

/**
 * The two tiers at a zoom. Major = the power-of-GRID_SUBDIVISION
 * spacing whose on-screen cell lands in [GRID_MAJOR_MIN_PX,
 * GRID_SUBDIVISION·GRID_MAJOR_MIN_PX); minor = major ÷
 * GRID_SUBDIVISION, fading in beneath it. Minor line positions
 * coincident with major lines MUST NOT be double-drawn (drawGrid
 * excludes them) — overdraw blending would break the crossfade's
 * continuity at promotion.
 */
export function gridLevels(zoom: number): [GridLevel, GridLevel] {
  const exponent = Math.ceil(
    Math.log(GRID_MAJOR_MIN_PX / (GRID_BASE_SPACING * zoom)) / Math.log(GRID_SUBDIVISION),
  )
  const major = GRID_BASE_SPACING * GRID_SUBDIVISION ** exponent
  const minor = major / GRID_SUBDIVISION
  return [
    { spacing: major, alpha: majorAlpha(major * zoom) },
    { spacing: minor, alpha: minorAlpha(minor * zoom) },
  ]
}

/** World-space line coordinates covering the visible rect for one
 * level. Pure — unit-testable without a renderer. `skipEvery`
 * omits every n-th line (positions whose index along the level is
 * a multiple of n): the minor tier passes GRID_SUBDIVISION so
 * lines shared with the major are drawn once, by the major. */
export function gridLinePositions(
  view: SceneCamera,
  viewport: { width: number; height: number },
  spacing: number,
  skipEvery?: number,
): { vertical: number[]; horizontal: number[] } {
  const left = view.x
  const top = view.y
  const right = view.x + viewport.width / view.zoom
  const bottom = view.y + viewport.height / view.zoom
  const keep = (pos: number): boolean =>
    skipEvery == null || Math.round(pos / spacing) % skipEvery !== 0
  const vertical: number[] = []
  const horizontal: number[] = []
  for (let x = Math.floor(left / spacing) * spacing; x <= right; x += spacing)
    if (keep(x)) vertical.push(x)
  for (let y = Math.floor(top / spacing) * spacing; y <= bottom; y += spacing)
    if (keep(y)) horizontal.push(y)
  return { vertical, horizontal }
}

/** Draws both grid tiers into a world-plane Graphics (1px
 * screen-equivalent lines). Clears first; call with no camera to
 * erase. */
export function drawGrid(
  gfx: Graphics,
  view: SceneCamera,
  viewport: { width: number; height: number },
): void {
  gfx.clear()
  if (viewport.width <= 0 || viewport.height <= 0) return
  const left = view.x
  const top = view.y
  const right = view.x + viewport.width / view.zoom
  const bottom = view.y + viewport.height / view.zoom
  const [major, minor] = gridLevels(view.zoom)
  const tiers: Array<{ level: GridLevel; skipEvery?: number }> = [
    { level: major },
    { level: minor, skipEvery: GRID_SUBDIVISION },
  ]
  for (const { level, skipEvery } of tiers) {
    if (level.alpha <= 0.01) continue
    const { vertical, horizontal } = gridLinePositions(view, viewport, level.spacing, skipEvery)
    for (const x of vertical) gfx.moveTo(x, top).lineTo(x, bottom)
    for (const y of horizontal) gfx.moveTo(left, y).lineTo(right, y)
    gfx.stroke({ width: 1 / view.zoom, color: GRID_COLOR, alpha: level.alpha })
  }
}

/** Stage extent in world units, from the background's native pixel
 * dimensions and stored transform. Null without an image (or before
 * dims are known). */
export function stageExtent(background: SceneBackground | null): Rect | null {
  if (!background?.assetContentHash) return null
  if (background.assetWidth == null || background.assetHeight == null) return null
  const s = (background.settings ?? {}) as { x?: number; y?: number; scale?: number }
  const scale = typeof s.scale === 'number' && s.scale > 0 ? s.scale : 1
  return {
    x: typeof s.x === 'number' ? s.x : 0,
    y: typeof s.y === 'number' ? s.y : 0,
    width: background.assetWidth * scale,
    height: background.assetHeight * scale,
  }
}
