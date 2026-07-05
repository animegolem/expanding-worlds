import type { Graphics } from 'pixi.js'
import type { Rect } from './camera'
import type { SceneBackground, SceneCamera } from './types'

/**
 * Adaptive multi-scale grid and stage extent (§6.7/§6.9 rev 0.11,
 * AI-IMP-032). Backgroundless canvases draw the two subdivision
 * levels legible at the current zoom — the finer level fades in as
 * zoom crosses each power-of-two threshold, so the grid subdivides
 * indefinitely in both directions. When a background image defines a
 * stage, the grid hides entirely and the host renders a distinct
 * void beyond the extent. Presentation only.
 */

/** Canonical stage width in world units: Set-as-Background from a
 * file normalizes the extent to this so default pin/text/stroke
 * sizes read proportionate on any map (§6.7). */
export const STAGE_WIDTH = 2048

/** Grid spacing at zoom 1, world units (subdivides/multiplies by 2). */
export const GRID_BASE_SPACING = 64
/** Coarse-level line spacing stays within this screen-pixel band. */
const MIN_SCREEN_SPACING = 48
export const GRID_COLOR = 0x2e333b
export const GRID_MAX_ALPHA = 0.5

export interface GridLevel {
  /** World-unit spacing between lines. */
  spacing: number
  alpha: number
}

/**
 * The coarse level keeps screen spacing in [MIN, 2·MIN); the fine
 * level is its half-step, fading in as it widens toward legibility.
 */
export function gridLevels(zoom: number): [GridLevel, GridLevel] {
  const exponent = Math.ceil(Math.log2(MIN_SCREEN_SPACING / (GRID_BASE_SPACING * zoom)))
  const coarse = GRID_BASE_SPACING * 2 ** exponent
  const fine = coarse / 2
  const fineScreen = fine * zoom
  // 0 as the fine level reaches MIN/2 px, full as it reaches MIN px.
  const fade = Math.min(1, Math.max(0, (fineScreen - MIN_SCREEN_SPACING / 2) / (MIN_SCREEN_SPACING / 2)))
  return [
    { spacing: coarse, alpha: GRID_MAX_ALPHA },
    { spacing: fine, alpha: GRID_MAX_ALPHA * fade },
  ]
}

/** World-space line coordinates covering the visible rect for one
 * level. Pure — unit-testable without a renderer. */
export function gridLinePositions(
  view: SceneCamera,
  viewport: { width: number; height: number },
  spacing: number,
): { vertical: number[]; horizontal: number[] } {
  const left = view.x
  const top = view.y
  const right = view.x + viewport.width / view.zoom
  const bottom = view.y + viewport.height / view.zoom
  const vertical: number[] = []
  const horizontal: number[] = []
  for (let x = Math.floor(left / spacing) * spacing; x <= right; x += spacing) vertical.push(x)
  for (let y = Math.floor(top / spacing) * spacing; y <= bottom; y += spacing) horizontal.push(y)
  return { vertical, horizontal }
}

/** Draws both grid levels into a world-plane Graphics (1px
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
  for (const level of gridLevels(view.zoom)) {
    if (level.alpha <= 0.01) continue
    const { vertical, horizontal } = gridLinePositions(view, viewport, level.spacing)
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
