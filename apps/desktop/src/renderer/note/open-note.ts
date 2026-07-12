import {
  hitTest,
  placementSize,
  LABEL_HEIGHT_RATIO,
  type SceneItem,
  type ScenePlacement,
} from '@ew/canvas-engine'
import { navigateTo } from '../chrome/navigation'
import { Z } from '../z'
import type { CanvasHostHandle } from '../canvas/host'

/**
 * Open-note plumbing (AI-IMP-044): surfaces anywhere in the app
 * request a note by dispatching one window-level event; the note
 * pane is the single listener. Canvas entry point: select-tool
 * double-click on a placement whose node references a note (text
 * decorations keep their own dblclick editor — that handler checks
 * first and this one ignores non-placements).
 */

export const OPEN_NOTE_EVENT = 'ew-open-note'

/** §8.5: where the tethered panel should anchor — the placement the
 * open request came from, when the caller knows one. */
export interface OpenNoteAnchor {
  canvasId: string
  placementId: string
  label?: string
}

export interface OpenNoteDetail {
  noteId: string
  anchor?: OpenNoteAnchor
}

export function requestOpenNote(noteId: string, anchor?: OpenNoteAnchor): void {
  window.dispatchEvent(
    new CustomEvent<OpenNoteDetail>(OPEN_NOTE_EVENT, {
      detail: { noteId, ...(anchor ? { anchor } : {}) },
    }),
  )
}

export function onOpenNote(
  listener: (noteId: string, anchor?: OpenNoteAnchor) => void,
): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<OpenNoteDetail>).detail
    if (detail?.noteId) listener(detail.noteId, detail.anchor)
  }
  window.addEventListener(OPEN_NOTE_EVENT, handler)
  return () => window.removeEventListener(OPEN_NOTE_EVENT, handler)
}

/** Activating an unresolved token opens the phantom view (§7.2). */
export const OPEN_PHANTOM_EVENT = 'ew-open-phantom'

export interface OpenPhantomDetail {
  /** Raw token title; queries normalize to title_key. */
  title: string
}

export function requestOpenPhantom(title: string): void {
  window.dispatchEvent(new CustomEvent<OpenPhantomDetail>(OPEN_PHANTOM_EVENT, { detail: { title } }))
}

export function onOpenPhantom(listener: (title: string) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<OpenPhantomDetail>).detail
    if (detail?.title) listener(detail.title)
  }
  window.addEventListener(OPEN_PHANTOM_EVENT, handler)
  return () => window.removeEventListener(OPEN_PHANTOM_EVENT, handler)
}

/**
 * Create and Place on Current Canvas (§7.2 action 3): the pane
 * requests, the workspace — which owns the active canvas and view
 * center — commits the CreatePin and opens the created note.
 */
export const CREATE_AND_PLACE_EVENT = 'ew-create-and-place'

export interface CreateAndPlaceDetail {
  title: string
  /** Phantom draft content — must not be dropped (§7.2, AI-IMP-058). */
  body?: string
}

export function requestCreateAndPlace(title: string, body?: string): void {
  window.dispatchEvent(
    new CustomEvent<CreateAndPlaceDetail>(CREATE_AND_PLACE_EVENT, {
      detail: { title, ...(body !== undefined && body.length > 0 ? { body } : {}) },
    }),
  )
}

export function onCreateAndPlace(listener: (detail: CreateAndPlaceDetail) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<CreateAndPlaceDetail>).detail
    if (detail?.title) listener(detail)
  }
  window.addEventListener(CREATE_AND_PLACE_EVENT, handler)
  return () => window.removeEventListener(CREATE_AND_PLACE_EVENT, handler)
}

/**
 * Rename requests from surfaces that don't own the editor buffer
 * (node menu). The note pane handles them so the §10.2 dirty-buffer
 * flush ALWAYS precedes the rewrite, whatever surface asked.
 */
export const RENAME_NOTE_EVENT = 'ew-rename-note'

export interface RenameNoteDetail {
  noteId: string
  title: string
}

export function requestRenameNote(noteId: string, title: string): void {
  window.dispatchEvent(
    new CustomEvent<RenameNoteDetail>(RENAME_NOTE_EVENT, { detail: { noteId, title } }),
  )
}

