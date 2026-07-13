/** The canvas SELF has one canonical surface. Other chrome may point at it
 * without owning or duplicating the panel. */
export const OPEN_IDENTITY_EVENT = 'ew-open-identity'

export function requestOpenIdentity(): void {
  window.dispatchEvent(new Event(OPEN_IDENTITY_EVENT))
}

export function onOpenIdentity(listener: () => void): () => void {
  window.addEventListener(OPEN_IDENTITY_EVENT, listener)
  return () => window.removeEventListener(OPEN_IDENTITY_EVENT, listener)
}
