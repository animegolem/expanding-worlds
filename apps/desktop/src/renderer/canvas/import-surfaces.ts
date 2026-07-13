import { uuidv7 } from '@ew/domain'
import { arrangePayload, type CommandGroupToken, type SceneItem } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import type { CanvasHostHandle } from './host'
import {
  IMPORT_BATCH_THRESHOLD,
  enqueueImportBatch,
  isImportBatchActive,
  type ImportOutcome,
} from '../chrome/import-progress'
import { queueMirrorForDrop } from '../chrome/mirror'
import {
  MULTI_DROP_MODAL_THRESHOLD,
  requestDropBehavior,
  type DropChoice,
} from '../chrome/drop-behavior'
import { sourceBorder } from '../chrome/source-slot'
import { toast } from '../chrome/status'
import { runAsUndoGroup } from '../undo/undo-store'
import { frameRegionAround } from './frame-arrange'
import { themeTokenValue } from '../theme'

/**
 * Import surfaces (RFC-0001 §6.1, AI-IMP-020): OS file drop, clipboard
 * paste, browser drag (bytes + attribution), and URL-only drop, plus
 * drops from the outline's rows (§6.3/§6.10, AI-IMP-070). Every import
 * lands one asset via the staged pipeline and one CreatePin; every
 * rejection surfaces a clear error and issues zero commands.
 */

/** Drag payload mimes set by outline-row dragstart (OutlineView). */
export const NODE_DRAG_MIME = 'application/x-ew-node'
export const NOTE_DRAG_MIME = 'application/x-ew-note'
/** §14.4 source-panel drag-out (AI-IMP-091): JSON {contentHash} —
 * the item lives in ANOTHER project, so the drop ingests by copy
 * (090) before the ordinary placement. */
export const SOURCE_ITEM_MIME = 'application/x-ew-source-item'

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

/** The standard §6.1 import-failure surface (mirrors CanvasHost's
 * notify): a sticky, replace-keyed error toast. The exported
 * importFilesAt uses it so a note-pane drop (AI-IMP-097) reports
 * failures exactly like a board drop. */
export function importErrorNotice(message: string): void {
  toast(message, {
    kind: 'error',
    sticky: true,
    surface: 'import-error',
    dismissTestid: 'import-error-dismiss',
  })
}

/** canvasId is BOUND AT GESTURE TIME by every caller: the import
 * awaits before this runs, and a user who navigates mid-import
 * must get the pin on the board they dropped on, not wherever
 * they are now (AI-IMP-085). Returns the fresh nodeId on commit
 * (the §14.4 mirror's tag-offer target), null on failure — so
 * batch outcomes stay honest. */
async function createImagePin(
  host: CanvasHostHandle,
  onError: (message: string) => void,
  assetId: string,
  world: Point,
  canvasId: string,
  groupToken?: CommandGroupToken,
): Promise<{ nodeId: string; placementId: string } | null> {
  const nodeId = uuidv7()
  const placementId = uuidv7()
  // checkRevision off (AI-IMP-238, per the gateway's standing
  // inter-instance rule): the importAsset that just resolved committed
  // CommitAssetImport inside the UTILITY process, bumping the project
  // revision out of band — the gateway learns it only via the ASYNC
  // project-changed push. When that push loses the race to this
  // CreatePin, the optimistic check false-conflicts and the file
  // reports "failed" with its asset committed but pinless (the batch
  // flake's root cause, convicted deterministically). This CreatePin
  // creates only fresh-id records, so a stale project revision is
  // never a real conflict for it.
  const result = await host.gateway.execute(
    'CreatePin',
    {
      nodeId,
      canvasId,
      placementId,
      x: world.x,
      y: world.y,
      appearance: { kind: 'image', assetId, crop: null },
    },
    { checkRevision: false, ...(groupToken === undefined ? {} : { groupToken }) },
  )
  if (result.status !== 'committed') {
    onError(describeFailure('CreatePin', result))
    return null
  }
  return { nodeId, placementId }
}

/** One file through the staged pipeline, then its CreatePin. A
 * sniff rejection surfaces its notice and issues zero commands;
 * the outcome feeds the §14.4 batch counts. A committed import is
 * then OFFERED to the inbox mirror — fire-and-forget, never
 * awaited: the drop's latency owes the mirror nothing (§14.4).
 * 'deduped' still mirrors: the world holding the bytes says
 * nothing about the library. */
