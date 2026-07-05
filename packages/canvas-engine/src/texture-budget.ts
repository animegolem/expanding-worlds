/**
 * Explicit texture lifetime (§12.2 + spike carry-forward: texture
 * ownership stays outside Pixi's global caches). Consumers acquire by
 * content hash (refcounted); release moves a texture to an idle LRU
 * pool that is trimmed to the byte budget — so a texture that just
 * left the viewport survives a pan-back, but memory stays bounded.
 * releaseAll() (canvas swap) destroys the idle pool immediately and
 * flags live textures to be destroyed on their final release.
 */

export interface BudgetTexture {
  /** Estimated GPU bytes (w × h × 4). */
  readonly byteSize: number
  destroy(destroyBase?: boolean): void
  readonly destroyed: boolean
}

interface Entry {
  texture: BudgetTexture
  bytes: number
  refs: number
  /** LRU tick of the last release; only meaningful when refs === 0. */
  idleSince: number
  doomed: boolean
}

export const DEFAULT_TEXTURE_BUDGET_BYTES = 512 * 1024 * 1024

export class TextureBudget {
  #load: (url: string) => Promise<unknown>
  #maxIdleBytes: number
  #entries = new Map<string, Entry>()
  #pending = new Map<string, Promise<unknown>>()
  #tick = 0

  constructor(load: (url: string) => Promise<unknown>, maxIdleBytes = DEFAULT_TEXTURE_BUDGET_BYTES) {
    this.#load = load
    this.#maxIdleBytes = maxIdleBytes
  }

  /** Refcounted load; concurrent acquires share one in-flight load. */
  async acquire(hash: string, url: string): Promise<unknown> {
    const existing = this.#entries.get(hash)
    if (existing && !existing.texture.destroyed) {
      existing.refs += 1
      existing.doomed = false
      return existing.texture
    }
    let pending = this.#pending.get(hash)
    if (!pending) {
      pending = this.#load(url).finally(() => this.#pending.delete(hash))
      this.#pending.set(hash, pending)
    }
    const texture = (await pending) as BudgetTexture & {
      width?: number
      height?: number
      source?: { pixelWidth?: number; pixelHeight?: number }
    }
    const after = this.#entries.get(hash)
    if (after && !after.texture.destroyed) {
      // Another awaiter registered it first.
      after.refs += 1
      return after.texture
    }
    const width = texture.source?.pixelWidth ?? texture.width ?? 0
    const height = texture.source?.pixelHeight ?? texture.height ?? 0
    this.#entries.set(hash, {
      texture,
      bytes: Math.max(1, width * height * 4),
      refs: 1,
      idleSince: 0,
      doomed: false,
    })
    return texture
  }

  release(hash: string): void {
    const entry = this.#entries.get(hash)
    if (!entry || entry.refs === 0) return
    entry.refs -= 1
    if (entry.refs > 0) return
    if (entry.doomed) {
      this.#destroy(hash, entry)
      return
    }
    this.#tick += 1
    entry.idleSince = this.#tick
    this.#trim()
  }

  /** Canvas swap: drop the idle pool now, doom live textures. */
  releaseAll(): void {
    for (const [hash, entry] of [...this.#entries]) {
      if (entry.refs === 0) this.#destroy(hash, entry)
      else entry.doomed = true
    }
  }

  #trim(): void {
    let idleBytes = 0
    const idle: Array<[string, Entry]> = []
    for (const [hash, entry] of this.#entries) {
      if (entry.refs === 0) {
        idleBytes += entry.bytes
        idle.push([hash, entry])
      }
    }
    if (idleBytes <= this.#maxIdleBytes) return
    idle.sort((a, b) => a[1].idleSince - b[1].idleSince)
    for (const [hash, entry] of idle) {
      if (idleBytes <= this.#maxIdleBytes) break
      idleBytes -= entry.bytes
      this.#destroy(hash, entry)
    }
  }

  #destroy(hash: string, entry: Entry): void {
    this.#entries.delete(hash)
    if (!entry.texture.destroyed) entry.texture.destroy(true)
  }

  stats(): { textures: number; residentBytes: number; idleBytes: number } {
    let residentBytes = 0
    let idleBytes = 0
    for (const entry of this.#entries.values()) {
      if (entry.refs > 0) residentBytes += entry.bytes
      else idleBytes += entry.bytes
    }
    return { textures: this.#entries.size, residentBytes, idleBytes }
  }
}
