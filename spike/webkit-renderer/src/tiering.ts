import { Graphics, Texture, type Container } from 'pixi.js'
import { itemWorldAABB, RESIDENCY_PADDING, type Camera, type Rect, type SceneItem } from '@ew/canvas-engine'
import { renderAssetCanvas } from './textures'

/**
 * AI-IMP-241 runtime texture-tier ladder (ADDITIVE to the 217 harness).
 *
 * The 217 baseline showed 500 images ⇒ ~4.7 GB RESIDENT texture memory:
 * `TextureBudget` keeps every near-viewport texture at its full 1024–
 * 2048px native size regardless of how many screen pixels it actually
 * covers. This module is a drop-in replacement for that budget's
 * acquire/release surface that instead keeps each resident texture at a
 * CAPPED resolution chosen from its rendered-px contribution each cull
 * pass (full / 1024 / 512 / 256), downscaling with
 * `createImageBitmap(resizeQuality:'high')`, and — under a named byte
 * budget — forcing the least-contributing textures down the ladder
 * (LRU-by-contribution eviction of the higher tiers). Zooming in
 * re-acquires the full-res tier on demand; every swap is instrumented
 * (count + worst visible-lowres duration).
 *
 * It is a SPIKE convict/acquit tool, not engine code: the tier decision
 * and body redraw live out here in the harness precisely so the report
 * can name what `TextureBudget`/`Culler` in packages/canvas-engine would
 * need to grow to land it. Nothing in packages/ is touched.
 */

/** The tier ladder, in ascending capped max-edge (device) pixels. FULL
 * (native, uncapped) sits above the top rung. */
export const TIER_CAPS = [256, 512, 1024] as const
export const FULL_CAP = Infinity
export type TierCap = number // one of TIER_CAPS or FULL_CAP

/** Human label for a cap, for the tier histogram. */
export function tierLabel(cap: TierCap): string {
  return cap === FULL_CAP ? 'full' : String(cap)
}

/** Smallest ladder cap ≥ the rendered device-px size (crisp
 * minification), else FULL when the item renders larger than the top
 * rung. Mirrors the engine's own icon-LOD "smallest tier ≥ rendered". */
export function idealCapForRendered(renderedPx: number): TierCap {
  for (const cap of TIER_CAPS) if (cap >= renderedPx) return cap
  return FULL_CAP
}

/** GPU bytes a native w×h asset occupies when capped to `cap` (max
 * edge), at 4 bytes/texel. The cap only ever shrinks: a 1024-native
 * image's "1024" and "full" tiers coincide. */
export function tierBytes(nativeW: number, nativeH: number, cap: TierCap): number {
  const nativeMaxEdge = Math.max(nativeW, nativeH)
  const scale = cap === FULL_CAP || cap >= nativeMaxEdge ? 1 : cap / nativeMaxEdge
  const w = Math.max(1, Math.round(nativeW * scale))
  const h = Math.max(1, Math.round(nativeH * scale))
  return w * h * 4
}

interface LiveTexture {
  cap: TierCap
  texture: Texture
  bytes: number
}

interface Entry {
  hash: string
  url: string
  refs: number
  nativeW: number
  nativeH: number
  /** The single resident GPU texture (one tier live at a time — a swap
   * creates the new tier, redraws, then destroys the old, so accounting
   * is exactly the on-screen bytes). Null until the first acquire lands. */
  live: LiveTexture | null
  /** Tier the current cull pass wants (post-budget). */
  desiredCap: TierCap
  /** A swap is in flight for this hash (double-start guard). */
  swapping: boolean
  /** When an UPGRADE (needs higher res than live) was first requested —
   * the clock for worst visible-lowres duration. Null when satisfied. */
  upgradeSince: number | null
}

export interface TierPlanItem {
  id: string
  hash: string
}

/** Redraws a resident placement's image body with a new tier texture.
 * Returns false when the body has not been built yet (texture attach
 * still async) so the swap can be retried next commit. Supplied by the
 * harness because the body-draw geometry (rounded rect, size) is the
 * engine's; for the synthetic scene it is radius 0 / no crop. */
export type RedrawBody = (id: string, texture: Texture) => boolean

