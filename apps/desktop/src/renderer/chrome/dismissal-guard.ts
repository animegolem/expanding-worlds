/**
 * RFC §8.8.6: an outside pointer that dismisses a floating surface is a
 * dismissal, never also an action on the board/surface underneath it.
 *
 * Registrations form a stack: the most recently opened surface owns the
 * gesture. If the press is inside that surface (or its opener), lower
 * surfaces do not peel. Otherwise the guard dismisses exactly that surface
 * and consumes the complete pointerdown -> pointerup -> click sequence.
 */

export interface DismissibleSurface {
  contains(target: Node): boolean
  dismiss(): void
}

export interface OutsideDismissOptions {
  dismiss(): void
  exclude?: () => ReadonlyArray<Node | null | undefined>
}

interface SuppressedPointer {
  pointerId: number
  button: number
  released: boolean
  timer: ReturnType<typeof setTimeout>
}

const surfaces: DismissibleSurface[] = []
let suppressed: SuppressedPointer | null = null
let listening = false

function consume(event: Event): void {
  event.preventDefault()
  event.stopImmediatePropagation()
}

function pointerIdOf(event: Event): number | null {
  return 'pointerId' in event && typeof event.pointerId === 'number' ? event.pointerId : null
}

function clearSuppressed(): void {
  if (suppressed) clearTimeout(suppressed.timer)
  suppressed = null
  stopListening()
}

function suppressPointer(pointerId: number, button: number): void {
  clearSuppressed()
  const timer = setTimeout(clearSuppressed, 1_000)
  suppressed = { pointerId, button, released: false, timer }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  clearSuppressed()
  const surface = surfaces.at(-1)
  const target = event.target
  if (!surface || !(target instanceof Node) || surface.contains(target)) return
  suppressPointer(event.pointerId, event.button)
  surface.dismiss()
  consume(event)
}

function onPointerUp(event: PointerEvent): void {
  if (!suppressed || event.pointerId !== suppressed.pointerId) return
  suppressed.released = true
  consume(event)
}

function onClick(event: MouseEvent): void {
  if (!suppressed || !suppressed.released) return
  const pointerId = pointerIdOf(event)
  if (pointerId !== null && pointerId !== suppressed.pointerId) return
  if (pointerId === null && event.button !== suppressed.button) return
  consume(event)
  clearSuppressed()
}

function onPointerCancel(event: PointerEvent): void {
  if (suppressed?.pointerId === event.pointerId) clearSuppressed()
}

function startListening(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('pointercancel', onPointerCancel, true)
  document.addEventListener('click', onClick, true)
}

function stopListening(): void {
  // A dismissal commonly unmounts the last registered surface immediately.
  // Keep capture alive until that same physical gesture's up/click completes.
  if (!listening || surfaces.length > 0 || suppressed || typeof document === 'undefined') return
  listening = false
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('pointerup', onPointerUp, true)
  document.removeEventListener('pointercancel', onPointerCancel, true)
  document.removeEventListener('click', onClick, true)
}

/** Register an imperative surface (context menus and canvas furniture). */
export function registerDismissibleSurface(surface: DismissibleSurface): () => void {
  surfaces.push(surface)
  startListening()
  return () => {
    const index = surfaces.lastIndexOf(surface)
    if (index >= 0) surfaces.splice(index, 1)
    stopListening()
  }
}

/** Svelte action for a mounted surface; openers can be excluded explicitly. */
export function dismissOnOutside(node: HTMLElement, initial: OutsideDismissOptions) {
  let options = initial
  const surface: DismissibleSurface = {
    contains(target) {
      if (node.contains(target)) return true
      return options.exclude?.().some((excluded) => excluded?.contains(target)) ?? false
    },
    dismiss() {
      options.dismiss()
    },
  }
  const unregister = registerDismissibleSurface(surface)
  return {
    update(next: OutsideDismissOptions) {
      options = next
    },
    destroy: unregister,
  }
}
