import { uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { toast } from '../chrome/status'
import { onTakeoverChanged } from '../chrome/takeover'

/**
 * Place mode (RFC §14.4 "the everything-scope pull", AI-IMP-115): the
 * tail of the pull gesture; B1 board birth reuses the same cursor and
 * capture lifecycle with a ⊡ ghost. The gallery has already ingested the item
 * (or recognized an existing node) and closed the takeover; it now
 * dispatches ONE request and the board takes over — a ghosted preview
 * follows the cursor over the host, a click commits an ordinary
 * CreatePlacement at that world point, and Escape leaves the node
 * stored-but-unplaced with a toast naming where it went. Birth remains
 * renderer-only until seating; Escape is silent, and refusal stays inline.
 *
 * §8.8: the ghost is CHROME — pointer-events:none, it never occludes a
 * board interaction. Selection is suspended for the mode's duration by
 * the simplest possible means: the placement pointerdown is caught in
 * the CAPTURE phase on the host element (which is an ancestor of the
 * canvas that owns the gesture listeners), stopped there, and consumed
 * as the placement — the board's own select/drag gesture never begins.
 */

export const PLACE_MODE_EVENT = 'ew-place-mode'
const PLACE_MODE_FINISH_EVENT = 'ew-place-mode-finish'

export interface GalleryPlaceModeRequest {
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

export interface BoardBirthPlaceModeRequest {
  kind: 'board-birth'
  /** Initial ghost position before the pointer moves. */
  worldX: number
  worldY: number
  /** Commit at the seating point. A refusal keeps this request active. */
  commit: (world: { x: number; y: number }) => Promise<{ ok: true } | { ok: false; message: string }>
  /** Renderer-only carry cancellation (Escape, secondary click, takeover). */
  cancel: () => void
}

export type PlaceModeRequest = GalleryPlaceModeRequest | BoardBirthPlaceModeRequest

export function requestPlaceMode(detail: PlaceModeRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceModeRequest>(PLACE_MODE_EVENT, { detail }))
}

/** Complete a carry from an out-of-band door such as Restore/Keep both. */
export function finishPlaceMode(): void {
  window.dispatchEvent(new Event(PLACE_MODE_FINISH_EVENT))
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
  let ghost: HTMLElement | null = null
  let failure: HTMLSpanElement | null = null
  let seating = false

  const isBirth = (request: PlaceModeRequest): request is BoardBirthPlaceModeRequest =>
    'kind' in request && request.kind === 'board-birth'

  function positionGhost(clientX: number, clientY: number): void {
    if (!ghost) return
    const bounds = element.getBoundingClientRect()
    ghost.style.left = `${clientX - bounds.left}px`
    ghost.style.top = `${clientY - bounds.top}px`
    if (failure) {
      failure.style.left = `${clientX - bounds.left}px`
      failure.style.top = `${clientY - bounds.top}px`
    }
  }

  function exit(): void {
    if (active === null) return
    active = null
    ghost?.remove()
    ghost = null
    failure?.remove()
    failure = null
    seating = false
    window.removeEventListener('pointermove', onPointerMove, true)
    element.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
  }

  function cancel(): void {
    const request = active
    const birth = request !== null && isBirth(request)
    exit()
    if (birth) request.cancel()
  }

  const onPointerMove = (event: PointerEvent): void => {
    positionGhost(event.clientX, event.clientY)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (active === null || seating) return
    // Secondary buttons cancel the placement, keeping the node stored.
    if (event.button !== 0) {
      event.preventDefault()
      event.stopPropagation()
      const birth = isBirth(active)
      if (birth) cancel()
      else exit()
      if (!birth) toast('Stored in this world — unplaced', { surface: 'gallery-actions' })
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
    if (isBirth(req)) {
      seating = true
      void req.commit(world).then(
        (result) => {
          seating = false
          if (active !== req) return
          if (result.ok) {
            exit()
            return
          }
          if (failure) failure.textContent = result.message
        },
        () => {
          seating = false
          if (active === req && failure)
            failure.textContent = 'the board could not be created — try seating it again'
        },
      )
      return
    }
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
    const birth = isBirth(active)
    if (birth) cancel()
    else exit()
    if (!birth) toast('Stored in this world — unplaced', { surface: 'gallery-actions' })
  }

  const onRequest = (event: Event): void => {
    const detail = (event as CustomEvent<PlaceModeRequest>).detail
    if (!detail) return
    if (!isBirth(detail) && (typeof detail.nodeId !== 'string' || detail.nodeId.length === 0)) return
    // A fresh request replaces any live ghost (no stuck ghost).
    exit()
    active = detail
    const birth = isBirth(detail)
    const visual = birth ? document.createElement('span') : document.createElement('img')
    visual.dataset['testid'] = birth ? 'board-birth-ghost' : 'place-mode-ghost'
    if (!isBirth(detail) && visual instanceof HTMLImageElement) {
      visual.draggable = false
      visual.src = `ew-asset://${detail.contentHash}/thumb`
      visual.addEventListener('error', () => {
        if (visual.dataset['fallback'] === '1') return
        visual.dataset['fallback'] = '1'
        visual.src = `ew-asset://${detail.contentHash}`
      })
    } else {
      visual.textContent = '⊡'
    }
    visual.style.cssText =
      // rung: popover — the ghost rides above panels/chrome and below modals; §8.8's only band above chrome and under modal.
      `position:absolute;z-index:${Z.popover};width:120px;height:120px;object-fit:contain;` +
      'transform:translate(-50%,-50%);pointer-events:none;opacity:0.7;' +
      'filter:drop-shadow(0 4px 12px var(--ew-shadow));display:flex;align-items:center;justify-content:center;font-size:48px;color:var(--ew-text);'
    ghost = visual
    element.appendChild(visual)
    const bounds = element.getBoundingClientRect()
    const initial = birth
      ? host.controller.camera.worldToScreen({ x: detail.worldX, y: detail.worldY })
      : { x: detail.clientX - bounds.left, y: detail.clientY - bounds.top }
    positionGhost(initial.x + bounds.left, initial.y + bounds.top)
    if (birth) {
      const line = document.createElement('span')
      line.dataset['testid'] = 'board-birth-error'
      line.style.cssText =
        `position:absolute;z-index:${Z.popover};pointer-events:none;color:var(--ew-danger);` +
        'transform:translate(12px,68px);font-size:12px;max-width:260px;'
      failure = line
      element.appendChild(line)
      positionGhost(initial.x + bounds.left, initial.y + bounds.top)
    }
    window.addEventListener('pointermove', onPointerMove, true)
    element.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
  }

  window.addEventListener(PLACE_MODE_EVENT, onRequest)
  window.addEventListener(PLACE_MODE_FINISH_EVENT, exit)
  // Reopening a takeover mid-mode abandons the placement cleanly — the
  // ghost must never linger over another surface (§8.8).
  const offTakeover = onTakeoverChanged((kind) => {
    if (kind !== null) cancel()
  })

  return {
    destroy() {
      window.removeEventListener(PLACE_MODE_EVENT, onRequest)
      window.removeEventListener(PLACE_MODE_FINISH_EVENT, exit)
      offTakeover()
      exit()
    },
  }
}