export function onRenameNote(listener: (detail: RenameNoteDetail) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<RenameNoteDetail>).detail
    if (detail?.noteId && detail.title) listener(detail)
  }
  window.addEventListener(RENAME_NOTE_EVENT, handler)
  return () => window.removeEventListener(RENAME_NOTE_EVENT, handler)
}

/**
 * §7.3 spatial half of bound-link activation: text already resolved
 * (the pane loaded the note); the workspace resolves space by
 * location count — center-and-highlight for exactly one location on
 * the active canvas, a non-blocking notice otherwise.
 */
export const REVEAL_NOTE_EVENT = 'ew-reveal-note'

export interface RevealNoteDetail {
  noteId: string
  title: string
  /** Client coords of the activated link, so the §7.3 location
   * chooser can anchor to it (AI-IMP-065). */
  anchor?: { x: number; y: number }
}

export function requestRevealNote(
  noteId: string,
  title: string,
  anchor?: { x: number; y: number },
): void {
  window.dispatchEvent(
    new CustomEvent<RevealNoteDetail>(REVEAL_NOTE_EVENT, {
      detail: { noteId, title, ...(anchor ? { anchor } : {}) },
    }),
  )
}

export function onRevealNote(listener: (detail: RevealNoteDetail) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<RevealNoteDetail>).detail
    if (detail?.noteId) listener(detail)
  }
  window.addEventListener(REVEAL_NOTE_EVENT, handler)
  return () => window.removeEventListener(REVEAL_NOTE_EVENT, handler)
}

/** Generic single-id workspace requests (AI-IMP-049): the note pane
 * and node menu ask; the surface that owns the canvas answers. */
function idEvent(eventName: string): {
  request: (id: string) => void
  on: (listener: (id: string) => void) => () => void
} {
  return {
    request(id: string): void {
      window.dispatchEvent(new CustomEvent<{ id: string }>(eventName, { detail: { id } }))
    },
    on(listener: (id: string) => void): () => void {
      const handler = (event: Event): void => {
        const detail = (event as CustomEvent<{ id: string }>).detail
        if (detail?.id) listener(detail.id)
      }
      window.addEventListener(eventName, handler)
      return () => window.removeEventListener(eventName, handler)
    },
  }
}

/** Node menu → CanvasHost: open the attach-note picker for a node. */
const attachNote = idEvent('ew-attach-note')
export const requestAttachNote = attachNote.request
export const onAttachNote = attachNote.on

/** Uses sidebar → Workspace: place an existing node at view center
 * (§6.10 first half — ordinary CreatePlacement). */
const placeNode = idEvent('ew-place-node')
export const requestPlaceNode = placeNode.request
export const onPlaceNode = placeNode.on

export interface PlaceNodesRequest {
  nodeIds: string[]
  groupToken: import('@ew/canvas-engine').CommandGroupToken
  complete: () => void
}

const PLACE_NODES_EVENT = 'ew-place-nodes'

/** Gallery bulk place: completion keeps its undo group open until every
 * gateway result has settled. */
export function requestPlaceNodes(
  nodeIds: readonly string[],
  groupToken: import('@ew/canvas-engine').CommandGroupToken,
): Promise<void> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<PlaceNodesRequest>(PLACE_NODES_EVENT, {
        detail: { nodeIds: [...nodeIds], groupToken, complete: resolve },
      }),
    )
  })
}

export function onPlaceNodes(listener: (request: PlaceNodesRequest) => Promise<void>): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<PlaceNodesRequest>).detail
    if (!detail || detail.nodeIds.length === 0) return
    void listener(detail).finally(detail.complete)
  }
  window.addEventListener(PLACE_NODES_EVENT, handler)
  return () => window.removeEventListener(PLACE_NODES_EVENT, handler)
}

/** Uses sidebar → Workspace: embody a zero-node note at view center
 * (§6.10 second half — CreatePin with note attach). */
const placeNote = idEvent('ew-place-note')
export const requestPlaceNote = placeNote.request
export const onPlaceNote = placeNote.on

/** Uses sidebar → Workspace: select placements and fly to them. */
export const CENTER_PLACEMENTS_EVENT = 'ew-center-placements'

export function requestCenterPlacements(placementIds: string[]): void {
  window.dispatchEvent(
    new CustomEvent<{ placementIds: string[] }>(CENTER_PLACEMENTS_EVENT, {
      detail: { placementIds },
    }),
  )
}

