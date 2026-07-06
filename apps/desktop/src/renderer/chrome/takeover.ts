/**
 * Takeover framework (RFC §8.2, AI-IMP-068): project-global views
 * take over the window. At most ONE takeover is active; entry is a
 * rail charm (or ☰ menu entry), return is Esc or the originating
 * control, and the canvas camera is untouched by the round trip —
 * a takeover is DOM above the board, never a flight.
 *
 * Board input scoping: while a takeover is open the board's
 * keyboard and pointer shortcuts must not act underneath it. Every
 * board shortcut seam (dock tool keys, gesture keys, host
 * space-pan/escape, nav keys and buttons, bookmark digits) guards
 * on `takeoverActive()` — explicit and greppable rather than
 * event-order tricks.
 */

export type TakeoverKind = 'outline' | 'settings' | 'gallery'

type Listener = (kind: TakeoverKind | null) => void

let active: TakeoverKind | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener(active)
}

export function openTakeover(kind: TakeoverKind): void {
  if (active === kind) return
  active = kind
  notify()
}

export function closeTakeover(): void {
  if (active === null) return
  active = null
  notify()
}

/** Charm click grammar: the originating control toggles its view. */
export function toggleTakeover(kind: TakeoverKind): void {
  if (active === kind) closeTakeover()
  else openTakeover(kind)
}

export function activeTakeover(): TakeoverKind | null {
  return active
}

export function takeoverActive(): boolean {
  return active !== null
}

/** Subscribe; fires immediately with the current state. */
export function onTakeoverChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(active)
  return () => listeners.delete(listener)
}
