import { Texture } from 'pixi.js'
import { hashString, mulberry32 } from './prng'

/**
 * Locally-generated textures (NO network — the house rule). The engine's
 * placement renderer asks the host to load `ew-asset://<hash>`; we parse
 * the hash, derive a deterministic size (1024–2048px) and palette from
 * it, and paint a gradient + value-noise canvas. Realistic on two axes
 * that matter for GPU cost: upload size and mip generation (the host
 * turns autoGenerateMipmaps on, so we do too).
 *
 * A gradient alone compresses trivially in the sampler; the noise wash
 * and scattered blocks keep the texture visually busy so downscaled
 * minification (what a zoomed-out board does all day) is exercised.
 */

const ASSET_PREFIX = 'ew-asset://'

/** Deterministic native size for a synthetic asset, in [1024, 2048]. */
export function assetSizeFor(hash: string): { width: number; height: number } {
  const rnd = mulberry32(hashString(hash))
  const pick = () => 1024 + Math.floor(rnd() * 1025) // 1024..2048
  return { width: pick(), height: pick() }
}

function paintCanvas(hash: string): HTMLCanvasElement {
  const { width, height } = assetSizeFor(hash)
  const seed = hashString(hash)
  const rnd = mulberry32(seed)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Base diagonal gradient between two seeded hues.
  const h1 = Math.floor(rnd() * 360)
  const h2 = (h1 + 60 + Math.floor(rnd() * 180)) % 360
  const grad = ctx.createLinearGradient(0, 0, width, height)
  grad.addColorStop(0, `hsl(${h1} 65% 55%)`)
  grad.addColorStop(1, `hsl(${h2} 60% 40%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  // Value-noise wash: coarse random blocks, cheap but defeats trivial
  // texture compression and gives the mip chain real high-frequency data.
  const cell = 32
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const a = rnd() * 0.14
      ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
      ctx.fillRect(x, y, cell, cell)
    }
  }

  // A few scattered accent shapes so downscaled tiles are not flat.
  const shapes = 12 + Math.floor(rnd() * 12)
  for (let i = 0; i < shapes; i++) {
    ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)} 70% ${40 + rnd() * 30}%)`
    const r = 20 + rnd() * 90
    ctx.beginPath()
    ctx.arc(rnd() * width, rnd() * height, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Corner label so each image is visually distinguishable during a run.
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, height - 90, 360, 90)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.fillText(hash.replace(ASSET_PREFIX, '').slice(0, 10), 20, height - 30)

  return canvas
}

/** Host texture loader handed to the engine's RendererResources /
 * TextureBudget. Matches host.ts: decode off the canvas, mipmaps on. */
export async function loadSyntheticTexture(url: string): Promise<Texture> {
  const canvas = paintCanvas(url)
  // Route through createImageBitmap like the real host does, so the
  // upload path (ImageBitmap → GPU) is the same one WebKit will run.
  const bitmap = await createImageBitmap(canvas)
  const texture = Texture.from(bitmap)
  texture.source.autoGenerateMipmaps = true
  return texture
}
