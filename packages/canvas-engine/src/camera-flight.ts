import { Camera } from './camera'
import type { SceneCamera } from './types'

/**
 * Eased camera flight (§6.7/§6.9 rev 0.11, AI-IMP-032): a short
 * tween instead of a teleport for zoom-to-fit and framing a newly
 * set background. Position lerps linearly; zoom lerps in LOG space
 * so the perceived zoom rate stays constant; ease-out cubic. The
 * host drives step() from its ticker and cancels on any user camera
 * input — a fight between a flight and a pinch must always go to
 * the human.
 */

export const FLIGHT_DURATION_MS = 250

function easeOutCubic(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}

export class CameraFlight {
  #camera: Camera
  #from: SceneCamera | null = null
  #to: SceneCamera | null = null
  #elapsed = 0
  #duration = FLIGHT_DURATION_MS
  /** Guards cancel-on-camera-change against our own writes. */
  #applying = false

  constructor(camera: Camera) {
    this.#camera = camera
  }

  get active(): boolean {
    return this.#to !== null
  }

  flyTo(target: SceneCamera, durationMs = FLIGHT_DURATION_MS): void {
    this.#from = this.#camera.state()
    this.#to = target
    this.#elapsed = 0
    this.#duration = Math.max(1, durationMs)
  }

  /** Advances the tween; returns true while the flight is active. */
  step(deltaMS: number): boolean {
    if (!this.#from || !this.#to) return false
    this.#elapsed += deltaMS
    const t = Math.min(1, this.#elapsed / this.#duration)
    const k = easeOutCubic(t)
    const zoom = Math.exp(
      Math.log(this.#from.zoom) + (Math.log(this.#to.zoom) - Math.log(this.#from.zoom)) * k,
    )
    const state: SceneCamera = {
      x: this.#from.x + (this.#to.x - this.#from.x) * k,
      y: this.#from.y + (this.#to.y - this.#from.y) * k,
      zoom,
    }
    this.#applying = true
    this.#camera.set(t >= 1 ? this.#to : state)
    this.#applying = false
    if (t >= 1) {
      this.#from = null
      this.#to = null
      return false
    }
    return true
  }

  /** External camera input aborts the flight (unless it is our own
   * step applying). */
  cancelOnExternalChange(): void {
    if (!this.#applying) {
      this.#from = null
      this.#to = null
    }
  }

  cancel(): void {
    this.#from = null
    this.#to = null
  }
}
