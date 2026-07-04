import {
  BackgroundSync,
  CanvasController,
  CommandGateway,
  createDefaultRegistry,
  createScenePlanes,
  itemWorldAABB,
  SceneSync,
  ToolManager,
  ToolOverlay,
  type CanvasScene,
  type ControllerHost,
  type GestureUpdate,
  type RendererRegistry,
  type RendererResources,
  type SceneDecoration,
  type SceneItem,
  type ScenePlanes,
  type SnapGuide,
} from '@ew/canvas-engine'
import { Application, Graphics, Texture } from 'pixi.js'
import { attachGesturesUI } from './gestures-ui'
import type { Rect } from '@ew/canvas-engine'

/**
 * Bridges the Project API to the canvas engine: mounts the Pixi
 * application, resolves the root canvas, projects `getCanvasScene`,
 * re-projects on every project-changed event, and feeds pointer/
 * keyboard input to the Canvas Controller (§13.1). All domain access
 * goes through window.ew (§11.1); textures arrive over ew-asset://.
 */

export interface CanvasHostHandle {
  /** Seams for feature modules (gestures UI, import surfaces, tools). */
  controller: CanvasController
  gateway: CommandGateway
  sync: SceneSync
  registry: RendererRegistry
  planes: ScenePlanes
  tools: ToolManager
  canvasId: string
  destroy(): void
}

declare global {
  interface Window {
    __ewDebug?: {
      sceneStats: () => { total: number; placements: number; decorations: number }
      canvasId: () => string
      camera: () => { x: number; y: number; zoom: number }
      selection: () => string[]
      interactionState: () => string
      activeTool: () => string
      decorations: () => SceneDecoration[]
      decorationEndpoints: (id: string) => { x1: number; y1: number; x2: number; y2: number } | null
      decorationVisible: (id: string) => boolean | null
    }
  }
}

async function runQuery<T>(name: string, args?: unknown): Promise<T> {
  const response = await window.ew.project.query(name, args)
  if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
  return response.result as T
}

/** Decodes off the GPU path deliberately: no Pixi URL sniffing needed. */
async function loadTexture(url: string): Promise<Texture> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`asset fetch failed: ${url} (${response.status})`)
  const bitmap = await createImageBitmap(await response.blob())
  return Texture.from(bitmap)
}

const CAMERA_PERSIST_DEBOUNCE_MS = 500
const SELECTION_COLOR = 0x4a9df0
const GUIDE_COLOR = 0xf04a7d