export function onCenterPlacements(listener: (placementIds: string[]) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<{ placementIds: string[] }>).detail
    if (detail?.placementIds?.length) listener(detail.placementIds)
  }
  window.addEventListener(CENTER_PLACEMENTS_EVENT, handler)
  return () => window.removeEventListener(CENTER_PLACEMENTS_EVENT, handler)
}

export interface OpenNoteSurfaceHandle {
  destroy(): void
}

/**
 * The label band hangs BELOW the placement body (outside its hit
 * AABB), mirroring the renderer's layout: fontSize = worldHeight ×
 * LABEL_HEIGHT_RATIO, top edge at height/2 + fontSize × 0.35 below
 * center. Rotated or flipped placements are skipped — their label
 * geometry is transformed and Phase 1 falls back to opening the note.
 */
function labelBandHit(
  world: { x: number; y: number },
  items: readonly SceneItem[],
): ScenePlacement | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!
    if (item.itemKind !== 'placement') continue
    if (item.labelVisible !== 1 || item.noteTitle == null) continue
    if ((item.rotation ?? 0) !== 0 || item.flipX === 1 || item.flipY === 1) continue
    const size = placementSize(item)
    const fontSize = size.height * LABEL_HEIGHT_RATIO
    const top = item.y + size.height / 2 + fontSize * 0.35
    const halfWidth = Math.max(size.width / 2, fontSize * 4)
    if (
      world.x >= item.x - halfWidth &&
      world.x <= item.x + halfWidth &&
      world.y >= top &&
      world.y <= top + fontSize * 1.3
    ) {
      return item
    }
  }
  return null
}

export function attachOpenNoteSurface(
  host: CanvasHostHandle,
  element: HTMLElement,
): OpenNoteSurfaceHandle {
  let renameInput: HTMLInputElement | null = null

  function closeRename(): void {
    renameInput?.remove()
    renameInput = null
  }

  /** Inline title editor over the label (§4.5/AI-IMP-056): Enter or
   * blur commits through the pane's rename seam (flush ordering,
   * §7.7 conflicts), Escape cancels. */
  function openRename(placement: ScenePlacement, noteId: string): void {
    closeRename()
    const size = placementSize(placement)
    const fontSize = size.height * LABEL_HEIGHT_RATIO
    const screen = host.controller.camera.worldToScreen({
      x: placement.x,
      y: placement.y + size.height / 2 + fontSize * 0.35,
    })
    const input = document.createElement('input')
    input.type = 'text'
    input.value = placement.noteTitle ?? ''
    input.dataset['testid'] = 'label-rename-input'
    input.style.cssText =
      `position:absolute;left:${screen.x - 100}px;top:${screen.y}px;width:200px;z-index:${Z.panel};` +
      'padding:2px 6px;font:inherit;text-align:center;background:var(--ew-surface-solid);color:var(--ew-text-dialog);' +
      'border:1px solid var(--ew-border-control);border-radius:3px;'
    let done = false
    const finish = (commit: boolean): void => {
      if (done) return
      done = true
      const title = input.value.trim()
      if (commit && title.length > 0 && title !== placement.noteTitle) {
        requestRenameNote(noteId, title)
      }
      closeRename()
    }
    input.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') finish(true)
      if (event.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
    element.appendChild(input)
    renameInput = input
    setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
  }

  const onDblClick = (event: MouseEvent): void => {
    if (host.tools.active !== 'select') return
    const bounds = element.getBoundingClientRect()
    const world = host.controller.camera.screenToWorld({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
    const items = host.controller.items()
    const hit = hitTest(world, items)
    const target =
      hit && hit.itemKind === 'placement'
        ? { placement: hit, rename: false }
        : (() => {
            const label = labelBandHit(world, items)
            return label ? { placement: label, rename: true } : null
          })()
    if (!target) return
    const { noteId, childCanvasId, noteTitle } = target.placement
    if (target.rename) {
      if (noteId) openRename(target.placement, noteId)
      return
    }
    // §8.4 double-click = EVERYTHING: dive into the canvas AND open
    // its note; a note-only node opens the note, a canvas-only node
    // dives. Charms are the exploded view of this gesture.
    if (childCanvasId) void navigateTo(childCanvasId, noteTitle ?? 'Board')
    if (noteId) requestOpenNote(noteId)
  }
  element.addEventListener('dblclick', onDblClick)
  return {
    destroy() {
      closeRename()
      element.removeEventListener('dblclick', onDblClick)
    },
  }
}