async function importOneFile(
  host: CanvasHostHandle,
  onError: (message: string) => void,
  file: File,
  world: Point,
  canvasId: string,
  mirror: { anchor: Point; bulk: boolean },
  sourceUrl?: string,
  groupToken?: CommandGroupToken,
): Promise<{ outcome: ImportOutcome; placementId: string | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string } = {
    bytes,
    originalFilename: file.name.length > 0 ? file.name : 'pasted-image',
  }
  if (sourceUrl !== undefined) input.sourceUrl = sourceUrl
  const imported = await window.ew.project.importAsset(input)
  if (!imported.ok) {
    onError(imported.message)
    return { outcome: 'failed', placementId: null }
  }
  // A committed asset with no pin is invisible (the gallery is
  // node-backed) — report it as the failure it is; the orphaned
  // bytes stay GC-eligible per §9.8 and hash dedupe re-finds them.
  const pin = await createImagePin(host, onError, imported.assetId, world, canvasId, groupToken)
  if (pin === null) return { outcome: 'failed', placementId: null }
  queueMirrorForDrop({
    assetId: imported.assetId,
    nodeId: pin.nodeId,
    clientX: mirror.anchor.x,
    clientY: mirror.anchor.y,
    bulk: mirror.bulk,
  })
  return { outcome: imported.deduplicated ? 'deduped' : 'imported', placementId: pin.placementId }
}

/** §6.1: import each file, then one CreatePin per success. Small
 * drops keep the quiet sequential path; a drop past the §14.4
 * threshold — or ANY drop while a batch runs — queues into the
 * progress strip instead (each file stays its own committed
 * import, so strip cancel never rolls anything back). canvasId is
 * captured by the caller at gesture time (AI-IMP-085). */
async function importFiles(
  host: CanvasHostHandle,
  onError: (message: string) => void,
  files: File[],
  world: Point,
  anchor: Point,
  canvasId: string,
  sourceUrl?: string,
): Promise<void> {
  if (files.length > IMPORT_BATCH_THRESHOLD || isImportBatchActive()) {
    // The pump runs tasks strictly in order, so a shared per-drop
    // success count keeps the cascade offsets identical to the
    // quiet path's placement semantics. bulk:true collapses the
    // mirror's recognition chips into one summary chip (§14.4).
    const drop = { placed: 0 }
    enqueueImportBatch(
      files.map((file) => async () => {
        const { outcome } = await importOneFile(
          host,
          onError,
          file,
          {
            x: world.x + drop.placed * MULTI_DROP_OFFSET,
            y: world.y + drop.placed * MULTI_DROP_OFFSET,
          },
          canvasId,
          { anchor, bulk: true },
          sourceUrl,
        )
        if (outcome !== 'failed') drop.placed += 1
        return outcome
      }),
    )
    return
  }
  let placed = 0
  for (const file of files) {
    const { outcome } = await importOneFile(
      host,
      onError,
      file,
      {
        x: world.x + placed * MULTI_DROP_OFFSET,
        y: world.y + placed * MULTI_DROP_OFFSET,
      },
      canvasId,
      { anchor, bulk: false },
      sourceUrl,
    )
    if (outcome !== 'failed') placed += 1
  }
}

/**
 * §4.9 rev 0.38 multi-drop composition (AI-IMP-129). A drop/paste of
 * N≥{@link MULTI_DROP_MODAL_THRESHOLD} images resolves a behavior
 * (stored, or the once-per-drop ask) and lands the whole thing — import
 * of every image PLUS the sort / frame / capture — as ONE compound undo,
 * so a single Mod+Z returns the board to pre-drop. `separate` keeps the
 * ordinary cascade (its own batch/progress path). A composite NEVER
 * enters the library: every image stays its own asset + node (the frame
 * is a note-node with no asset), so per-image tags and hash dedupe hold.
 */
function runMultiDrop(
  host: CanvasHostHandle,
  onError: (message: string) => void,
  files: File[],
  world: Point,
  anchor: Point,
  canvasId: string,
  source: 'drop' | 'paste',
  sourceUrl?: string,
): void {
  void requestDropBehavior({
    anchor,
    count: files.length,
    source,
    run: (choice) => void applyDropChoice(host, onError, choice, files, world, anchor, canvasId, sourceUrl),
  })
}

