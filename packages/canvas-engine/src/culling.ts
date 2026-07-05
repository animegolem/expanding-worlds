import { itemWorldAABB } from './hit-test'
import type { Camera, Rect } from './camera'
import type { SceneSync } from './scene-sync'
import type { SceneItem } from './types'

/**
 * Viewport culling (§12.2): items whose world bounds fall outside the
 * padded viewport stop rendering (`renderable = false`) but keep
 * their display objects, so re-entry is free. A second, larger
 * residency rectangle drives texture lifetime with hysteresis: enter
 * fires when an item crosses INTO the residency rect, leave when it
 * crosses OUT — the gap between the two rects prevents thrash at the
 * edge. The culler never touches domain state.
 */

export interface CullerHooks {
  /** Item entered the residency rect (acquire textures). */
  onEnterResidency?: (id: string, item: SceneItem) => void
  /** Item left the residency rect (release textures). */
  onLeaveResidency?: (id: string, item: SceneItem) => void
}

/** Render padding: fraction of the viewport added on every side. */
export const RENDER_PADDING = 0.2
/** Residency padding: larger, so textures outlive small pans. */
export const RESIDENCY_PADDING = 0.75

function paddedWorldViewport(
  camera: Camera,
  viewport: { width: number; height: number },
  padding: number,
): Rect {
  const tl = camera.screenToWorld({
    x: -viewport.width * padding,
    y: -viewport.height * padding,
  })
  const br = camera.screenToWorld({
    x: viewport.width * (1 + padding),
    y: viewport.height * (1 + padding),
  })
  return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export class Culler {
  #sync: SceneSync
  #camera: Camera
  #hooks: CullerHooks
  #resident = new Map<string, SceneItem>()

  constructor(sync: SceneSync, camera: Camera, hooks: CullerHooks = {}) {
    this.#sync = sync
    this.#camera = camera
    this.#hooks = hooks
  }

  /** Runs the AABB pass over the current scene; call on camera change
   * and after every scene apply. */
  apply(items: readonly SceneItem[], viewport: { width: number; height: number }): void {
    if (viewport.width <= 0 || viewport.height <= 0) return
    const renderRect = paddedWorldViewport(this.#camera, viewport, RENDER_PADDING)
    const residencyRect = paddedWorldViewport(this.#camera, viewport, RESIDENCY_PADDING)
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.id)
      const object = this.#sync.get(item.id)
      if (!object) continue
      const aabb = itemWorldAABB(item)
      if (!aabb) continue
      object.renderable = intersects(aabb, renderRect)
      const inResidency = intersects(aabb, residencyRect)
      const wasResident = this.#resident.has(item.id)
      if (inResidency && !wasResident) {
        this.#resident.set(item.id, item)
        this.#hooks.onEnterResidency?.(item.id, item)
      } else if (!inResidency && wasResident) {
        this.#resident.delete(item.id)
        this.#hooks.onLeaveResidency?.(item.id, item)
      } else if (inResidency) {
        this.#resident.set(item.id, item)
      }
    }
    // Items gone from the scene leave residency too (release textures).
    for (const [id, item] of [...this.#resident]) {
      if (!seen.has(id)) {
        this.#resident.delete(id)
        this.#hooks.onLeaveResidency?.(id, item)
      }
    }
  }

  isResident(id: string): boolean {
    return this.#resident.has(id)
  }

  stats(items: readonly SceneItem[]): { total: number; renderable: number; resident: number } {
    let renderable = 0
    for (const item of items) {
      const object = this.#sync.get(item.id)
      if (object?.renderable) renderable += 1
    }
    return { total: items.length, renderable, resident: this.#resident.size }
  }

  reset(): void {
    this.#resident.clear()
  }
}
