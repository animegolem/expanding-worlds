import { Texture } from 'pixi.js'
import type { ImageTreatment } from '@ew/canvas-engine'
import { themeTokenValue } from '../theme'

/**
 * §8.5 placed-image body treatment (AI-IMP-140). The canvas engine reads
 * no CSS, so the host resolves the `--ew-node-radius` / `--ew-node-shadow`
 * tokens here, builds ONE shared 9-slice shadow silhouette texture, and
 * hands the engine an {@link ImageTreatment}. Board presentation only —
 * the treatment is separate display geometry, never baked into the source
 * texture, so exports and crop previews read the untreated original.
 */

/** The parsed pieces of a CSS box-shadow token (offset X/Y, blur, alpha).
 * Only the geometry and the alpha are read; the shadow silhouette is a
 * neutral black wash whose softness comes from the blur. */
export interface ParsedShadow {
  offsetX: number
  offsetY: number
  blur: number
  alpha: number
}

/**
 * Parses a `--ew-node-shadow` value such as "0 8px 22px COLOR" into its
 * numeric parts. The three leading pixel lengths are offset-x, offset-y,
 * and blur radius; the alpha is the 4th component of a parenthesised
 * color function (defaults to 1 when the color carries none).
 */
export function parseNodeShadow(value: string): ParsedShadow {
  // The leading whitespace-separated tokens are lengths (px or a bare 0)
  // until the color begins; parsing stops there so color digits never
  // leak into the geometry.
  const lengths: number[] = []
  for (const token of value.trim().split(/\s+/)) {
    const match = token.match(/^(-?\d*\.?\d+)(px)?$/)
    if (!match) break
    lengths.push(Number.parseFloat(match[1]!))
  }
  const [offsetX = 0, offsetY = 0, blur = 0] = lengths
  let alpha = 1
  const group = value.match(/\(([^)]*)\)/)
  if (group) {
    const parts = group[1]!.split(/[,/]/).map((p) => p.trim())
    if (parts.length >= 4) {
      const parsed = Number.parseFloat(parts[3]!)
      if (Number.isFinite(parsed)) alpha = Math.min(1, Math.max(0, parsed))
    }
  }
  return { offsetX, offsetY, blur, alpha }
}

/** Parses a `--ew-node-radius` length token (e.g. "3px") to a number. */
export function parseNodeRadius(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** How a canvas Gaussian blur's std-dev relates to a CSS box-shadow blur
 * radius (box-shadow blur ≈ 2σ), and how far the soft tail reaches (≈3σ). */
const SIGMA_PER_BLUR = 0.5
const TAIL_SIGMAS = 3
/** Solid center strip the 9-slice stretches (px). */
const CENTER_PX = 2

export interface ShadowGeometry {
  /** Square offscreen canvas edge (px). */
  textureSize: number
  /** 9-slice corner inset (px) = radius + blur tail. */
  inset: number
  /** Rounded-rect radius drawn into the silhouette (px). */
  radius: number
  /** Gaussian std-dev to pass to the canvas blur filter (px). */
  sigma: number
  /** World-unit distance the shadow extends beyond the body per side. */
  spread: number
  /** World-unit vertical offset (positive = downward). */
  offsetY: number
  /** Shadow alpha. */
  alpha: number
}

/**
 * Sizes the shared 9-slice shadow silhouette from the body radius and the
 * parsed shadow. The corner inset must contain the full corner curve plus
 * the blur tail so the stretched edges stay uniform; the shadow spreads
 * that tail distance beyond the body on every side.
 */
export function shadowGeometry(radius: number, shadow: ParsedShadow): ShadowGeometry {
  const sigma = shadow.blur * SIGMA_PER_BLUR
  const tail = Math.ceil(sigma * TAIL_SIGMAS)
  const inset = Math.ceil(radius + tail)
  return {
    textureSize: inset * 2 + CENTER_PX,
    inset,
    radius,
    sigma,
    spread: tail,
    offsetY: shadow.offsetY,
    alpha: shadow.alpha,
  }
}

/**
 * Draws the blurred rounded-rect silhouette onto an offscreen canvas. The
 * rect is inset by the blur tail so the softening has room on every side;
 * the fill is opaque neutral and the token's alpha is applied later at the
 * sprite level.
 */
export function buildShadowCanvas(geo: ShadowGeometry): HTMLCanvasElement {
  const size = geo.textureSize
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const pad = geo.inset - geo.radius
  ctx.filter = `blur(${geo.sigma}px)`
  ctx.fillStyle = 'black'
  ctx.beginPath()
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, geo.radius)
  ctx.fill()
  return canvas
}

/**
 * Resolves the live image treatment from theme tokens, building the shared
 * shadow texture once. Returns null when the tokens are absent or the
 * shadow has no blur (nothing to draw), leaving images untreated.
 */
export function buildImageTreatment(): ImageTreatment | null {
  let radius: number
  let shadow: ParsedShadow
  try {
    radius = parseNodeRadius(themeTokenValue('--ew-node-radius'))
    shadow = parseNodeShadow(themeTokenValue('--ew-node-shadow'))
  } catch {
    return null
  }
  if (shadow.blur <= 0 || shadow.alpha <= 0) {
    return { radius, shadow: null }
  }
  const geo = shadowGeometry(radius, shadow)
  const texture = Texture.from(buildShadowCanvas(geo))
  return {
    radius,
    shadow: {
      texture,
      inset: geo.inset,
      spread: geo.spread,
      offsetY: geo.offsetY,
      alpha: geo.alpha,
    },
  }
}