async function applyDropChoice(
  host: CanvasHostHandle,
  onError: (message: string) => void,
  choice: DropChoice,
  files: File[],
  world: Point,
  anchor: Point,
  canvasId: string,
  sourceUrl?: string,
): Promise<void> {
  if (choice === 'separate') {
    await importFiles(host, onError, files, world, anchor, canvasId, sourceUrl)
    return
  }
  const wantSort = choice === 'sort' || choice === 'group-and-sort'
  const wantFrame = choice === 'group' || choice === 'group-and-sort'
  await runAsUndoGroup(async (groupToken) => {
    // Deferred import — every CreatePin lands INSIDE the group so undo
    // removes the imports with the frame/sort. Cascade first; sort (if
    // asked) repacks over the real committed sizes.
    const placementIds: string[] = []
    let placed = 0
    for (const file of files) {
      const { placementId } = await importOneFile(
        host,
        onError,
        file,
        { x: world.x + placed * MULTI_DROP_OFFSET, y: world.y + placed * MULTI_DROP_OFFSET },
        canvasId,
        { anchor, bulk: files.length > 1 },
        sourceUrl,
        groupToken,
      )
      if (placementId) {
        placementIds.push(placementId)
        placed += 1
      }
    }
    if (placementIds.length === 0) return
    const wanted = new Set(placementIds)
    const readItems = async (): Promise<SceneItem[] | null> => {
      // AI-IMP-232 (CA-007): bounded — if the imports never apply, STOP
      // (null) rather than sort/frame an empty read.
      if (!(await host.waitForItems(placementIds))) return null
      return host.controller.items().filter((item) => wanted.has(item.id))
    }
    let items = await readItems()
    if (items === null) return
    if (wantSort) {
      const arrange = arrangePayload(canvasId, items, 'default', { origin: world })
      if (arrange) {
        // Fail-stop: the arrange result used to be ignored and then a
        // BARE whenSceneApplied() awaited the next unqualified refresh —
        // a failed transform hung the import and its undo group forever
        // (CA-007). Inspect, surface, and stop on refusal; otherwise
        // wait for the scene to reflect THIS transform's revision.
        const arranged = await host.gateway.execute('TransformContent', arrange, { groupToken })
        if (arranged.status !== 'committed') {
          onError(describeFailure('TransformContent', arranged))
          return
        }
        // Read the packed geometry so a frame wraps the tiled block.
        await host.whenSceneApplied({ revision: arranged.revision })
        items = host.controller.items().filter((item) => wanted.has(item.id))
      }
    }
    if (wantFrame) {
      const region = frameRegionAround(items)
      if (region) {
        const framePlacementId = await host.commitFrame(region, groupToken)
        if (framePlacementId) {
          const captured = await host.gateway.execute('CaptureInFrame', {
            framePlacementId,
            memberPlacementIds: placementIds,
          }, { groupToken })
          if (captured.status !== 'committed') onError(describeFailure('CaptureInFrame', captured))
        }
      }
    }
  }, { operation: 'importing' })
}

/** AI-IMP-097: a note surface (panel or big editor) intercepted an
 * image drop. Run the ORDINARY §6.1 pipeline — one asset, one
 * CreatePin, one mirror offer per file — onto the board the caller
 * captured at drop time (AI-IMP-085), placing at a world point the
 * caller derived from the note's placement (or the view center for
 * anchorless panels). `clientAnchor` is the drop point in client
 * coordinates, used only to seat the mirror's recognition chip.
 * Failures surface through the standard import-error toast. */
export function importFilesAt(
  host: CanvasHostHandle,
  files: File[],
  world: Point,
  canvasId: string,
  clientAnchor: Point,
): Promise<void> {
  return importFiles(host, importErrorNotice, files, world, clientAnchor, canvasId)
}

export interface ClipboardImageProbe {
  files: File[]
  disabledReason: string | null
}

/**
 * Ground-menu paste is a user-initiated clipboard read. Probe once when
 * that menu opens, retain the returned Files, and either expose a live
 * row or an honest inert-with-why row. The existing window paste handler
 * remains the fast keyboard path.
 */
