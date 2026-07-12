/**
 * Load-from-library-into-frame plumbing (RFC-0001 §4.9 rev 0.38,
 * AI-IMP-129). The frame action does NOT build a new picker: it parks a
 * target frame, opens the EXISTING gallery takeover (§14.4), and lets
 * the gallery's ordinary place action run. When the gallery places with
 * a target parked, it fires `requestLoadIntoFrame` instead of the free
 * per-node placement — the board side (board-tooling) then places the
 * picked nodes captured into the frame and arranged to its drawn size,
 * as one compound undo.
 *
 * A parked target survives exactly one place; Escaping the gallery
 * without placing clears it (the caller resets on takeover close).
 */

export interface FrameLoadTarget {
  framePlacementId: string
  canvasId: string
}

let target: FrameLoadTarget | null = null

/** Park a frame as the destination for the next gallery place. */
export function beginFrameLoad(next: FrameLoadTarget): void {
  target = next
}

/** The parked target, or null when a normal place should run. */
export function pendingFrameLoad(): FrameLoadTarget | null {
  return target
}

/** Drop the parked target (place consumed it, or the gallery closed). */
export function clearFrameLoad(): void {
  target = null
}

export const LOAD_INTO_FRAME_EVENT = 'ew-load-into-frame'

export interface LoadIntoFrameRequest extends FrameLoadTarget {
  nodeIds: string[]
  groupToken: import('@ew/canvas-engine').CommandGroupToken
  complete: () => void
}

/** Gallery → board: place these picked nodes into the parked frame. */
export function requestLoadIntoFrame(
  detail: Omit<LoadIntoFrameRequest, 'complete'>,
): Promise<void> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<LoadIntoFrameRequest>(LOAD_INTO_FRAME_EVENT, {
        detail: { ...detail, complete: resolve },
      }),
    )
  })
}

export function onLoadIntoFrame(
  listener: (detail: LoadIntoFrameRequest) => Promise<boolean>,
): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<LoadIntoFrameRequest>).detail
    if (detail && Array.isArray(detail.nodeIds) && detail.nodeIds.length > 0) {
      void listener(detail).then((handled) => {
        if (handled) detail.complete()
      })
    }
  }
  window.addEventListener(LOAD_INTO_FRAME_EVENT, handler)
  return () => window.removeEventListener(LOAD_INTO_FRAME_EVENT, handler)
}
