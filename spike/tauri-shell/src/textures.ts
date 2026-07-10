import { Texture } from 'pixi.js'
import { hashString, mulberry32 } from './prng'

/**
 * COPIED from spike/webkit-renderer/src/textures.ts (AI-IMP-217) so the
 * synthetic board is byte-identical content to the WebKit baseline — a
 * fair cross-shell comparison. The ONE difference in this Tauri variant:
 * `loadSyntheticTexture` is NOT wired into the engine here; instead the
 * canvas is encoded to a PNG on disk and streamed back through Tauri's
 * asset protocol (see assets.ts). `paintCanvas` + `canvasToPngBytes`
 * are exported for that write path. `assetSizeFor`/`loadSyntheticTexture`
 * are kept intact so scene.ts and any fallback path still resolve.
 */

const ASSET_PREFIX = 'ew-asset://'

/** Deterministic native size for a synthetic asset, in [1024, 2048]. */
export function assetSizeFor(hash: string): { width: number; height: number } {
  const rnd = mulberry32(hashString(hash))
  const pick = () => 1024 + Math.floor(rnd() * 1025) // 1024..2048
  return { width: pick(), height: pick() }
}

export function paintCanvas(hash: string): HTMLCanvasElement {
  const { width, height } = assetSizeFor(hash)
  const seed = hashString(hash)
  const rnd = mulberry32(seed)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const h1 = Math.floor(rnd() * 360)
  const h2 = (h1 + 60 + Math.floor(rnd() * 180)) % 360
  const grad = ctx.createLinearGradient(0, 0, width, height)
  grad.addColorStop(0, `hsl(${h1} 65% 55%)`)
  grad.addColorStop(1, `hsl(${h2} 60% 40%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  const cell = 32
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const a = rnd() * 0.14
      ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
      ctx.fillRect(x, y, cell, cell)
    }
  }

  const shapes = 12 + Math.floor(rnd() * 12)
  for (let i = 0; i < shapes; i++) {
    ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)} 70% ${40 + rnd() * 30}%)`
    const r = 20 + rnd() * 90
    ctx.beginPath()
    ctx.arc(rnd() * width, rnd() * height, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, height - 90, 360, 90)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.fillText(hash.replace(ASSET_PREFIX, '').slice(0, 10), 20, height - 30)

  return canvas
}

/** Encode a painted canvas to PNG bytes (the on-disk asset the Tauri
 * asset protocol will later serve). */
export function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob returned null'))
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject)
    }, 'image/png')
  })
}

/** Original 217 in-memory loader — kept as a fallback / reference. Not
 * wired into the engine in the Tauri variant. */
export async function loadSyntheticTexture(url: string): Promise<Texture> {
  const canvas = paintCanvas(url)
  const bitmap = await createImageBitmap(canvas)
  const texture = Texture.from(bitmap)
  texture.source.autoGenerateMipmaps = true
  return texture
}
