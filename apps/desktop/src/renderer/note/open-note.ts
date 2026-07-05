import { hitTest } from '@ew/canvas-engine'
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

export interface OpenNoteDetail {
  noteId: string
}

export function requestOpenNote(noteId: string): void {
  window.dispatchEvent(new CustomEvent<OpenNoteDetail>(OPEN_NOTE_EVENT, { detail: { noteId } }))
}

export function onOpenNote(listener: (noteId: string) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<OpenNoteDetail>).detail
    if (detail?.noteId) listener(detail.noteId)
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
}

export function requestCreateAndPlace(title: string): void {
  window.dispatchEvent(
    new CustomEvent<CreateAndPlaceDetail>(CREATE_AND_PLACE_EVENT, { detail: { title } }),
  )
}

export function onCreateAndPlace(listener: (title: string) => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<CreateAndPlaceDetail>).detail
    if (detail?.title) listener(detail.title)
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

export interface OpenNoteSurfaceHandle {
  destroy(): void
}

export function attachOpenNoteSurface(
  host: CanvasHostHandle,
  element: HTMLElement,
): OpenNoteSurfaceHandle {
  const onDblClick = (event: MouseEvent): void => {
    if (host.tools.active !== 'select') return
    const bounds = element.getBoundingClientRect()
    const world = host.controller.camera.screenToWorld({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
    const hit = hitTest(world, host.controller.items())
    if (!hit || hit.itemKind !== 'placement') return
    void (async () => {
      const response = await window.ew.project.query('getNode', { nodeId: hit.nodeId })
      if (!response.ok) return
      const node = response.result as { noteId: string | null } | null
      if (node?.noteId) requestOpenNote(node.noteId)
    })()
  }
  element.addEventListener('dblclick', onDblClick)
  return {
    destroy() {
      element.removeEventListener('dblclick', onDblClick)
    },
  }
}
