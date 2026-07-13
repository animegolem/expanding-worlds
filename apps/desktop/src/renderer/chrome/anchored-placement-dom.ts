import {
  placeAnchored,
  type AnchoredPlacement,
  type AnchoredPlacementOptions,
  type PlacementSize,
} from './anchored-placement'
import { listenForReservationChanges, reservationFrame } from './reservation'

export type AnchoredElementOptions = Omit<AnchoredPlacementOptions, 'surface'> & {
  /** Authoritative measured result for pointer nubs and similar adornment.
   * Surface owners may decorate the result; they must not reposition it. */
  onplace?: (placement: AnchoredPlacement, surface: PlacementSize) => void
}
export type AnchoredElementResolver = () => AnchoredElementOptions

/** Svelte action that measures a surface; all geometry stays in the pure helper. */
export function placeAnchoredElement(
  node: HTMLElement,
  resolve: AnchoredElementResolver,
): { update: (next: AnchoredElementResolver) => void; destroy: () => void } {
  let current = resolve
  let disposed = false

  const place = (): void => {
    if (disposed || !node.isConnected) return
    const measured = node.getBoundingClientRect()
    const options = current()
    const { onplace, ...placementOptions } = options
    const frame = reservationFrame(options.host)
    const customBands = options.bands !== undefined
    const at = placeAnchored({
      ...placementOptions,
      bands: options.bands ?? frame.bands,
      margin: customBands ? options.margin : frame.gutter,
      surface: { width: measured.width, height: measured.height },
    })
    node.style.left = `${at.x}px`
    node.style.top = `${at.y}px`
    onplace?.(at, { width: measured.width, height: measured.height })
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
  observer?.observe(node)
  window.addEventListener('resize', place)
  const stopReservation = listenForReservationChanges(place)
  queueMicrotask(place)

  return {
    update(next) {
      current = next
      place()
    },
    destroy() {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', place)
      stopReservation()
    },
  }
}