export async function readClipboardImageFiles(): Promise<ClipboardImageProbe> {
  if (!navigator.clipboard?.read) {
    return { files: [], disabledReason: 'Paste here is unavailable in this Chromium build' }
  }
  try {
    const items = await navigator.clipboard.read()
    const files: File[] = []
    for (const item of items) {
      const type = item.types.find((entry) => entry.startsWith('image/'))
      if (!type) continue
      const blob = await item.getType(type)
      const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
      files.push(new File([blob], `clipboard-image.${extension}`, { type }))
    }
    return files.length > 0
      ? { files, disabledReason: null }
      : { files: [], disabledReason: 'Paste here — the clipboard has no image' }
  } catch {
    return { files: [], disabledReason: 'Paste here — the clipboard could not be read' }
  }
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

  /** §6.1 URL-only drop: main fetches as a user-initiated act; any
   * failure surfaces a clear error and creates zero records. */
  async function importFromUrl(url: string, world: Point, anchor: Point): Promise<void> {
    const canvasId = host.canvasId // gesture-time board (AI-IMP-085)
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
    const pin = await createImagePin(host, onError, imported.assetId, world, canvasId)
    // A URL drop is a capture like any other (§14.4) — offer it to
    // the mirror; provenance rides the asset's source_url.
    if (pin !== null) {
      queueMirrorForDrop({
        assetId: imported.assetId,
        nodeId: pin.nodeId,
        clientX: anchor.x,
        clientY: anchor.y,
        bulk: false,
      })
    }
  }

  /** §14.4 pull from the source panel (AI-IMP-091): ingest-by-copy
   * with the session's tag border (090 — bytes hash-copy, dedupe
   * pulls place without recopying), then the ORDINARY placement at
   * the drop point. The ingested node is this-world material; the
   * placement is ordinary in every way. */
  async function ingestSourceItem(payload: string, world: Point): Promise<void> {
    const canvasId = host.canvasId // gesture-time board (AI-IMP-085)
    let contentHash: string
    try {
      const parsed = JSON.parse(payload) as { contentHash?: unknown }
      if (typeof parsed.contentHash !== 'string' || parsed.contentHash.length === 0) return
      contentHash = parsed.contentHash
    } catch {
      return
    }
    const ingested = await window.ew.secondary.ingest('source', {
      contentHash,
      border: sourceBorder(),
    })
    if (!ingested.ok) {
      onError(`ingest failed: ${ingested.message}`)
      return
    }
    const result = await host.gateway.execute('CreatePlacement', {
      placementId: uuidv7(),
      canvasId,
      nodeId: ingested.nodeId,
      x: world.x,
      y: world.y,
    })
    if (result.status !== 'committed') onError(describeFailure('CreatePlacement', result))
  }

  /** §6.3: a node dragged from an outline row creates one placement. */
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
    const sourceItem = dt.getData(SOURCE_ITEM_MIME)
    const nodeId = dt.getData(NODE_DRAG_MIME)
    const noteId = dt.getData(NOTE_DRAG_MIME)
    const uriList = dt.getData('text/uri-list')
    const html = dt.getData('text/html')
    const files = [...dt.files]
    const world = worldAt(event.clientX, event.clientY)
    if (sourceItem.length > 0) {
      // 091: FIRST — a foreign item must ingest, never place raw.
      void ingestSourceItem(sourceItem, world)
    } else if (nodeId.length > 0) {
      void placeNode(nodeId, world)
    } else if (noteId.length > 0) {
      void placeZeroNodeNote(noteId, world)
    } else if (files.length > 0) {
      const anchor = { x: event.clientX, y: event.clientY }
      const sourceUrl = sourceUrlFrom(uriList, html)
      // §4.9 (AI-IMP-129): a multi-image drop asks how to land; a single
      // image keeps the unchanged ordinary import.
      if (files.length >= MULTI_DROP_MODAL_THRESHOLD) {
        runMultiDrop(host, onError, files, world, anchor, host.canvasId, 'drop', sourceUrl)
      } else {
        void importFiles(host, onError, files, world, anchor, host.canvasId, sourceUrl)
      }
    } else {
      const url = firstUri(uriList)
      if (url) void importFromUrl(url, world, { x: event.clientX, y: event.clientY })
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
    // Chip/ask anchor in client coordinates: the paste point when the
    // cursor is over the canvas, else the view center.
    const bounds = element.getBoundingClientRect()
    const anchor = lastCursor
      ? { x: bounds.left + lastCursor.x, y: bounds.top + lastCursor.y }
      : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    const pasted = [...dt.files]
    // §4.9 (AI-IMP-129): a multi-image paste asks "separate images or an
    // arranged frame"; a single image keeps the ordinary paste.
    if (pasted.length >= MULTI_DROP_MODAL_THRESHOLD) {
      runMultiDrop(host, onError, pasted, world, anchor, host.canvasId, 'paste')
    } else {
      void importFiles(host, onError, pasted, world, anchor, host.canvasId)
    }
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
