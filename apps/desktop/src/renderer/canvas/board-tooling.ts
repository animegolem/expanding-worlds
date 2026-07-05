import {
  alignPayload,
  createSnapProvider,
  distributePayload,
  unionBounds,
  type AlignOp,
  type DistributeAxis,
  type SceneBackground,
  type ScenePlacement,
} from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import type { Sprite } from 'pixi.js'
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

export interface BoardTooling {
  align(op: AlignOp): Promise<void>
  distribute(axis: DistributeAxis): Promise<void>
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

  const viewport = (): { width: number; height: number } => ({
    width: element.clientWidth,
    height: element.clientHeight,
  })

  function zoomToFit(): void {
    const bounds = unionBounds(controller.items())
    if (bounds) controller.camera.fitBounds(bounds, viewport())
  }

  function zoomToSelection(): void {
    const bounds = unionBounds(controller.selectedItems())
    if (bounds) controller.camera.fitBounds(bounds, viewport())
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

  async function setBackgroundFromSelection(): Promise<void> {
    const placement = selectedImagePlacement()
    if (!placement) return
    await run('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: placement.appearanceAssetId,
      settings: { ...IDENTITY_SETTINGS },
    })
  }

  async function setBackgroundFromFile(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: file.name.length > 0 ? file.name : 'background-image',
    })
    if (!imported.ok) {
      onError(imported.message)
      return
    }
    await run('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: imported.assetId,
      settings: { ...IDENTITY_SETTINGS },
    })
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
    await run('SetCanvasBackground', {
      canvasId: handle.canvasId,
      assetId: background.assetId,
      settings: { ...IDENTITY_SETTINGS },
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
