/**
 * Interaction-physics beats (RFC §8.2 ledger, rev 0.56 · AI-IMP-151).
 *
 * The PURE, renderer-agnostic core of the world-content motion beats:
 * time → display-delta functions plus the drag lift/settle state
 * machine. Every beat is ONE-SHOT — a bounded ease that terminates; no
 * function here holds a timer, a ticker, a rAF, or any self-re-arming
 * loop (the one-shot guard scans this file for those primitives). The
 * host owns the single shared ticker that advances these and composites
 * the deltas onto the Pixi display objects.
 *
 * Committed geometry is never touched here: these produce DISPLAY
 * offsets/scales layered on top of the object the renderer already
 * positioned from the model. The nudge in particular is a pure decay to
 * exactly zero — the snapped geometry the gesture commits is unchanged.
 *
 * Durations and magnitudes are supplied by the caller (chrome/beats.ts
 * is the constants home); this module carries only the shapes.
 */

/** Ease-out cubic — the shared one-shot curve (matches camera-flight). */
export function easeOutCubic(t: number): number {
  const inv = 1 - clamp01(t)
  return 1 - inv * inv * inv
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** The composited display delta the host lays over a renderer's transform. */
export interface BeatDisplay {
  /** Multiplies the object's geometric scale (1 = untouched). */
  scale: number
  /** Screen-px display offset (host divides by zoom → world units). */
  offsetX: number
  offsetY: number
}

export const NEUTRAL_DISPLAY: BeatDisplay = { scale: 1, offsetX: 0, offsetY: 0 }

export type DragPhase = 'lifting' | 'lifted' | 'settling' | 'done'

/**
 * The grab → LIFT → (hold) → release → SETTLE state machine for one
 * dragged item. Lift eases the body up ~1% with its drag shadow over
 * `liftMs`, holds while the drag continues, then settles back in ONE
 * ease-out over `settleMs` — never a bounce (scale is monotonic from the
 * held value down to 1, never crossing below). Terminates at `done`.
 */
export class DragBeat {
  readonly #liftMs: number
  readonly #settleMs: number
  readonly #liftScale: number
  #phase: DragPhase = 'lifting'
  #elapsed = 0
  /** Scale captured at release, so a mid-lift release settles smoothly. */
  #settleFrom = 1
  #shadowFrom = 1

  constructor(timings: { liftMs: number; settleMs: number }, liftScale: number) {
    this.#liftMs = Math.max(1, timings.liftMs)
    this.#settleMs = Math.max(1, timings.settleMs)
    this.#liftScale = liftScale
  }

  get phase(): DragPhase {
    return this.#phase
  }

  get finished(): boolean {
    return this.#phase === 'done'
  }

  /** Grab lifted, drag ended (commit or cancel): begin the settle. */
  release(): void {
    if (this.#phase === 'settling' || this.#phase === 'done') return
    const d = this.display()
    this.#settleFrom = d.scale
    this.#shadowFrom = this.shadow()
    this.#phase = 'settling'
    this.#elapsed = 0
  }

  advance(deltaMs: number): void {
    if (this.#phase === 'done') return
    this.#elapsed += Math.max(0, deltaMs)
    if (this.#phase === 'lifting' && this.#elapsed >= this.#liftMs) {
      this.#phase = 'lifted'
    } else if (this.#phase === 'settling' && this.#elapsed >= this.#settleMs) {
      this.#phase = 'done'
    }
  }

  display(): BeatDisplay {
    return { scale: this.#scale(), offsetX: 0, offsetY: 0 }
  }

  /** Drag-shadow opacity 0..1 (0 = no shadow). */
  shadow(): number {
    switch (this.#phase) {
      case 'lifting':
        return easeOutCubic(this.#elapsed / this.#liftMs)
      case 'lifted':
        return 1
      case 'settling':
        return this.#shadowFrom * (1 - easeOutCubic(this.#elapsed / this.#settleMs))
      case 'done':
        return 0
    }
  }

  #scale(): number {
    switch (this.#phase) {
      case 'lifting':
        return 1 + this.#liftScale * easeOutCubic(this.#elapsed / this.#liftMs)
      case 'lifted':
        return 1 + this.#liftScale
      case 'settling': {
        const k = easeOutCubic(this.#elapsed / this.#settleMs)
        return this.#settleFrom + (1 - this.#settleFrom) * k
      }
      case 'done':
        return 1
    }
  }
}

/**
 * NUDGE — snap engage last-px magnetic seat. Seeded with the snap
 * adjust just applied (screen px), it decays to EXACTLY zero over
 * `nudgeMs` so the body glides into the seat instead of teleporting.
 * Display-only: the gesture already committed the true snapped
 * geometry; this offset rides on top and vanishes.
 */
export function nudgeOffset(
  elapsedMs: number,
  seed: { x: number; y: number },
  nudgeMs: number,
): { x: number; y: number } {
  const k = easeOutCubic(elapsedMs / Math.max(1, nudgeMs))
  const rem = 1 - k
  // `|| 0` normalises -0 (a negative seed at rem=0) to +0.
  return { x: seed.x * rem || 0, y: seed.y * rem || 0 }
}

export function nudgeFinished(elapsedMs: number, nudgeMs: number): boolean {
  return elapsedMs >= Math.max(1, nudgeMs)
}

/**
 * STRAIN — a grab on a LOCKED item. A single sideways there-and-back of
 * `px` (sin arc: 0 → px → 0), once per grab, that NEVER lifts. Returns
 * the screen-px x offset.
 */
export function strainOffset(elapsedMs: number, strainMs: number, px: number): number {
  const t = clamp01(elapsedMs / Math.max(1, strainMs))
  return px * Math.sin(Math.PI * t)
}

export function strainFinished(elapsedMs: number, strainMs: number): boolean {
  return elapsedMs >= Math.max(1, strainMs)
}

/**
 * PRESS — lock commit settles the body −`cap` into the desk over
 * `pressMs`, ease-out. Returns the scale multiplier (1 → 1−cap). A
 * locked item HOLDS at 1−cap after the press; the host applies that
 * steady state directly, so this is only the transition on the commit.
 */
export function pressScale(elapsedMs: number, pressMs: number, cap: number): number {
  const k = easeOutCubic(elapsedMs / Math.max(1, pressMs))
  return 1 - cap * k
}

export function pressFinished(elapsedMs: number, pressMs: number): boolean {
  return elapsedMs >= Math.max(1, pressMs)
}

/**
 * AWAY — delete lifts the body up and fades it over `awayMs`. NEVER a
 * crumple/shatter (§8.2: the trash keeps things whole). Rise eases out,
 * alpha falls linearly to 0. Returns a screen-px rise (negative y) and
 * an alpha multiplier.
 */
export function awayDisplay(
  elapsedMs: number,
  awayMs: number,
  risePx: number,
): { offsetY: number; alpha: number } {
  const t = clamp01(elapsedMs / Math.max(1, awayMs))
  // `|| 0` normalises the -0 at t=0 to +0.
  return { offsetY: -(risePx * easeOutCubic(t)) || 0, alpha: 1 - t }
}

export function awayFinished(elapsedMs: number, awayMs: number): boolean {
  return elapsedMs >= Math.max(1, awayMs)
}

/**
 * MAKE ROOM — the one allowed anticipatory motion: while a drag hovers a
 * frame, its members ease a small clearance outward and ease back on
 * clear. An exponential approach toward the live target (0 when not
 * hovered, `targetPx` when hovered) — framerate-independent, and it
 * snaps to the target within epsilon so the host loop idles (one-shot in
 * spirit: it converges and stops, never oscillates).
 */
export function approachClearance(
  currentPx: number,
  targetPx: number,
  deltaMs: number,
  tauMs: number,
): number {
  const k = 1 - Math.exp(-Math.max(0, deltaMs) / Math.max(1, tauMs))
  const next = currentPx + (targetPx - currentPx) * k
  return Math.abs(next - targetPx) < 0.01 ? targetPx : next
}
