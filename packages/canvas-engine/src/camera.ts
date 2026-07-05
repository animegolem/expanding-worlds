import type { SceneCamera } from './types'

/**
 * Camera math (§13.1). Convention: camera (x, y) is the world point
 * at the screen origin (top-left); screen = (world − camera) × zoom.
 * The world plane mirrors it as position = −camera × zoom, scale =
 * zoom. Zoom-at-cursor keeps the world point under the cursor fixed.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_ZOOM = 0.002
export const MAX_ZOOM = 64

export class Camera {
  x = 0
  y = 0
  zoom = 1
  #changed = new Set<(camera: SceneCamera) => void>()

  state(): SceneCamera {
    return { x: this.x, y: this.y, zoom: this.zoom }
  }

  set(state: SceneCamera): void {
    this.x = state.x
    this.y = state.y
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom))
    this.#notify()
  }

  worldToScreen(p: Point): Point {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom }
  }

  screenToWorld(p: Point): Point {
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y }
  }

  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom
    this.y -= dy / this.zoom
    this.#notify()
  }

  zoomAt(screenPoint: Point, factor: number): void {
    const anchor = this.screenToWorld(screenPoint)
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    // Re-solve x, y so `anchor` maps back to `screenPoint`.
    this.x = anchor.x - screenPoint.x / this.zoom
    this.y = anchor.y - screenPoint.y / this.zoom
    this.#notify()
  }

  /** Pure §6.9 fit computation; CameraFlight eases toward it
   * (AI-IMP-032) and fitBounds applies it instantly. */
  fitTarget(
    bounds: Rect,
    viewport: { width: number; height: number },
    padding = 48,
  ): SceneCamera | null {
    if (bounds.width <= 0 || bounds.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
      return null
    }
    const zoomX = (viewport.width - padding * 2) / bounds.width
    const zoomY = (viewport.height - padding * 2) / bounds.height
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)))
    return {
      x: bounds.x + bounds.width / 2 - viewport.width / 2 / zoom,
      y: bounds.y + bounds.height / 2 - viewport.height / 2 / zoom,
      zoom,
    }
  }

  /** §6.9 zoom to fit / to selection: camera-only, never durable. */
  fitBounds(bounds: Rect, viewport: { width: number; height: number }, padding = 48): void {
    const target = this.fitTarget(bounds, viewport, padding)
    if (target) this.set(target)
  }

  /** Applies to the world plane (anything with position + scale). */
  applyTo(world: {
    position: { set(x: number, y: number): void }
    scale: { set(x: number, y?: number): void }
  }): void {
    world.position.set(-this.x * this.zoom, -this.y * this.zoom)
    world.scale.set(this.zoom)
  }

  onChanged(listener: (camera: SceneCamera) => void): () => void {
    this.#changed.add(listener)
    return () => this.#changed.delete(listener)
  }

  #notify(): void {
    const state = this.state()
    for (const listener of this.#changed) listener(state)
  }
}
