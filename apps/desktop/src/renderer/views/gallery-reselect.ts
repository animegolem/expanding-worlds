/** Stable renderer receipt seam for bulk gallery undo (RFC §9.7 rev 0.70).
 * The undo stack must not retain a destroyed component closure; a currently
 * mounted gallery may accept the request, otherwise re-selection is a no-op. */

type Listener = (nodeIds: readonly string[]) => Promise<void> | void

const listeners = new Set<Listener>()

export function onGalleryReselect(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function requestGalleryReselect(nodeIds: readonly string[]): Promise<void> {
  for (const listener of listeners) await listener(nodeIds)
}
