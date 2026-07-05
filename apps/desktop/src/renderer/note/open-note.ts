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
