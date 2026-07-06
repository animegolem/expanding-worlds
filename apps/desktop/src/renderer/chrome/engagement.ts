/**
 * Engagement cadence (RFC §8.2): one shared fade clock for the whole
 * chrome layer. Engaged while the cursor is in the window and moving;
 * disengaged when it leaves or rests beyond the idle delay. Everything
 * chrome subscribes to THIS store — any element fading on its own
 * clock is a bug by definition.
 *
 * Node charms (AI-IMP-063) consume the same store from the canvas
 * adornment pass via `isEngaged()`.
 */
import { CHROME_FADE_DELAY_MS } from './feel'

type Listener = (engaged: boolean) => void

let engaged = true
let held = false
let idleTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<Listener>()
let attached = false

function set(next: boolean): void {
  if (engaged === next) return
  engaged = next
  for (const listener of listeners) listener(engaged)
}

function poke(): void {
  set(true)
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = held ? null : setTimeout(() => set(false), CHROME_FADE_DELAY_MS)
}

function leave(): void {
  if (held) return
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  set(false)
}

function attach(): void {
  if (attached) return
  // Unit tests exercise consumers (status.ts) under node — engagement
  // is a browser concern and stays inert without a window.
  if (typeof window === 'undefined') return
  attached = true
  window.addEventListener('pointermove', poke, { passive: true, capture: true })
  window.addEventListener('pointerdown', poke, { passive: true, capture: true })
  window.addEventListener('wheel', poke, { passive: true, capture: true })
  window.addEventListener('keydown', poke, { capture: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('blur', leave)
  // Deterministic cadence control for hidden-window e2e, where no OS
  // cursor ever enters or leaves the window.
  window.addEventListener('ew-test-set-engagement', ((event: Event) => {
    const wanted = (event as CustomEvent<{ engaged: boolean }>).detail.engaged
    if (wanted) poke()
    else leave()
  }) as EventListener)
  poke()
}

/** Programmatic engagement: something demands attention NOW (§11.4 —
 * an ongoing condition arriving while the board is wallpaper must
 * not fade in silence). Same effect as the user moving the mouse. */
export function wake(): void {
  attach()
  poke()
}

/** §8.2 takeovers suspend the fade clock: a takeover is an active
 * mode and the chrome under it never fades. Hold pins engagement
 * on; releasing resumes the normal cadence from now. */
export function holdEngagement(hold: boolean): void {
  attach()
  held = hold
  poke()
}

/** Subscribe to engagement changes; fires immediately with the
 * current state and returns an unsubscribe. */
export function onEngagementChanged(listener: Listener): () => void {
  attach()
  listeners.add(listener)
  listener(engaged)
  return () => listeners.delete(listener)
}

export function isEngaged(): boolean {
  attach()
  return engaged
}
