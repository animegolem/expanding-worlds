/**
 * One renderer-session tag-lens identity coordinator (AI-IMP-298).
 *
 * The engine deliberately knows only placement ids. This module owns the
 * missing semantic half — which tag those ids represent — so the tag
 * panel, canvas chips, note-paper chips, and active-lens chip all drive
 * exactly the same view state. No command or persistence write crosses
 * this seam.
 */
import type { CanvasHostHandle } from '../canvas/host'

export interface TagLensState {
  tagId: string
  name: string
  placementIds: string[]
}

type Listener = (state: TagLensState | null) => void

let host: CanvasHostHandle | null = null
let current: TagLensState | null = null
let requestGeneration = 0
let detachHost: (() => void) | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener(current)
}

function clearIdentity(): void {
  if (current === null) return
  current = null
  notify()
}

/** Bind the window's one live canvas host. Engine-side Escape / scene
 * intersection clears flow back into the semantic state immediately. */
export function bindTagLensHost(next: CanvasHostHandle): () => void {
  detachHost?.()
  host = next
  const offLens = next.onLensChanged((ids) => {
    if (ids === null) clearIdentity()
  })
  detachHost = () => {
    offLens()
    if (host === next) {
      host = null
      clearIdentity()
    }
  }
  return detachHost
}

export function tagLensState(): TagLensState | null {
  return current ? { ...current, placementIds: [...current.placementIds] } : null
}

export function onTagLensChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(tagLensState())
  return () => listeners.delete(listener)
}

export function clearTagLens(): void {
  requestGeneration += 1
  const bound = host
  if (bound && bound.lens() !== null) bound.clearLens()
  else clearIdentity()
}

/** Apply already-known active-canvas members (the TagPanel fast path). */
export function engageTagLensMembers(
  tag: { id: string; name: string },
  placementIds: readonly string[],
): boolean {
  const bound = host
  const ids = [...new Set(placementIds)]
  if (!bound || ids.length === 0) {
    clearTagLens()
    return false
  }
  requestGeneration += 1
  current = { tagId: tag.id, name: tag.name, placementIds: ids }
  bound.setLens(ids)
  notify()
  return true
}

/** Resolve members for doors that know tag identity but do not already
 * own the tag-view projection (canvas and note-paper chips). */
export async function engageTagLens(tag: { id: string; name: string }): Promise<boolean> {
  const bound = host
  if (!bound) return false
  const canvasId = bound.canvasId
  const generation = ++requestGeneration
  const response = await window.ew.project.query('getTagView', { tagId: tag.id })
  if (generation !== requestGeneration || host !== bound || !response.ok) return false
  const view = response.result as
    | {
        tag: { id: string; name: string }
        nodes: Array<{ placements: Array<{ placementId: string; canvasId: string }> }>
      }
    | null
  if (!view) {
    clearTagLens()
    return false
  }
  const ids = view.nodes.flatMap((node) =>
    node.placements
      .filter((placement) => placement.canvasId === canvasId)
      .map((placement) => placement.placementId),
  )
  return engageTagLensMembers({ id: view.tag.id, name: view.tag.name }, ids)
}

export function toggleTagLensMembers(
  tag: { id: string; name: string },
  placementIds: readonly string[],
): boolean {
  if (current?.tagId === tag.id && host?.lens() !== null) {
    clearTagLens()
    return false
  }
  return engageTagLensMembers(tag, placementIds)
}
