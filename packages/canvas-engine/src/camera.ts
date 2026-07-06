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

/** Per-edge screen-space padding (px) a fit must keep clear (§6.9 rev
 * 0.31, AI-IMP-100): the fit solves against the viewport MINUS these
 * edges and centers its target in the region that remains, so a panel
 * a flight is about to open lands beside the target, not over it. */
export interface ScreenInset {
  top: number
  right: number
  bottom: number
  left: number
}

export const ZERO_INSET: Readonly<ScreenInset> = { top: 0, right: 0, bottom: 0, left: 0 }

export const MIN_ZOOM = 0.002
export const MAX_ZOOM = 64

export class Camera {
  x = 0
  y = 0
  zoom = 1
  #changed = new Set<(camera: SceneCamera) => void>()
  /** One-shot inset for the NEXT fit (AI-IMP-100). The host's flyTo
   * calls fitTarget with no inset argument, and host.ts is a closed
   * surface — so callers that reach the camera (the note layer) arm
   * the reservation here and it is consumed by the fit that follows. */
  #pendingInset: ScreenInset | null = null

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

  /** Arm a one-shot fit inset (AI-IMP-100): the NEXT fitTarget reserves
   * these screen edges and centers its target in what remains, then the
   * inset clears. Zero/absent leaves the fit byte-identical to before. */
  setNextFitInset(inset: ScreenInset | null): void {
    this.#pendingInset = inset
  }

  /** Every fit consumes the one-shot pending inset (an explicit inset
   * argument wins). Absent both, the fit uses zero — today's behavior. */
  #takeInset(explicit?: ScreenInset): ScreenInset {
    const pending = this.#pendingInset
    this.#pendingInset = null
    return explicit ?? pending ?? ZERO_INSET
  }

  /** §6.9 fit computation; CameraFlight eases toward it (AI-IMP-032)
   * and fitBounds applies it instantly. With a non-zero inset (§6.9 rev
   * 0.31, AI-IMP-100) the fit solves against the viewport minus the
   * inset and centers `bounds` in the REMAINING region. */
  fitTarget(
    bounds: Rect,
    viewport: { width: number; height: number },
    padding = 48,
    inset?: ScreenInset,
  ): SceneCamera | null {
    const pad = this.#takeInset(inset)
    const availWidth = viewport.width - pad.left - pad.right
    const availHeight = viewport.height - pad.top - pad.bottom
    if (bounds.width <= 0 || bounds.height <= 0 || availWidth <= 0 || availHeight <= 0) {
      return null
    }
    const zoomX = (availWidth - padding * 2) / bounds.width
    const zoomY = (availHeight - padding * 2) / bounds.height
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)))
    // The camera must map the bounds center onto the CENTER of the
    // panel-free region (screen coords), not the raw viewport center.
    const regionCenterX = pad.left + availWidth / 2
    const regionCenterY = pad.top + availHeight / 2
    return {
      x: bounds.x + bounds.width / 2 - regionCenterX / zoom,
      y: bounds.y + bounds.height / 2 - regionCenterY / zoom,
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
