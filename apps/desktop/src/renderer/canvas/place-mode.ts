import { uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from './host'
import { toast } from '../chrome/status'
import { onTakeoverChanged } from '../chrome/takeover'

/**
 * Place mode (RFC §14.4 "the everything-scope pull", AI-IMP-115): the
 * tail of the pull gesture. The gallery has already ingested the item
 * (or recognized an existing node) and closed the takeover; it now
 * dispatches ONE request and the board takes over — a ghosted preview
 * follows the cursor over the host, a click commits an ordinary
 * CreatePlacement at that world point, and Escape leaves the node
 * stored-but-unplaced with a toast naming where it went.
 *
 * §8.8: the ghost is CHROME — pointer-events:none, it never occludes a
 * board interaction. Selection is suspended for the mode's duration by
 * the simplest possible means: the placement pointerdown is caught in
 * the CAPTURE phase on the host element (which is an ancestor of the
 * canvas that owns the gesture listeners), stopped there, and consumed
 * as the placement — the board's own select/drag gesture never begins.
 */

export const PLACE_MODE_EVENT = 'ew-place-mode'

export interface PlaceModeRequest {
  /** The ingested (or recognized) THIS-WORLD node to place. */
  nodeId: string
  /** Content hash for the ghost preview — bytes live in the primary
   * store post-ingest, so this resolves through ordinary ew-asset. */
  contentHash: string
  /** Where the pull gesture ended, so the ghost seats under the cursor
   * before the first pointermove (client coordinates). */
  clientX: number
  clientY: number
}

export function requestPlaceMode(detail: PlaceModeRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceModeRequest>(PLACE_MODE_EVENT, { detail }))
}

export interface PlaceModeHandle {
  destroy(): void
}

function describeFailure(result: CommandResult): string {
  if (result.status === 'error') return `Pull failed: ${result.message}`
  if (result.status === 'conflict') return 'Pull failed: the project changed underneath (retry)'
  return `Pull failed: ${result.status}`
}

export function attachPlaceMode(host: CanvasHostHandle, element: HTMLElement): PlaceModeHandle {
  let active: PlaceModeRequest | null = null
  let ghost: HTMLImageElement | null = null

  function positionGhost(clientX: number, clientY: number): void {
    if (!ghost) return
    const bounds = element.getBoundingClientRect()
    ghost.style.left = `${clientX - bounds.left}px`
    ghost.style.top = `${clientY - bounds.top}px`
  }

  function exit(): void {
    if (active === null) return
    active = null
    ghost?.remove()
    ghost = null
    window.removeEventListener('pointermove', onPointerMove, true)
    element.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
  }

  const onPointerMove = (event: PointerEvent): void => {
    positionGhost(event.clientX, event.clientY)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (active === null) return
    // Secondary buttons cancel the placement, keeping the node stored.
    if (event.button !== 0) {
      event.preventDefault()
      event.stopPropagation()
      exit()
      toast('Stored in this world — unplaced', { surface: 'gallery-actions' })
      return
    }
    // Suspend the board's own gesture: catch the press in capture on
    // the ancestor, so the canvas' pointerdown listener never fires.
    event.preventDefault()
    event.stopPropagation()
    const req = active
    const bounds = element.getBoundingClientRect()
    const world = host.controller.camera.screenToWorld({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
    exit()
    void host.gateway
      .execute('CreatePlacement', {
        placementId: uuidv7(),
        canvasId: host.canvasId,
        nodeId: req.nodeId,
        x: world.x,
        y: world.y,
      })
      .then(
        (result) => {
          if (result.status !== 'committed') {
            toast(describeFailure(result), {
              kind: 'error',
              sticky: true,
              surface: 'import-error',
              dismissTestid: 'import-error-dismiss',
            })
          }
        },
        () =>
          toast('Pull failed: the placement could not be committed (retry)', {
            kind: 'error',
            sticky: true,
            surface: 'import-error',
            dismissTestid: 'import-error-dismiss',
          }),
      )
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (active === null || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    exit()
    toast('Stored in this world — unplaced', { surface: 'gallery-actions' })
  }

  const onRequest = (event: Event): void => {
    const detail = (event as CustomEvent<PlaceModeRequest>).detail
    if (!detail || typeof detail.nodeId !== 'string' || detail.nodeId.length === 0) return
    // A fresh request replaces any live ghost (no stuck ghost).
    exit()
    active = detail
    const img = document.createElement('img')
    img.dataset['testid'] = 'place-mode-ghost'
    img.draggable = false
    img.src = `ew-asset://${detail.contentHash}/thumb`
    // 076's contract: a missing thumbnail 404s → the original bytes,
    // once (the flag stops an error loop).
    img.addEventListener('error', () => {
      if (img.dataset['fallback'] === '1') return
      img.dataset['fallback'] = '1'
      img.src = `ew-asset://${detail.contentHash}`
    })
    img.style.cssText =
      'position:absolute;z-index:480;width:120px;height:120px;object-fit:contain;' +
      'transform:translate(-50%,-50%);pointer-events:none;opacity:0.7;' +
      'filter:drop-shadow(0 4px 12px var(--ew-shadow));'
    ghost = img
    element.appendChild(img)
    positionGhost(detail.clientX, detail.clientY)
    window.addEventListener('pointermove', onPointerMove, true)
    element.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
  }

  window.addEventListener(PLACE_MODE_EVENT, onRequest)
  // Reopening a takeover mid-mode abandons the placement cleanly — the
  // ghost must never linger over another surface (§8.8).
  const offTakeover = onTakeoverChanged((kind) => {
    if (kind !== null) exit()
  })

  return {
    destroy() {
      window.removeEventListener(PLACE_MODE_EVENT, onRequest)
      offTakeover()
      exit()
    },
  }
}
