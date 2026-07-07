import {
  alignPayload,
  arrangePayload,
  createSnapProvider,
  distributePayload,
  normalizeSelection,
  placementSize,
  reorderPayloads,
  stageExtent,
  unionBounds,
  STAGE_WIDTH,
  type AlignOp,
  type ArrangeSortKey,
  type DistributeAxis,
  type NormalizeMode,
  type ReorderOp,
  type SceneBackground,
  type ScenePlacement,
} from '@ew/canvas-engine'
import { uuidv7 } from '@ew/domain'
import { FRAME_SORT_ON_DROP_PREFIX } from '@ew/protocol'
import type { CommandResult, TransformContentPayload } from '@ew/commands'
import type { Sprite } from 'pixi.js'
import { openTakeover, takeoverActive } from '../chrome/takeover'
import { runAsUndoGroup } from '../undo/undo-store'
import { beginFrameLoad, onLoadIntoFrame } from './frame-load'
import { scopedArrangePayload } from './frame-arrange'
import type { CanvasHostHandle } from './host'

/**
 * Board tooling (AI-IMP-022): installs the real SnapProvider, runs
 * §6.9 align/distribute (one TransformContent each) and camera-only
 * zoom-to-fit/selection, and owns the §6.7 background operation set.
 * Background editing happens in an explicit mode: a capture-phase
 * interceptor on the canvas suspends ordinary content interaction,
 * drag/wheel adjust the background sprite EPHEMERALLY, and exit
 * commits exactly one SetCanvasBackground (Escape reverts, zero
 * commands). Outside the mode the background is never hittable —
 * hit-testing walks the content plane only.
 */

export interface BackgroundSettings {
  x: number
  y: number
  scale: number
  opacity: number
}

const IDENTITY_SETTINGS: BackgroundSettings = { x: 0, y: 0, scale: 1, opacity: 1 }
/** Below this native width a background likely reads soft (§6.7). */
const BG_SMALL_WIDTH_PX = 1024

export interface BoardTooling {
  align(op: AlignOp): Promise<void>
  distribute(axis: DistributeAxis): Promise<void>
  /** §6.9 auto-arrange: compact-pack the selection in `key` order. */
  arrange(key: ArrangeSortKey): Promise<void>
  /** §6.9 normalize: equalize the selection's dimensions to the median. */
  normalize(mode: NormalizeMode): Promise<void>
  /** §4.9 (AI-IMP-129): compact-pack a frame's direct members inside its
   * drawn box on demand — the same scoped arrange sort-on-drop runs. */
  sortFrame(framePlacementId: string): Promise<void>
  /** §4.9 per-frame sort-on-drop flag (absent = ON). */
  frameSortOnDrop(framePlacementId: string): Promise<boolean>
  setFrameSortOnDrop(framePlacementId: string, on: boolean): Promise<void>
  /** §4.9 load-from-library-into-frame: park this frame and open the
   * existing gallery picker; the pick lands captured + arranged. */
  loadIntoFrame(framePlacementId: string): void
  /** §6.8 z-order on the current selection (placements + decorations). */
  reorder(op: ReorderOp): Promise<void>
  zoomToFit(): void
  zoomToSelection(): void
  /** The single image-appearance placement selected, if any (§6.7). */
  selectedImagePlacement(): ScenePlacement | null
  background(): SceneBackground | null
  backgroundEditActive(): boolean
  setBackgroundFromSelection(): Promise<void>
  setBackgroundFromFile(file: File): Promise<void>
  enterBackgroundEdit(): void
  commitBackgroundEdit(): Promise<void>
  cancelBackgroundEdit(): void
  /** Ephemeral scale step while the edit mode is active. */
  scaleBackgroundBy(factor: number): void
  resetBackgroundTransform(): Promise<void>
  removeBackground(): Promise<void>
  setBackgroundColor(color: string | null): Promise<void>
  /** Fires on background/edit-mode changes (toolbar re-render). */
  onChanged(listener: () => void): () => void
  destroy(): void
}

declare global {
  interface Window {
    /** e2e hooks for AI-IMP-022; separate from host's __ewDebug. */
    __ewBoardDebug?: {
      backgroundMode: () => boolean
      backgroundSprite: () => { x: number; y: number; scale: number; alpha: number } | null
    }
  }
}

