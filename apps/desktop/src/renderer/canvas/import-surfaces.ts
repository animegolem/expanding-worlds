import { uuidv7 } from '@ew/domain'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from './host'
import { themeTokenValue } from '../theme'

/**
 * Import surfaces (RFC-0001 §6.1, AI-IMP-020): OS file drop, clipboard
 * paste, browser drag (bytes + attribution), and URL-only drop, plus
 * drops from the placement-source panel (§6.3/§6.10). Every import
 * lands one asset via the staged pipeline and one CreatePin; every
 * rejection surfaces a clear error and issues zero commands.
 */

/** Drag payload mimes set by PlacementSourcePanel rows. */
export const NODE_DRAG_MIME = 'application/x-ew-node'
export const NOTE_DRAG_MIME = 'application/x-ew-note'

/** §6.10: default dot appearance for placing a zero-node note. */
export function zeroNodeNoteDotColor(): string {
  return themeTokenValue('--ew-zero-node-note-dot')
}

/** Cascading offset between placements of a multi-file drop. */
const MULTI_DROP_OFFSET = 24

interface Point {
  x: number
  y: number
}

export interface ImportSurfacesHandle {
  destroy(): void
}

function describeFailure(what: string, result: CommandResult): string {
  if (result.status === 'error') return `${what} failed: ${result.message}`
  if (result.status === 'conflict') return `${what} failed: the project changed underneath (retry)`
  return `${what} failed: ${result.status}`
}

/** First http(s) entry of a text/uri-list payload (comments start with #). */
function firstUri(uriList: string): string | null {
  for (const line of uriList.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return null
  }
  return null
}

/** Attribution for browser drags carrying bytes: prefer the uri-list
 * entry, fall back to an image src in the html fragment. */
function sourceUrlFrom(uriList: string, html: string): string | undefined {
  const uri = firstUri(uriList)
  if (uri) return uri
  const match = /<img[^>]+src\s*=\s*["']?(https?:\/\/[^"'\s>]+)/i.exec(html)
  return match?.[1] ?? undefined
}

export function attachImportSurfaces(
  host: CanvasHostHandle,
  element: HTMLElement,
  onError: (message: string) => void,
): ImportSurfacesHandle {
  let lastCursor: Point | null = null

  const localPoint = (clientX: number, clientY: number): Point => {
    const bounds = element.getBoundingClientRect()
    return { x: clientX - bounds.left, y: clientY - bounds.top }
  }
  const worldAt = (clientX: number, clientY: number): Point =>
    host.controller.camera.screenToWorld(localPoint(clientX, clientY))
  const viewCenterWorld = (): Point => {
    const bounds = element.getBoundingClientRect()
    return host.controller.camera.screenToWorld({ x: bounds.width / 2, y: bounds.height / 2 })
  }

  async function createImagePin(assetId: string, world: Point): Promise<void> {
    const result = await host.gateway.execute('CreatePin', {
      nodeId: uuidv7(),
      canvasId: host.canvasId,
      placementId: uuidv7(),
      x: world.x,
      y: world.y,
      appearance: { kind: 'image', assetId, crop: null },
    })
    if (result.status !== 'committed') onError(describeFailure('CreatePin', result))
  }

  /** §6.1: import each file, then one CreatePin per success. A sniff
   * rejection surfaces its notice and issues zero commands. */
  async function importFiles(files: File[], world: Point, sourceUrl?: string): Promise<void> {
    let placed = 0
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string } = {
        bytes,
        originalFilename: file.name.length > 0 ? file.name : 'pasted-image',
      }
      if (sourceUrl !== undefined) input.sourceUrl = sourceUrl
      const imported = await window.ew.project.importAsset(input)
      if (!imported.ok) {
        onError(imported.message)
        continue
      }
      await createImagePin(imported.assetId, {
        x: world.x + placed * MULTI_DROP_OFFSET,
        y: world.y + placed * MULTI_DROP_OFFSET,
      })
      placed += 1
    }
  }

  /** §6.1 URL-only drop: main fetches as a user-initiated act; any
   * failure surfaces a clear error and creates zero records. */
  async function importFromUrl(url: string, world: Point): Promise<void> {
    const fetched = await window.ew.project.fetchUrlForImport(url)
    if (!fetched.ok) {
      onError(fetched.message)
      return
    }
    const imported = await window.ew.project.importAsset({
      bytes: fetched.bytes,
      originalFilename: fetched.filename,
      sourceUrl: url,
    })
    if (!imported.ok) {
      onError(imported.message)
      return
    }
    await createImagePin(imported.assetId, world)
  }

  /** §6.3: a node dragged from the placement sources creates one placement. */
  async function placeNode(nodeId: string, world: Point): Promise<void> {
    const result = await host.gateway.execute('CreatePlacement', {
      placementId: uuidv7(),
      canvasId: host.canvasId,
      nodeId,
      x: world.x,
      y: world.y,
    })
    if (result.status !== 'committed') onError(describeFailure('CreatePlacement', result))
  }

  /** §6.10: a zero-node note becomes dot + attach + placement in one
   * transaction; the labeled dot shows the title immediately. */
  async function placeZeroNodeNote(noteId: string, world: Point): Promise<void> {
    const result = await host.gateway.execute('CreatePin', {
      nodeId: uuidv7(),
      canvasId: host.canvasId,
      placementId: uuidv7(),
      x: world.x,
      y: world.y,
      appearance: { kind: 'dot', color: zeroNodeNoteDotColor() },
      note: { kind: 'attach', noteId },
    })
    if (result.status !== 'committed') onError(describeFailure('CreatePin', result))
  }

  const onDragOver = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    const dt = event.dataTransfer
    if (!dt) return
    // getData is only valid synchronously inside the drop event.
    const nodeId = dt.getData(NODE_DRAG_MIME)
    const noteId = dt.getData(NOTE_DRAG_MIME)
    const uriList = dt.getData('text/uri-list')
    const html = dt.getData('text/html')
    const files = [...dt.files]
    const world = worldAt(event.clientX, event.clientY)
    if (nodeId.length > 0) {
      void placeNode(nodeId, world)
    } else if (noteId.length > 0) {
      void placeZeroNodeNote(noteId, world)
    } else if (files.length > 0) {
      void importFiles(files, world, sourceUrlFrom(uriList, html))
    } else {
      const url = firstUri(uriList)
      if (url) void importFromUrl(url, world)
    }
  }

  // §6.1: paste places at the cursor position when it is over the
  // canvas, else at the view center.
  const onPointerMove = (event: PointerEvent): void => {
    lastCursor = localPoint(event.clientX, event.clientY)
  }
  const onPointerLeave = (): void => {
    lastCursor = null
  }
  const onPaste = (event: ClipboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    const dt = event.clipboardData
    if (!dt || dt.files.length === 0) return
    event.preventDefault()
    const world = lastCursor
      ? host.controller.camera.screenToWorld(lastCursor)
      : viewCenterWorld()
    void importFiles([...dt.files], world)
  }

  element.addEventListener('dragover', onDragOver)
  element.addEventListener('drop', onDrop)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('paste', onPaste)

  return {
    destroy() {
      element.removeEventListener('dragover', onDragOver)
      element.removeEventListener('drop', onDrop)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('paste', onPaste)
    },
  }
}
