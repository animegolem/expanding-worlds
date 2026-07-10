import {
  placeAnchored,
  type AnchoredPlacementOptions,
} from './anchored-placement'

export type AnchoredElementOptions = Omit<AnchoredPlacementOptions, 'surface'>
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
    const at = placeAnchored({
      ...current(),
      surface: { width: measured.width, height: measured.height },
    })
    node.style.left = `${at.x}px`
    node.style.top = `${at.y}px`
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
  observer?.observe(node)
  window.addEventListener('resize', place)
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
    },
  }
}