function residencyRect(camera: Camera, vp: { width: number; height: number }): Rect {
  const p = RESIDENCY_PADDING
  const tl = camera.screenToWorld({ x: -vp.width * p, y: -vp.height * p })
  const br = camera.screenToWorld({ x: vp.width * (1 + p), y: vp.height * (1 + p) })
  return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export class TieredTextureBudget {
  #budgetBytes: number
  #entries = new Map<string, Entry>()
  /** Full-res source canvases, LRU-capped: a swap downscales from here;
   * a cache miss repaints (a pessimistic proxy for a cold decode). */
  #canvasCache = new Map<string, HTMLCanvasElement>()
  #canvasCacheCap = 96
  /** desiredCap decided by the most recent planTiers, by hash. */
  #plan = new Map<string, TierCap>()

  // ---- metrics ----
  #peakResidentBytes = 0
  #swapCount = 0
  #swapWorstMs = 0
  /** Frame-weighted tier observations: label → count summed per commit. */
  #tierObservations = new Map<string, number>()
  #lastCommit = 0

  constructor(budgetBytes: number) {
    this.#budgetBytes = budgetBytes
  }

  get budgetBytes(): number {
    return this.#budgetBytes
  }

  #sourceCanvas(hash: string, url: string): HTMLCanvasElement {
    const cached = this.#canvasCache.get(hash)
    if (cached) {
      // Refresh LRU position.
      this.#canvasCache.delete(hash)
      this.#canvasCache.set(hash, cached)
      return cached
    }
    const canvas = renderAssetCanvas(url)
    this.#canvasCache.set(hash, canvas)
    while (this.#canvasCache.size > this.#canvasCacheCap) {
      const oldest = this.#canvasCache.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.#canvasCache.delete(oldest)
    }
    return canvas
  }

  async #makeTierTexture(hash: string, url: string, cap: TierCap): Promise<LiveTexture> {
    const canvas = this.#sourceCanvas(hash, url)
    const nativeMaxEdge = Math.max(canvas.width, canvas.height)
    const scale = cap === FULL_CAP || cap >= nativeMaxEdge ? 1 : cap / nativeMaxEdge
    const bitmap =
      scale === 1
        ? await createImageBitmap(canvas)
        : await createImageBitmap(canvas, {
            resizeWidth: Math.max(1, Math.round(canvas.width * scale)),
            resizeHeight: Math.max(1, Math.round(canvas.height * scale)),
            resizeQuality: 'high',
          })
    const texture = Texture.from(bitmap)
    texture.source.autoGenerateMipmaps = true
    return { cap, texture, bytes: bitmap.width * bitmap.height * 4 }
  }

  /**
   * RendererResources.textures.acquire. Refcounted like the real budget.
   * The tier is whatever planTiers most recently committed for this hash
   * (it runs each cull pass before the Culler fires residency grants),
   * falling back to 512 for a never-planned hash.
   */
  async acquire(hash: string, url: string): Promise<Texture> {
    let entry = this.#entries.get(hash)
    if (entry) {
      entry.refs += 1
      if (entry.live) return entry.live.texture
    } else {
      entry = {
        hash,
        url,
        refs: 1,
        nativeW: 0,
        nativeH: 0,
        live: null,
        desiredCap: this.#plan.get(hash) ?? 512,
        swapping: false,
        upgradeSince: null,
      }
      this.#entries.set(hash, entry)
    }
    const cap = this.#plan.get(hash) ?? entry.desiredCap
    entry.desiredCap = cap
    const live = await this.#makeTierTexture(hash, url, cap)
    const current = this.#entries.get(hash)
    if (!current || current.refs === 0) {
      // Released while loading.
      live.texture.destroy(true)
      return live.texture
    }
    current.nativeW = live.texture.source.pixelWidth
    current.nativeH = live.texture.source.pixelHeight
    // (pixelWidth/Height here is the CAPPED size, not native; native is
    // recovered from the source canvas when a swap needs it.)
    if (current.live && current.live.texture !== live.texture) current.live.texture.destroy(true)
    current.live = live
    return live.texture
  }

  /** RendererResources.textures.release. Refcount to zero destroys the
   * live texture immediately (the spike models a hard single-tier
   * residency; there is no idle pool — that is the engine's job). */
  release(hash: string): void {
    const entry = this.#entries.get(hash)
    if (!entry || entry.refs === 0) return
    entry.refs -= 1
    if (entry.refs > 0) return
    if (entry.live) {
      try {
        entry.live.texture.destroy(true)
      } catch {
        /* already gone */
      }
    }
    this.#entries.delete(hash)
    this.#canvasCache.delete(hash)
  }

  releaseAll(): void {
    for (const entry of this.#entries.values()) {
      try {
        entry.live?.texture.destroy(true)
      } catch {
        /* already gone */
      }
    }
    this.#entries.clear()
    this.#canvasCache.clear()
    this.#plan.clear()
  }

  /**
   * Decide the committed tier cap for every image within the residency
   * rect, BEFORE the Culler fires its grants (so acquire reads the right
   * cap). Ideal cap = smallest ladder rung ≥ rendered device-px; then,
   * sorted by contribution DESC, greedily fit under the byte budget —
   * the lowest-contribution textures are squeezed down the ladder (to
   * the 256 floor) until the resident set fits. This is the LRU-by-
   * contribution eviction of the higher tiers.
   */
  planTiers(
    items: readonly SceneItem[],
    camera: Camera,
    vp: { width: number; height: number },
    dpr: number,
  ): void {
    const rect = residencyRect(camera, vp)
    const zoom = camera.zoom
    const visible: Array<{
      hash: string
      nativeW: number
      nativeH: number
      renderedPx: number
      ideal: TierCap
    }> = []
    for (const item of items) {
      if (item.itemKind !== 'placement') continue
      const p = item as SceneItem & {
        appearanceKind?: string
        assetContentHash?: string | null
        assetWidth?: number
        assetHeight?: number
        width?: number
        height?: number
        scale?: number
      }
      if (p.appearanceKind !== 'image' || !p.assetContentHash) continue
      const aabb = itemWorldAABB(item)
      if (!aabb || !intersects(aabb, rect)) continue
      const w = p.width ?? p.assetWidth ?? 128
      const h = p.height ?? p.assetHeight ?? 128
      const scale = Math.abs(p.scale ?? 1) || 1
      const renderedPx = Math.max(w, h) * zoom * scale * dpr
      visible.push({
        hash: p.assetContentHash,
        nativeW: p.assetWidth ?? 1024,
        nativeH: p.assetHeight ?? 1024,
        renderedPx,
        ideal: idealCapForRendered(renderedPx),
      })
    }
    // Highest contribution first — they keep their ideal tier; the tail
    // absorbs the budget squeeze.
    visible.sort((a, b) => b.renderedPx - a.renderedPx)
    this.#plan.clear()
    let running = 0
    for (const v of visible) {
      let cap = v.ideal
      // Step down the ladder until this texture fits the remaining
      // budget, never below the 256 floor.
      const ladder: TierCap[] = [FULL_CAP, 1024, 512, 256]
      let bytes = tierBytes(v.nativeW, v.nativeH, cap)
      if (running + bytes > this.#budgetBytes) {
        for (const rung of ladder) {
          if (rung >= cap) continue // only ever step DOWN from ideal
          cap = rung
          bytes = tierBytes(v.nativeW, v.nativeH, cap)
          if (running + bytes <= this.#budgetBytes) break
        }
      }
      running += bytes
      this.#plan.set(v.hash, cap)
      const entry = this.#entries.get(v.hash)
      if (entry) entry.desiredCap = cap
    }
  }

  /**
   * After the Culler pass: swap any resident texture whose live tier no
   * longer matches its committed desired tier (a zoom-in upgrade or a
   * budget-driven downgrade), redrawing the body, and fold the resident
   * byte total / tier mix / swap timings into the metrics.
   */
  commit(resident: TierPlanItem[], redraw: RedrawBody, now: number): void {
    const dt = this.#lastCommit === 0 ? 0 : now - this.#lastCommit
    this.#lastCommit = now
    let residentBytes = 0
    for (const { id, hash } of resident) {
      const entry = this.#entries.get(hash)
      if (!entry || entry.refs === 0 || !entry.live) continue
      residentBytes += entry.live.bytes
      if (dt > 0) {
        const label = tierLabel(entry.live.cap)
        this.#tierObservations.set(label, (this.#tierObservations.get(label) ?? 0) + 1)
      }
      const desired = entry.desiredCap
      if (desired !== entry.live.cap) {
        if (desired > entry.live.cap && entry.upgradeSince === null) entry.upgradeSince = now
        this.#startSwap(entry, id, redraw)
      }
    }
    if (residentBytes > this.#peakResidentBytes) this.#peakResidentBytes = residentBytes
  }

  #startSwap(entry: Entry, id: string, redraw: RedrawBody): void {
    if (entry.swapping) return
    const targetCap = entry.desiredCap
    entry.swapping = true
    void this.#makeTierTexture(entry.hash, entry.url, targetCap)
      .then((next) => {
        const landed = performance.now()
        const current = this.#entries.get(entry.hash)
        if (!current || current.refs === 0) {
          next.texture.destroy(true)
          return
        }
        // The desired cap may have moved again mid-load; only land if it
        // still matches, else discard and let the next commit re-issue.
        if (current.desiredCap !== targetCap) {
          next.texture.destroy(true)
          current.swapping = false
          return
        }
        const drawn = redraw(id, next.texture)
        if (!drawn) {
          // Body not built yet — keep the new texture as live so a later
          // attach uses it, retry redraw next commit.
          next.texture.destroy(true)
          current.swapping = false
          return
        }
        const wasUpgrade = current.live !== null && targetCap > current.live.cap
        if (current.live && current.live.texture !== next.texture) {
          try {
            current.live.texture.destroy(true)
          } catch {
            /* already gone */
          }
        }
        current.live = next
        current.swapping = false
        this.#swapCount += 1
        if (wasUpgrade && current.upgradeSince !== null) {
          // Worst visible-lowres duration: from when the higher tier was
          // first demanded (a zoom-in) to when it actually lands on screen.
          const dur = landed - current.upgradeSince
          if (dur > this.#swapWorstMs) this.#swapWorstMs = dur
          current.upgradeSince = null
        } else if (!wasUpgrade) {
          current.upgradeSince = null
        }
      })
      .catch(() => {
        const current = this.#entries.get(entry.hash)
        if (current) current.swapping = false
      })
  }

  /** Live GPU bytes across resident textures, right now. */
  stats(): { textures: number; residentBytes: number; idleBytes: number } {
    let residentBytes = 0
    let textures = 0
    for (const entry of this.#entries.values()) {
      if (entry.refs > 0 && entry.live) {
        residentBytes += entry.live.bytes
        textures += 1
      }
    }
    if (residentBytes > this.#peakResidentBytes) this.#peakResidentBytes = residentBytes
    return { textures, residentBytes, idleBytes: 0 }
  }

  /** The sweep-summary metrics (AI-IMP-241 JSON extension). */
  metrics(): {
    peakResidentBytes: number
    swapCount: number
    swapWorstMs: number
    tierHistogram: Record<string, number>
    budgetBytes: number
  } {
    const total = [...this.#tierObservations.values()].reduce((a, b) => a + b, 0)
    const tierHistogram: Record<string, number> = {}
    for (const label of ['full', '1024', '512', '256']) {
      const n = this.#tierObservations.get(label) ?? 0
      tierHistogram[label] = total > 0 ? Math.round((n / total) * 1000) / 10 : 0
    }
    return {
      peakResidentBytes: this.#peakResidentBytes,
      swapCount: this.#swapCount,
      swapWorstMs: Math.round(this.#swapWorstMs * 10) / 10,
      tierHistogram,
      budgetBytes: this.#budgetBytes,
    }
  }

  resetMetrics(): void {
    this.#peakResidentBytes = 0
    this.#swapCount = 0
    this.#swapWorstMs = 0
    this.#tierObservations.clear()
    this.#lastCommit = 0
  }
}

/** A resident image body's redraw for the synthetic scene: reissue the
 * rounded-rect fill with the new tier texture, at the size the engine
 * stored on the container. Radius 0 / no crop (the harness injects no
 * imageTreatment). Returns false when the body is still a placeholder. */
export function makeSyntheticRedraw(getContainer: (id: string) => Container | undefined): RedrawBody {
  return (id, texture) => {
    const container = getContainer(id) as
      | (Container & { __imageSize?: { width: number; height: number } })
      | undefined
    if (!container) return false
    const image = container.getChildByLabel?.('image') as Graphics | null
    if (!image) return false
    const size = container.__imageSize ?? { width: 128, height: 128 }
    image.clear()
    image
      .roundRect(-size.width / 2, -size.height / 2, size.width, size.height, 0)
      .fill({ texture, textureSpace: 'local' })
    return true
  }
}
