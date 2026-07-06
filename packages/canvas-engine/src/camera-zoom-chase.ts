import { Camera, MAX_ZOOM, MIN_ZOOM, type Point } from './camera'

/**
 * Zoom-toward-target smoothing (§6.9 "eases toward the target rather
 * than jumping", AI-IMP-098): wheel/pinch events MULTIPLY a target
 * zoom instead of mutating the camera, and tick() chases that target
 * with frame-rate-independent exponential smoothing — per tick the
 * camera covers k = 1 − exp(−dt/τ) of the remaining gap, measured in
 * LOG zoom space so the perceived rate is constant (the same
 * convention as CameraFlight). Because the residual decays by
 * exp(−Δt/τ) regardless of how Δt is sliced, ticking from both the
 * ticker and the event path composes exactly; step patterns do not
 * change the trajectory.
 *
 * Cursor anchoring holds THROUGH the chase, not just per event: the
 * world point captured under the cursor is re-pinned to the cursor's
 * screen point from the current zoom on every tick, so intermediate
 * frames stay cursor-centered and the resting camera is exactly what
 * a chain of instant zoomAt calls would have produced (the epsilon
 * snap writes the target zoom verbatim, then solves x/y from the
 * same anchor equation zoomAt uses).
 *
 * Cancel discipline mirrors CameraFlight: our own writes are guarded;
 * any external camera write (pan, gesture, restore, a flight step)
 * aborts the chase. The host additionally cancels on pointerdown and
 * on starting a flight so a chase never fights either.
 */

/** Time constant of the ease; owner-tunable live via __ewDebug. */
export const ZOOM_CHASE_TAU_MS = 70
/** The activation tick is backdated by one nominal frame so the very
 * first wheel event of a burst moves the camera synchronously — zero
 * perceived latency — instead of waiting for the next rAF. */
export const ZOOM_CHASE_HEADSTART_MS = 17
/** Snap-to-target threshold in log-zoom space (~0.1% of zoom): below
 * it the motion is invisible, so rest becomes bit-exact instead of
 * asymptotic. */
export const ZOOM_CHASE_SNAP_LOG_EPSILON = 0.001

/** Monotonic when the platform has one; the engine tsconfig carries
 * no DOM lib, hence the structural cast instead of `performance`. */
const defaultNow = (): number =>
  (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now()

export class CameraZoomChase {
  #camera: Camera
  #now: () => number
  #target: number | null = null
  #anchorScreen: Point = { x: 0, y: 0 }
  #anchorWorld: Point = { x: 0, y: 0 }
  #lastTick = 0
  #tau = ZOOM_CHASE_TAU_MS
  /** Guards cancel-on-camera-change against our own writes. */
  #applying = false

  constructor(camera: Camera, now: () => number = defaultNow) {
    this.#camera = camera
    this.#now = now
  }

  get active(): boolean {
    return this.#target !== null
  }

  /** Resting zoom the chase is easing toward; null when inactive. */
  get targetZoom(): number | null {
    return this.#target
  }

  get tau(): number {
    return this.#tau
  }

  set tau(value: number) {
    if (Number.isFinite(value) && value > 0) this.#tau = value
  }

  /**
   * One wheel/pinch event: multiply the target (clamped like zoomAt
   * clamps) and re-anchor at the cursor. Re-anchoring reads the world
   * point from the CURRENT camera — for a stationary cursor mid-chase
   * that is the same world point (the tick invariant holds it there),
   * and a moved cursor re-centers the remainder of the chase, exactly
   * like instant zoomAt would have. Ticks immediately with true
   * elapsed time so response starts at the event, not the next frame.
   */
  zoomBy(screenPoint: Point, factor: number): void {
    const base = this.#target ?? this.#camera.zoom
    if (this.#target === null) this.#lastTick = this.#now() - ZOOM_CHASE_HEADSTART_MS
    this.#target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base * factor))
    this.#anchorScreen = { x: screenPoint.x, y: screenPoint.y }
    this.#anchorWorld = this.#camera.screenToWorld(screenPoint)
    this.tick()
  }

  /**
   * Advances toward the target using real elapsed time; the host
   * calls this from its ticker, zoomBy calls it per event. Returns
   * true while the chase is still active.
   */
  tick(): boolean {
    if (this.#target === null) return false
    const now = this.#now()
    const dt = now - this.#lastTick
    if (dt <= 0) return true
    this.#lastTick = now
    const k = 1 - Math.exp(-dt / this.#tau)
    const logZoom = Math.log(this.#camera.zoom)
    const logTarget = Math.log(this.#target)
    const nextLog = logZoom + (logTarget - logZoom) * k
    const done = Math.abs(logTarget - nextLog) < ZOOM_CHASE_SNAP_LOG_EPSILON
    const zoom = done ? this.#target : Math.exp(nextLog)
    this.#applying = true
    // Re-solve x/y so the anchor world point maps to the anchor
    // screen point at THIS zoom — the same equation as zoomAt.
    this.#camera.set({
      x: this.#anchorWorld.x - this.#anchorScreen.x / zoom,
      y: this.#anchorWorld.y - this.#anchorScreen.y / zoom,
      zoom,
    })
    this.#applying = false
    if (done) {
      this.#target = null
      return false
    }
    return true
  }

  /** External camera input aborts the chase (unless it is our own
   * tick applying). */
  cancelOnExternalChange(): void {
    if (!this.#applying) this.#target = null
  }

  cancel(): void {
    this.#target = null
  }
}