export async function mountCanvasHost(element: HTMLElement): Promise<CanvasHostHandle> {
  const app = new Application()
  await app.init({ resizeTo: element, antialias: true, background: '#17191d' })
  element.appendChild(app.canvas)

  const planes = createScenePlanes()
  app.stage.addChild(planes.world, planes.overlay)
  const registry = createDefaultRegistry()
  const resources: RendererResources = {
    loadTexture,
    resolveObject: (id) => sync.get(id),
  }
  const sync: SceneSync = new SceneSync(planes.content, registry, resources)
  const backgroundSync = new BackgroundSync(planes.background, resources)

  const selectionGfx = new Graphics()
  const marqueeGfx = new Graphics()
  const guidesGfx = new Graphics()
  planes.overlay.addChild(selectionGfx, marqueeGfx, guidesGfx)

  const project = await runQuery<{ id: string; rootNodeId: string; revision: number }>(
    'getProject',
  )
  const rootCanvas = await runQuery<{ id: string }>('getCanvasByNode', {
    nodeId: project.rootNodeId,
  })
  const canvasId = rootCanvas.id
  const gateway = new CommandGateway(
    { execute: (envelope) => window.ew.project.execute(envelope) },
    project.id,
    project.revision,
  )

  function drawSelection(): void {
    selectionGfx.clear()
    for (const item of controller.selectedItems()) {
      const aabb = itemWorldAABB(item)
      if (!aabb) continue
      const tl = controller.camera.worldToScreen({ x: aabb.x, y: aabb.y })
      const br = controller.camera.worldToScreen({
        x: aabb.x + aabb.width,
        y: aabb.y + aabb.height,
      })
      selectionGfx
        .rect(tl.x - 2, tl.y - 2, br.x - tl.x + 4, br.y - tl.y + 4)
        .stroke({ width: 1.5, color: SELECTION_COLOR })
    }
  }

  let cameraTimer: ReturnType<typeof setTimeout> | null = null
  function persistCameraNow(): void {
    cameraTimer = null
    // Camera motion is non-durable navigation (§6.9): no revision
    // race can corrupt anything, so skip the optimistic check.
    void gateway.execute(
      'SetCanvasCamera',
      { canvasId, camera: controller.camera.state() },
      { checkRevision: false },
    )
  }
  function persistCameraSoon(): void {
    if (cameraTimer) clearTimeout(cameraTimer)
    cameraTimer = setTimeout(persistCameraNow, CAMERA_PERSIST_DEBOUNCE_MS)
  }

  const controllerHost: ControllerHost = {
    applyEphemeral(id: string, update: GestureUpdate) {
      const object = sync.get(id)
      const item = sync.item(id)
      if (!object || !item) return
      if (update.kind === 'placement' && item.itemKind === 'placement') {
        const t = update.transform
        registry
          .resolve(item)
          .update(object, { ...item, ...t } as SceneItem, item, resources)
      } else if (update.kind === 'decoration' && item.itemKind === 'decoration') {
        registry
          .resolve(item)
          .update(object, { ...item, data: update.data } as SceneItem, item, resources)
      }
      drawSelection()
    },
    restoreItem(item: SceneItem) {
      const object = sync.get(item.id)
      if (object) registry.resolve(item).update(object, item, item, resources)
      drawSelection()
    },
    commitTransform(payload) {
      void gateway.execute('TransformContent', payload)
    },
    renderMarquee(rect: Rect | null) {
      marqueeGfx.clear()
      if (rect) {
        marqueeGfx
          .rect(rect.x, rect.y, rect.width, rect.height)
          .fill({ color: SELECTION_COLOR, alpha: 0.08 })
          .stroke({ width: 1, color: SELECTION_COLOR })
      }
    },
    renderGuides(guides: SnapGuide[]) {
      guidesGfx.clear()
      for (const guide of guides) {
        const from =
          guide.axis === 'x'
            ? controller.camera.worldToScreen({ x: guide.position, y: guide.from })
            : controller.camera.worldToScreen({ x: guide.from, y: guide.position })
        const to =
          guide.axis === 'x'
            ? controller.camera.worldToScreen({ x: guide.position, y: guide.to })
            : controller.camera.worldToScreen({ x: guide.to, y: guide.position })
        guidesGfx.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({
          width: 1,
          color: GUIDE_COLOR,
        })
      }
    },
    cameraChanged() {
      controller.camera.applyTo(planes.world)
      drawSelection()
      persistCameraSoon()
    },
  }

  const controller = new CanvasController(controllerHost, canvasId)
  controller.selection.onChanged(() => drawSelection())

  // AI-IMP-021: draw tools sit in front of the controller; select
  // mode passes events through unchanged. One CreateDecoration per
  // completed gesture; previews/highlights render world-space.
  const toolOverlay = new ToolOverlay(planes.world, () => controller.items())
  const tools = new ToolManager(controller, {
    create: (input) =>
      void gateway.execute('CreateDecoration', {
        decorationId: crypto.randomUUID(),
        canvasId,
        ...input,
      }),
    renderPreview: (preview) => toolOverlay.renderPreview(preview),
    highlightPlacement: (id) => toolOverlay.highlightPlacement(id),
  })

  let refreshing = false
  let refreshQueued = false
  async function refresh(): Promise<void> {
    // Coalesce bursts of project-changed events into one trailing query.
    if (refreshing) {
      refreshQueued = true
      return
    }
    refreshing = true
    try {
      const scene = await runQuery<CanvasScene | null>('getCanvasScene', { canvasId })
      if (!scene) {
        sync.clear()
        controller.setItems([])
        return
      }
      const color = backgroundSync.apply(scene.background)
      app.renderer.background.color = color ?? '#17191d'
      sync.apply(scene.items)
      controller.setItems(scene.items)
      drawSelection()
    } finally {
      refreshing = false
      if (refreshQueued) {
        refreshQueued = false
        void refresh()
      }
    }
  }

  // Restore the persisted viewpoint before first paint (§4.4).
  const initialScene = await runQuery<CanvasScene | null>('getCanvasScene', { canvasId })
  if (initialScene) controller.camera.set(initialScene.camera)
  if (cameraTimer) clearTimeout(cameraTimer) // set() is a restore, not motion
  cameraTimer = null
  await refresh()

  const unsubscribe = window.ew.project.onChanged((event) => {
    gateway.noteRevision(event.revision)
    void refresh()
  })

  // ---- input wiring ----
  let spaceHeld = false
  const local = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const bounds = app.canvas.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const modifiers = (event: PointerEvent) => ({
    shift: event.shiftKey,
    alt: event.altKey,
    space: spaceHeld,
    button: event.button,
  })
  const onPointerDown = (event: PointerEvent): void => {
    app.canvas.setPointerCapture(event.pointerId)
    tools.pointerDown(local(event), modifiers(event))
  }
  const onPointerMove = (event: PointerEvent): void => {
    tools.pointerMove(local(event), modifiers(event))
  }
  const onPointerUp = (event: PointerEvent): void => {
    tools.pointerUp(local(event), modifiers(event))
  }
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    controller.wheel(local(event), event.deltaY)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceHeld = true
    if (event.code === 'Escape') tools.escape()
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceHeld = false
  }
  app.canvas.addEventListener('pointerdown', onPointerDown)
  app.canvas.addEventListener('pointermove', onPointerMove)
  app.canvas.addEventListener('pointerup', onPointerUp)
  app.canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  window.__ewDebug = {
    sceneStats: () => sync.stats(),
    canvasId: () => canvasId,
    camera: () => controller.camera.state(),
    selection: () => controller.selection.ids(),
    interactionState: () => controller.state,
    activeTool: () => tools.active,
    decorations: () =>
      controller.items().filter((item): item is SceneDecoration => item.itemKind === 'decoration'),
    decorationEndpoints: (id: string) => {
      const object = sync.get(id) as
        | { __endpoints?: { x1: number; y1: number; x2: number; y2: number } }
        | undefined
      return object?.__endpoints ?? null
    },
    decorationVisible: (id: string) => sync.get(id)?.visible ?? null,
  }

  let detachGestures: () => void = () => {}
  const handle: CanvasHostHandle = {
    controller,
    gateway,
    sync,
    registry,
    planes,
    tools,
    canvasId,
    destroy() {
      detachGestures()
      unsubscribe()
      // Flush a pending camera persist so the last rest isn't lost.
      if (cameraTimer) {
        clearTimeout(cameraTimer)
        persistCameraNow()
      }
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      delete window.__ewDebug
      app.destroy(true, { children: true })
    },
  }
  // AI-IMP-019: move driver, selection handles, reorder/flip/label UI.
  detachGestures = attachGesturesUI(handle, app.canvas)
  return handle
}
