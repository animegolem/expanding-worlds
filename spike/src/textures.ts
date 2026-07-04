import { hashString, mulberry32, int, pick } from './prng'

/**
 * Deterministic texture sources. Adapters convert these canvases into
 * their own texture types and own eviction of whatever they create.
 * Canvases are generated on demand and memoized here; the memo can be
 * dropped between scenarios via clearTextureCache().
 */

const cache = new Map<string, HTMLCanvasElement>()

const PALETTES = [
  ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'],
  ['#003049', '#d62828', '#f77f00', '#fcbf49', '#eae2b7'],
  ['#8ecae6', '#219ebc', '#023047', '#ffb703', '#fb8500'],
] as const

function draw(id: string, w: number, h: number): HTMLCanvasElement {
  const rng = mulberry32(hashString(id))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const palette = pick(rng, PALETTES)
  ctx.fillStyle = palette[0] ?? '#333'
  ctx.fillRect(0, 0, w, h)
  const shapes = int(rng, 12, 28)
  for (let i = 0; i < shapes; i++) {
    ctx.fillStyle = pick(rng, palette)
    ctx.globalAlpha = 0.4 + rng() * 0.6
    const x = rng() * w
    const y = rng() * h
    const r = (0.05 + rng() * 0.25) * Math.min(w, h)
    if (rng() < 0.5) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.font = `${Math.max(14, w / 16)}px monospace`
  ctx.fillText(id, 8, Math.max(18, h / 12))
  return canvas
}

/** Image-appearance texture; size derived deterministically from id. */
export function textureCanvas(id: string): HTMLCanvasElement {
  const hit = cache.get(id)
  if (hit) return hit
  const rng = mulberry32(hashString(`size:${id}`))
  const w = pick(rng, [512, 768, 1024, 1536, 2048] as const)
  const h = Math.round(w * (0.6 + rng() * 0.8))
  const canvas = draw(id, w, h)
  cache.set(id, canvas)
  return canvas
}

/** Map tile texture for the oversized-background pyramid. */
export function tileCanvas(level: number, col: number, row: number, size: number): HTMLCanvasElement {
  const id = `tile:${level}:${col}:${row}`
  const hit = cache.get(id)
  if (hit) return hit
  const canvas = draw(id, size, size)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1)
  }
  cache.set(id, canvas)
  return canvas
}

export function clearTextureCache(): void {
  cache.clear()
}