function describeFailure(what: string, result: CommandResult): string {
  if (result.status === 'error') return `${what} failed: ${result.message}`
  if (result.status === 'conflict') return `${what} failed: the project changed underneath (retry)`
  return `${what} failed: ${result.status}`
}

function settingsOf(background: SceneBackground | null): BackgroundSettings {
  const s = (background?.settings ?? {}) as Partial<BackgroundSettings>
  return {
    x: s.x ?? 0,
    y: s.y ?? 0,
    scale: s.scale ?? 1,
    opacity: s.opacity ?? 1,
  }
}

function sameSettings(a: BackgroundSettings, b: BackgroundSettings): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale && a.opacity === b.opacity
}

interface EditMode {
  original: BackgroundSettings
  pending: BackgroundSettings
  drag: { pointerId: number; start: { x: number; y: number }; from: { x: number; y: number } } | null
}

export function attachBoardTooling(
  handle: CanvasHostHandle,
  element: HTMLElement,
  onError: (message: string) => void,
): BoardTooling {
  const { controller, gateway, planes } = handle
  const canvas = element.querySelector('canvas')
  if (!canvas) throw new Error('board tooling needs the mounted canvas element')

  // §6.9 snapping: the move/resize drivers route every delta through
  // this provider; guides come back through the host's overlay.
  controller.setSnapProvider(createSnapProvider())

  let background: SceneBackground | null = null
  let mode: EditMode | null = null
  const changed = new Set<() => void>()
  const notify = (): void => {
    for (const listener of changed) listener()
  }

  function backgroundSprite(): Sprite | null {
    const sprite = planes.background.children.find((c) => c.label === 'background-image')
    return (sprite as Sprite | undefined) ?? null
  }

  function applySettingsToSprite(settings: BackgroundSettings): void {
    const sprite = backgroundSprite()
    if (!sprite) return
    sprite.position.set(settings.x, settings.y)
    sprite.scale.set(settings.scale)
    sprite.alpha = settings.opacity
  }

  async function refreshBackground(): Promise<void> {
    const response = await window.ew.project.query('getCanvasScene', { canvasId: handle.canvasId })
    if (!response.ok) return
    const scene = response.result as { background: SceneBackground } | null
    background = scene?.background ?? null
    // A concurrent scene re-render (e.g. debounced camera persist)
    // re-applies durable settings to the sprite; restore the pending
    // ephemeral state while the edit mode is active.
    if (mode) applySettingsToSprite(mode.pending)
    notify()
  }

  async function run(commandType: string, payload: unknown): Promise<void> {
    const result = await gateway.execute(commandType, payload)
    if (result.status !== 'committed') onError(describeFailure(commandType, result))
  }

  // ---- §6.9 arrange + navigate ----

  async function align(op: AlignOp): Promise<void> {
    const payload = alignPayload(handle.canvasId, controller.selectedItems(), op)
    if (payload) await run('TransformContent', payload)
  }

  async function distribute(axis: DistributeAxis): Promise<void> {
    const payload = distributePayload(handle.canvasId, controller.selectedItems(), axis)
    if (payload) await run('TransformContent', payload)
  }

  // §4.9 rev 0.38: arrange (compact-pack in a sort order) and normalize
  // (equalize dimensions to the median) act on the current selection and
  // commit through the same one-command batch path as align/distribute,
  // so each invocation is a single undo entry.
  async function arrange(key: ArrangeSortKey): Promise<void> {
    const payload = arrangePayload(handle.canvasId, controller.selectedItems(), key)
    if (payload) await run('TransformContent', payload)
  }

  async function normalize(mode: NormalizeMode): Promise<void> {
    const payload = normalizeSelection(handle.canvasId, controller.selectedItems(), mode)
    if (payload) await run('TransformContent', payload)
  }

  // ---- §4.9 frame actions (AI-IMP-129) ----

  interface FrameNode {
    placementId: string
    members: FrameNode[]
  }
  function findFrameNode(nodes: FrameNode[], placementId: string): FrameNode | null {
    for (const node of nodes) {
      if (node.placementId === placementId) return node
      const hit = findFrameNode(node.members, placementId)
      if (hit) return hit
    }
    return null
  }

  /** The scoped-arrange payload for a frame's DIRECT members (read from
   * getFrameTree so nested frames pack as one block, not scattered). */
  async function arrangeFramePayload(
    framePlacementId: string,
  ): Promise<TransformContentPayload | null> {
    const canvasId = handle.canvasId
    const response = await window.ew.project.query('getFrameTree', { canvasId })
    if (!response.ok) return null
    const tree = response.result as { roots: FrameNode[] }
    const node = findFrameNode(tree.roots, framePlacementId)
    if (!node) return null
    const memberIds = new Set(node.members.map((m) => m.placementId))
    const frame = controller.items().find((item) => item.id === framePlacementId)
    if (!frame || frame.itemKind !== 'placement') return null
    const members = controller.items().filter((item) => memberIds.has(item.id))
    return scopedArrangePayload(canvasId, frame, members)
  }

  async function sortFrame(framePlacementId: string): Promise<void> {
    const payload = await arrangeFramePayload(framePlacementId)
    if (payload) await run('TransformContent', payload)
  }

  async function frameSortOnDrop(framePlacementId: string): Promise<boolean> {
    const response = await window.ew.project.query('getSettings')
    if (!response.ok) return true
    const settings = response.result as Record<string, unknown>
    return settings[`${FRAME_SORT_ON_DROP_PREFIX}${framePlacementId}`] !== false
  }

  async function setFrameSortOnDrop(framePlacementId: string, on: boolean): Promise<void> {
    await window.ew.settings.setProject(`${FRAME_SORT_ON_DROP_PREFIX}${framePlacementId}`, on)
  }

  function loadIntoFrame(framePlacementId: string): void {
    // Reuse the §14.4 gallery picker: park the frame, open the takeover.
    beginFrameLoad({ framePlacementId, canvasId: handle.canvasId })
    openTakeover('gallery')
  }

  /** Gallery place with a parked frame target (frame-load.ts): place
   * each picked node into the frame, capture, and arrange to the drawn
   * size — one compound undo. Runs on THIS board only. */
  const offLoadIntoFrame = onLoadIntoFrame(({ nodeIds, framePlacementId, canvasId }) => {
    if (canvasId !== handle.canvasId) return
    void runAsUndoGroup(async () => {
      const frame = controller.items().find((item) => item.id === framePlacementId)
      if (!frame || frame.itemKind !== 'placement') return
      const placementIds: string[] = []
      let step = 0
      for (const nodeId of nodeIds) {
        const placementId = uuidv7()
        const result = await gateway.execute('CreatePlacement', {
          placementId,
          canvasId,
          nodeId,
          x: frame.x + step * 24,
          y: frame.y + step * 24,
        })
        if (result.status === 'committed') {
          placementIds.push(placementId)
          step += 1
        }
      }
      if (placementIds.length === 0) return
      await handle.waitForItems(placementIds)
      await gateway.execute('CaptureInFrame', { framePlacementId, memberPlacementIds: placementIds })
      const payload = await arrangeFramePayload(framePlacementId)
      if (payload) await gateway.execute('TransformContent', payload)
    })
  })

  async function reorder(op: ReorderOp): Promise<void> {
    const payloads = reorderPayloads(
      handle.canvasId,
      controller.items(),
      controller.selection.ids(),
      op,
    )
    for (const payload of payloads) await run('ReorderContent', payload)
  }

  const viewport = (): { width: number; height: number } => ({
    width: element.clientWidth,
    height: element.clientHeight,
  })

  function zoomToFit(): void {
    // §6.7 rev 0.11: a background stage is the canvas's home extent.
    // rev 0.50: without an image, frame the content-defined lit extent
    // (padded, grow-only) so the fit matches exactly what is lit — the
    // raw item bbox is only a last-resort fallback.
    const bounds =
      stageExtent(background) ?? handle.contentStageExtent() ?? unionBounds(controller.items())
    if (bounds) handle.flyTo(bounds)
  }

  function zoomToSelection(): void {
    const bounds = unionBounds(controller.selectedItems())
    if (bounds) handle.flyTo(bounds)
  }

  // ---- §6.7 backgrounds ----

  function selectedImagePlacement(): ScenePlacement | null {
    const items = controller.selectedItems()
    if (items.length !== 1) return null
    const item = items[0]!
    if (item.itemKind !== 'placement') return null
    if (item.appearanceKind !== 'image' || !item.appearanceAssetId) return null
    return item
  }

  /** §6.7 rev 0.11: promoting a placed image preserves the world
   * rect the user already gave it — normalizing would yank the map
   * out from under anything arranged on top. */
  async function setBackgroundFromSelection(): Promise<void> {
    const placement = selectedImagePlacement()
    if (!placement) return
    const size = placementSize(placement)
    const native = placement.assetWidth
    const settings =
      native && native > 0 && size.width > 0
        ? {
            x: placement.x - size.width / 2,
            y: placement.y - size.height / 2,
            scale: size.width / native,
            opacity: 1,
          }
        : { ...IDENTITY_SETTINGS }
    const result = await gateway.execute('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: placement.appearanceAssetId,
      settings,
    })
    if (result.status !== 'committed') {
      onError(describeFailure('SetCanvasBackground', result))
      return
    }
    handle.flyTo({ x: settings.x, y: settings.y, width: size.width, height: size.height })
  }

  /** §6.7 rev 0.11: setting from a file normalizes the STAGE (world
   * proportions, not pixels) to the canonical width, centered on the
   * current view; replacing an existing background fits the new
   * image into the prior extent so canvas coordinates hold (Q7). */
  async function setBackgroundFromFile(file: File): Promise<void> {
    // Gesture-time board AND its background: both reads must precede
    // the awaits, or navigating mid-import retargets the command and
    // fits the new image to the wrong prior extent (AI-IMP-085).
    const canvasId = handle.canvasId
    const priorBackground = background
    const bytes = new Uint8Array(await file.arrayBuffer())
    let dims: { width: number; height: number } | null = null
    try {
      const bitmap = await createImageBitmap(new Blob([bytes]))
      dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
    } catch {
      /* undecodable here — import validation owns the real error */
    }
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: file.name.length > 0 ? file.name : 'background-image',
    })
    if (!imported.ok) {
      onError(imported.message)
      return
    }
    // §6.7 rev 0.12: normalization governs proportions, not fidelity
    // — warn (without blocking) when the source can't carry a stage.
    if (dims && dims.width > 0 && dims.width < BG_SMALL_WIDTH_PX) {
      element.dispatchEvent(
        new CustomEvent('ew-board-notice', {
          bubbles: true,
          detail: {
            message: `This image is ${dims.width}px wide — it may look soft as a background.`,
          },
        }),
      )
    }
    let settings = { ...IDENTITY_SETTINGS }
    let extent: { x: number; y: number; width: number; height: number } | null = null
    if (dims && dims.width > 0 && dims.height > 0) {
      const prior = stageExtent(priorBackground)
      if (prior) {
        const scale = prior.width / dims.width
        settings = { x: prior.x, y: prior.y, scale, opacity: 1 }
        extent = { ...prior, height: dims.height * scale }
      } else {
        const scale = STAGE_WIDTH / dims.width
        const width = STAGE_WIDTH
        const height = dims.height * scale
        const view = viewport()
        const center = controller.camera.screenToWorld({
          x: view.width / 2,
          y: view.height / 2,
        })
        settings = { x: center.x - width / 2, y: center.y - height / 2, scale, opacity: 1 }
        extent = { x: settings.x, y: settings.y, width, height }
      }
    }
    const result = await gateway.execute('SetCanvasBackground', {
      canvasId,
      assetId: imported.assetId,
      settings,
    })
    if (result.status !== 'committed') {
      onError(describeFailure('SetCanvasBackground', result))
      return
    }
    // Fly only if the user is still standing on the board they set.
    if (extent && handle.canvasId === canvasId) handle.flyTo(extent)
  }

  function enterBackgroundEdit(): void {
    if (mode || !background?.assetId) return
    // Clear the selection so no gesture handles can swallow pointer
    // events ahead of the mode's capture interceptor.
    controller.selection.clear()
    const original = settingsOf(background)
    mode = { original, pending: { ...original }, drag: null }
    notify()
  }

  async function commitBackgroundEdit(): Promise<void> {
    if (!mode) return
    const { original, pending } = mode
    mode = null
    notify()
    if (!background?.assetId || sameSettings(original, pending)) return
    const result = await gateway.execute('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: background.assetId,
      settings: { ...pending },
    })
    if (result.status !== 'committed') {
      onError(describeFailure('SetCanvasBackground', result))
      applySettingsToSprite(original)
    }
  }

  function cancelBackgroundEdit(): void {
    if (!mode) return
    applySettingsToSprite(mode.original)
    mode = null
    notify()
  }

  function scaleBackgroundBy(factor: number): void {
    if (!mode) return
    mode.pending.scale = Math.max(0.01, mode.pending.scale * factor)
    applySettingsToSprite(mode.pending)
  }

  async function resetBackgroundTransform(): Promise<void> {
    if (!background?.assetId) return
    // Reset returns to the normalized stage default at the origin
    // (§6.7 rev 0.11), not to raw pixels.
    const settings =
      background.assetWidth && background.assetWidth > 0
        ? { x: 0, y: 0, scale: STAGE_WIDTH / background.assetWidth, opacity: 1 }
        : { ...IDENTITY_SETTINGS }
    await run('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: background.assetId,
      settings,
    })
  }

  async function removeBackground(): Promise<void> {
    if (mode) cancelBackgroundEdit()
    await run('SetCanvasBackground', { canvasId: handle.canvasId, assetId: null, settings: null })
  }

  async function setBackgroundColor(color: string | null): Promise<void> {
    await run('SetCanvasBackgroundColor', { canvasId: handle.canvasId, color })
  }

  // ---- background edit mode: capture-phase interception ----
  // Same pattern as gestures-ui: capture + stopImmediatePropagation +
  // setPointerCapture, so neither the ToolManager nor the controller
  // sees pointer input while the mode is active.

  const onPointerDownCapture = (event: PointerEvent): void => {
    if (!mode) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.button !== 0) return
    canvas.setPointerCapture(event.pointerId)
    mode.drag = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      from: { x: mode.pending.x, y: mode.pending.y },
    }
  }
  const onPointerMoveCapture = (event: PointerEvent): void => {
    if (!mode) return
    event.stopImmediatePropagation()
    const drag = mode.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    const zoom = controller.camera.zoom
    mode.pending.x = drag.from.x + (event.clientX - drag.start.x) / zoom
    mode.pending.y = drag.from.y + (event.clientY - drag.start.y) / zoom
    applySettingsToSprite(mode.pending)
  }
  const onPointerUpCapture = (event: PointerEvent): void => {
    if (!mode) return
    event.stopImmediatePropagation()
    mode.drag = null
  }
  const onWheelCapture = (event: WheelEvent): void => {
    if (!mode) return
    event.preventDefault()
    event.stopImmediatePropagation()
    scaleBackgroundBy(Math.exp(-event.deltaY * 0.0015))
  }
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    // §8.2 (AI-IMP-068): a takeover owns Escape; the hidden bg-edit
    // mode must not intercept it at capture underneath.
    if (takeoverActive()) return
    if (!mode || event.code !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    cancelBackgroundEdit()
  }

  canvas.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
  canvas.addEventListener('pointermove', onPointerMoveCapture, { capture: true })
  canvas.addEventListener('pointerup', onPointerUpCapture, { capture: true })
  canvas.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
  window.addEventListener('keydown', onKeyDownCapture, { capture: true })

  const unsubscribeProject = window.ew.project.onChanged(() => void refreshBackground())
  void refreshBackground()

  window.__ewBoardDebug = {
    backgroundMode: () => mode !== null,
    backgroundSprite: () => {
      const sprite = backgroundSprite()
      if (!sprite) return null
      return { x: sprite.x, y: sprite.y, scale: sprite.scale.x, alpha: sprite.alpha }
    },
  }

  return {
    align,
    distribute,
    arrange,
    normalize,
    sortFrame,
    frameSortOnDrop,
    setFrameSortOnDrop,
    loadIntoFrame,
    reorder,
    zoomToFit,
    zoomToSelection,
    selectedImagePlacement,
    background: () => background,
    backgroundEditActive: () => mode !== null,
    setBackgroundFromSelection,
    setBackgroundFromFile,
    enterBackgroundEdit,
    commitBackgroundEdit,
    cancelBackgroundEdit,
    scaleBackgroundBy,
    resetBackgroundTransform,
    removeBackground,
    setBackgroundColor,
    onChanged(listener: () => void) {
      changed.add(listener)
      return () => changed.delete(listener)
    },
    destroy() {
      unsubscribeProject()
      offLoadIntoFrame()
      canvas.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
      canvas.removeEventListener('pointermove', onPointerMoveCapture, { capture: true })
      canvas.removeEventListener('pointerup', onPointerUpCapture, { capture: true })
      canvas.removeEventListener('wheel', onWheelCapture, { capture: true })
      window.removeEventListener('keydown', onKeyDownCapture, { capture: true })
      delete window.__ewBoardDebug
      changed.clear()
    },
  }
}
