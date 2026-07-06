import { uuidv7 } from '@ew/domain'
import {
  BackgroundSync,
  CameraFlight,
  CanvasController,
  Culler,
  CommandGateway,
  createDefaultRegistry,
  createScenePlanes,
  drawGrid,
  drawSnapGuides,
  hitTest,
  lensAlpha,
  LENS_RING_COLOR,
  LENS_RING_OFFSET_PX,
  LENS_RING_WIDTH_PX,
  renderStrokeWidth,
  itemWorldAABB,
  orientedCorners,
  stageExtent,
  SceneSync,
  setPlacementTextureResident,
  TextureBudget,
  ToolManager,
  ToolOverlay,
  type CanvasScene,
  type TileAddress,
  type TileTextureSource,
  type ControllerHost,
  type GestureUpdate,
  type RendererRegistry,
  type RendererResources,
  type SceneBackground,
  type SceneDecoration,
  type SceneItem,
  type ScenePlanes,
  type SnapGuide,
} from '@ew/canvas-engine'
import { Application, Graphics, Texture } from 'pixi.js'
import { takeoverActive } from '../chrome/takeover'
import { appSettings, onAppSettingsChanged } from '../settings/settings'
import { themeTokenValue } from '../theme'
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
  /** Live id of the mounted canvas (changes on openCanvas). */
  readonly canvasId: string
  /** Item as currently displayed: ephemeral gesture values when a
   * gesture is in flight (or committed but not yet re-queried),
   * canonical scene values otherwise. Adornments drawn from anything
   * else visibly detach from their objects (AI-IMP-025). */
  effectiveItem(id: string): SceneItem | null
  /** Eased camera flight framing `bounds` (§6.9 rev 0.11); any user
   * camera input aborts it. */
  flyTo(bounds: Rect): void
  /** §4.8/§7.5 lens: dim everything but `ids` to a fraction of full
   * strength and ring the members. A view state, not a selection —
   * survives pan/zoom/edit, drops on Escape or clearLens(). */
  setLens(ids: readonly string[]): void
  clearLens(): void
  /** Current lens member ids, or null when no lens is applied. */
  lens(): string[] | null
  /** Fires on every lens change (set, clear, Escape, scene-apply
   * shrink) — consumers like the tag-panel toggle track it so an
   * engine-side drop unsets their UI. Returns an unsubscribe. */
  onLensChanged(listener: (ids: readonly string[] | null) => void): () => void
  /** Fires after every applied scene (AI-IMP-054): the deterministic
   * signal for UI that reads scene/controller snapshots — replaces
   * the 120 ms trailing-refresh heuristic. Returns an unsubscribe. */
  onSceneApplied(listener: () => void): () => void
  /** §12.2 single live canvas: swap the mounted canvas, releasing
   * the previous scene's textures. */
  openCanvas(canvasId: string): Promise<void>
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
      cullStats: () => { total: number; renderable: number; resident: number }
      textureStats: () => { textures: number; residentBytes: number; idleBytes: number }
      frameStats: () => { frames: number; p50: number; p95: number; max: number }
      resetFrameStats: () => void
      glInfo: () => { type: string; renderer: string }
      openCanvas: (canvasId: string) => Promise<void>
      backgroundTiled: () => boolean
      decorations: () => SceneDecoration[]
      decorationEndpoints: (id: string) => { x1: number; y1: number; x2: number; y2: number } | null
      decorationVisible: (id: string) => boolean | null
      guides: () => SnapGuide[]
      /** Body child label — 'image' vs 'image-placeholder' proves
       * texture state at the pixel-adjacent level (AI-IMP-025). */
      placementBody: (id: string) => string | null
      /** Stage/grid presentation state (AI-IMP-032). */
      stage: () => {
        gridVisible: boolean
        extent: { x: number; y: number; width: number; height: number } | null
        flightActive: boolean
        fallbackColor: string
      }
      /** Test seam: place the camera deterministically (cancels any
       * flight through the external-change hook). */
      setCamera: (state: { x: number; y: number; zoom: number }) => void
      /** AI-IMP-040: last clamp-applied render width, null if never
       * clamped away from the stored width. */
      renderedStroke: (id: string) => number | null
      /** §4.8 lens introspection + drive (AI-IMP-072). */
      lens: () => string[] | null
      setLens: (ids: string[]) => void
      clearLens: () => void
      /** Display-object alpha as rendered — proves the dim at the
       * object level (1 member/no-lens, LENS_DIM_ALPHA outsider). */
      lensAlpha: (id: string) => number | null
      /** Ids ringed by the last lens adornment pass. */
      lensRings: () => string[]
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
  const texture = Texture.from(bitmap)
  // Mipmaps: images on a board spend their lives downscaled, and
  // linear-only minification shimmers during camera motion.
  texture.source.autoGenerateMipmaps = true
  return texture
}

/**
 * §12.2 tiled backgrounds: ImageBitmap decodes originals far beyond
 * the GPU texture cap; tiles slice (and downscale by 2^level) on
 * demand. The original asset is never modified — this is a read-time
 * derivative (disk-cached pyramids stay deferred with the thumbnail
 * generator scope).
 */
async function loadTileSource(url: string): Promise<TileTextureSource> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`asset fetch failed: ${url} (${response.status})`)
  const bitmap = await createImageBitmap(await response.blob())
  return {
    width: bitmap.width,
    height: bitmap.height,
    async texture(tile: TileAddress) {
      const scale = 2 ** tile.level
      const slice = await createImageBitmap(bitmap, tile.sx, tile.sy, tile.sw, tile.sh, {
        resizeWidth: Math.max(1, Math.round(tile.sw / scale)),
        resizeHeight: Math.max(1, Math.round(tile.sh / scale)),
        resizeQuality: 'high',
      })
      const texture = Texture.from(slice)
      texture.source.autoGenerateMipmaps = true
      return texture
    },
    destroy() {
      bitmap.close()
    },
  }
}

const CAMERA_PERSIST_DEBOUNCE_MS = 500
const SELECTION_COLOR = 0x4a9df0

export async function mountCanvasHost(element: HTMLElement): Promise<CanvasHostHandle> {
  const app = new Application()
  // Device-pixel rendering (AI-IMP-029): without an explicit
  // resolution the canvas rasterizes at CSS pixels and the compositor
  // upscales it — permanently soft on Retina. autoDensity keeps all
  // screen coordinates in CSS px. (DPR is read once at mount; moving
  // the window across monitors with different DPR keeps the old one.)
  await app.init({
    resizeTo: element,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    background: themeTokenValue('--ew-surface-solid'),
  })
  element.appendChild(app.canvas)

  const planes = createScenePlanes()
  app.stage.addChild(planes.world, planes.overlay)
  const registry = createDefaultRegistry()
  const textureBudget = new TextureBudget(loadTexture)
  const resources: RendererResources = {
    loadTexture,
    loadTileSource,
    textures: {
      acquire: (hash, url) => textureBudget.acquire(hash, url),
      release: (hash) => textureBudget.release(hash),
    },
    resolveObject: (id) => sync.get(id),
  }
  const sync: SceneSync = new SceneSync(planes.content, registry, resources)
  const maxTextureSize =
    (app.renderer as unknown as { limits?: { maxTextureSize?: number } }).limits
      ?.maxTextureSize ?? 4096
  const backgroundSync = new BackgroundSync(planes.background, resources, maxTextureSize)

  const selectionGfx = new Graphics()
  const marqueeGfx = new Graphics()
  // Lens rings sit under the selection chrome: both can show on the
  // same item and the selection box must stay legible on top.
  const lensGfx = new Graphics()
  // Guides live in the world plane: drawSnapGuides authors world-unit
  // geometry with screen-constant dash/width divided by zoom (§6.9).
  const guidesGfx = new Graphics()
  planes.overlay.addChild(lensGfx, selectionGfx, marqueeGfx)
  planes.world.addChild(guidesGfx)

  const project = await runQuery<{ id: string; rootNodeId: string; revision: number }>(
    'getProject',
  )
  const rootCanvas = await runQuery<{ id: string }>('getCanvasByNode', {
    nodeId: project.rootNodeId,
  })
  let canvasId = rootCanvas.id
  const gateway = new CommandGateway(
    { execute: (envelope) => window.ew.project.execute(envelope) },
    project.id,
    project.revision,
    uuidv7,
  )

  // Ephemeral gesture values, keyed by item id: the display objects
  // are updated per pointermove, and the selection outline must track
  // THOSE values, not the canonical scene (which only changes at
  // commit) — otherwise chrome visibly detaches from the object
  // during drags (AI-IMP-025). Cleared when a fresh scene lands.
  const ephemeral = new Map<string, SceneItem>()

  function drawSelection(): void {
    selectionGfx.clear()
    const selected = controller.selectedItems()
    for (const canonical of selected) {
      const item = ephemeral.get(canonical.id) ?? canonical
      // A single oriented item gets the PureRef-style rotated box
      // (AI-IMP-031); everything else keeps the axis-aligned rect.
      if (selected.length === 1) {
        const corners = orientedCorners(item)
        if (corners) {
          const pts = corners.map((c) => controller.camera.worldToScreen(c))
          selectionGfx
            .poly(pts.flatMap((p) => [p.x, p.y]))
            .stroke({ width: 1.5, color: SELECTION_COLOR })
          continue
        }
      }
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

  // §4.8/§7.5 lens: the dim is a root-container alpha multiply — the
  // one mechanism that treats images, pins, and every decoration kind
  // uniformly (renderers never touch root alpha, so it survives their
  // updates; new objects from a scene apply get it re-stamped below).
  // Members get an accent ring in the adornment pass, screen-space
  // like the selection box but visually distinct (color + rounding).
  let lensRingIds: string[] = []
  function applyLensDim(): void {
    for (const item of controller.items()) {
      const object = sync.get(item.id)
      if (object) object.alpha = lensAlpha(controller.lens, item.id)
    }
  }
  function drawLensRings(): void {
    lensGfx.clear()
    lensRingIds = []
    const members = controller.lens.ids()
    if (!members) return
    for (const id of members) {
      // Ephemeral gesture values, like drawSelection: the ring must
      // track the dragged object, not the last committed scene.
      const item = ephemeral.get(id) ?? sync.item(id)
      if (!item) continue
      const aabb = itemWorldAABB(item)
      if (!aabb) continue
      const tl = controller.camera.worldToScreen({ x: aabb.x, y: aabb.y })
      const br = controller.camera.worldToScreen({
        x: aabb.x + aabb.width,
        y: aabb.y + aabb.height,
      })
      const pad = LENS_RING_OFFSET_PX
      lensGfx
        .roundRect(tl.x - pad, tl.y - pad, br.x - tl.x + pad * 2, br.y - tl.y + pad * 2, pad)
        .stroke({ width: LENS_RING_WIDTH_PX, color: LENS_RING_COLOR })
      lensRingIds.push(id)
    }
  }
  function drawLens(): void {
    applyLensDim()
    drawLensRings()
  }

  let lastGuides: SnapGuide[] = []
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
      let effective: SceneItem | null = null
      if (update.kind === 'placement' && item.itemKind === 'placement') {
        effective = { ...item, ...update.transform } as SceneItem
      } else if (update.kind === 'decoration' && item.itemKind === 'decoration') {
        effective = { ...item, data: update.data } as SceneItem
      }
      if (effective) {
        ephemeral.set(id, effective)
        registry.resolve(item).update(object, effective, item, resources)
      }
      drawSelection()
      drawLensRings()
    },
    restoreItem(item: SceneItem) {
      ephemeral.delete(item.id)
      const object = sync.get(item.id)
      if (object) registry.resolve(item).update(object, item, item, resources)
      drawSelection()
      drawLensRings()
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
      lastGuides = guides
      drawSnapGuides(guidesGfx, guides, controller.camera)
    },
    cameraChanged() {
      controller.camera.applyTo(planes.world)
      drawSelection()
      // The dim rides the world plane; only the screen-space rings move.
      drawLensRings()
      // Dash/width are zoom-derived; redraw live guides at the new zoom.
      if (lastGuides.length > 0) drawSnapGuides(guidesGfx, lastGuides, controller.camera)
      persistCameraSoon()
      scheduleCull()
    },
  }

  const controller = new CanvasController(controllerHost, canvasId)
  controller.selection.onChanged(() => drawSelection())
  controller.lens.onChanged(() => drawLens())

  // §12.2: culling + lazy texture residency, coalesced to one pass
  // per rendered frame (camera events arrive per pointer move).
  const culler = new Culler(sync, controller.camera, {
    onEnterResidency: (id, item) => {
      const object = sync.get(id)
      if (object && item.itemKind === 'placement') {
        setPlacementTextureResident(object, item, resources, true)
      }
    },
    onLeaveResidency: (id, item) => {
      const object = sync.get(id)
      if (object && item.itemKind === 'placement') {
        setPlacementTextureResident(object, item, resources, false)
      }
    },
  })
  const viewport = () => ({ width: element.clientWidth, height: element.clientHeight })

  // §6.7/§6.9 rev 0.11 (AI-IMP-032): stage-or-grid presentation. A
  // background image defines the stage — void color beyond, stage
  // fill beneath the image, no grid. Without one, the adaptive grid
  // covers the visible world. Redrawn with every cull pass (camera
  // changes and scene refreshes).
  const VOID_COLOR = 0x101215
  // §11.5 flat canvas color: boards with no background of their own
  // paint the chosen swatch (an --ew-canvas-flat-N token) instead of
  // the theme surface. Cached because this runs per cull pass; the
  // settings subscription below refreshes it on setting AND theme
  // changes (the store re-notifies after tokens flip).
  function computeStageFallback(): string {
    const token = appSettings().flatCanvasColor
    if (token !== 'off') {
      try {
        return themeTokenValue(token)
      } catch {
        // Unknown swatch token (stale config): theme surface wins.
      }
    }
    return themeTokenValue('--ew-surface-solid')
  }
  let stageFallbackColor = computeStageFallback()
  const stageGfx = new Graphics()
  stageGfx.label = 'stage'
  planes.world.addChildAt(stageGfx, 0)
  let sceneBackground: SceneBackground | null = null
  function drawStageOrGrid(): void {
    const extent = stageExtent(sceneBackground)
    if (extent) {
      app.renderer.background.color = VOID_COLOR
      stageGfx.clear()
      stageGfx
        .rect(extent.x, extent.y, extent.width, extent.height)
        .fill({ color: sceneBackground?.color ?? stageFallbackColor })
    } else {
      app.renderer.background.color = sceneBackground?.color ?? stageFallbackColor
      drawGrid(stageGfx, controller.camera.state(), viewport())
    }
  }
  const unsubscribeSettings = onAppSettingsChanged(() => {
    const next = computeStageFallback()
    if (next === stageFallbackColor) return
    stageFallbackColor = next
    drawStageOrGrid()
  })

  // Eased camera flights (fit/frame actions). The flight's own steps
  // survive the cancel hook; any other camera write — a pan, a pinch,
  // a restore — aborts it. Human wins.
  const flight = new CameraFlight(controller.camera)
  controller.camera.onChanged(() => flight.cancelOnExternalChange())
  app.ticker.add(() => flight.step(app.ticker.deltaMS))

  // AI-IMP-040: strokes never RENDER below one device pixel — a
  // sub-pixel line rasterizes as broken fragments. The clamp is
  // presentation-only (data untouched) and re-applies only when the
  // target drifts >20% from what's on the display object, so
  // continuous zooming does a bounded number of redraws.
  function applyStrokeClamp(): void {
    const zoom = controller.camera.zoom
    for (const item of controller.items()) {
      if (item.itemKind !== 'decoration') continue
      if (ephemeral.has(item.id)) continue // gestures own these frames
      const data = item.data as Record<string, unknown>
      const width = data['strokeWidth']
      if (typeof width !== 'number' || !Number.isFinite(width)) continue
      const object = sync.get(item.id) as
        | ({ __renderStroke?: number } & NonNullable<ReturnType<typeof sync.get>>)
        | undefined
      if (!object) continue
      const target = renderStrokeWidth(width, zoom)
      const applied = object.__renderStroke ?? width
      if (Math.abs(target - applied) <= applied * 0.2) continue
      object.__renderStroke = target
      registry
        .resolve(item)
        .update(object, { ...item, data: { ...data, strokeWidth: target } } as SceneItem, item, resources)
    }
  }

  let cullQueued = false
  function scheduleCull(): void {
    if (cullQueued) return
    cullQueued = true
    requestAnimationFrame(() => {
      cullQueued = false
      culler.apply(controller.items(), viewport())
      const view = viewport()
      const tl = controller.camera.screenToWorld({ x: 0, y: 0 })
      const br = controller.camera.screenToWorld({ x: view.width, y: view.height })
      backgroundSync.updateView(controller.camera.zoom, {
        x: tl.x,
        y: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
      })
      drawStageOrGrid()
      applyStrokeClamp()
    })
  }

  // AI-IMP-021: draw tools sit in front of the controller; select
  // mode passes events through unchanged. One CreateDecoration per
  // completed gesture; previews/highlights render world-space.
  const toolOverlay = new ToolOverlay(planes.world, () => controller.items())
  const tools = new ToolManager(controller, {
    create: (input) =>
      void gateway.execute('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId,
        ...input,
      }),
    renderPreview: (preview) => toolOverlay.renderPreview(preview),
    highlightPlacement: (id) => toolOverlay.highlightPlacement(id),
  })

  const sceneAppliedListeners = new Set<() => void>()
  function notifySceneApplied(): void {
    for (const listener of sceneAppliedListeners) listener()
  }

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
        sceneBackground = null
        drawStageOrGrid()
        notifySceneApplied()
        return
      }
      backgroundSync.apply(scene.background)
      sceneBackground = scene.background
      sync.apply(scene.items)
      controller.setItems(scene.items)
      // The canonical scene now reflects (or supersedes) any committed
      // gesture; ephemeral overlays would only go stale from here.
      ephemeral.clear()
      drawSelection()
      // Re-stamp the dim (created objects default to alpha 1) and the
      // rings; setItems already intersected the lens with survivors.
      drawLens()
      scheduleCull()
      notifySceneApplied()
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
  // §6.9 camera input: platform muscle memory. Chromium delivers macOS
  // trackpad pinch as ctrl-flagged wheel events with small fractional
  // deltas; plain wheel events are two-finger scroll (or a discrete
  // wheel, which Phase 1 lets pan — Cmd+wheel zooms deliberately).
  const WHEEL_ZOOM_SPEED = 0.0015 // Cmd+wheel; ~×1.2 per 120px notch
  const PINCH_ZOOM_SPEED = 0.01 // ctrl-flagged pinch deltas run 1–10px
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
  /** Base cursor for the host's interaction state; gestures-ui runs
   * after this on the same pointermove and overrides on handle hover. */
  const cursorFor = (point?: { x: number; y: number }): string => {
    if (tools.active !== 'select') return 'crosshair'
    const state = controller.state
    if (state === 'panning' || state === 'gesture' || state === 'gesture-pending')
      return 'grabbing'
    if (spaceHeld) return 'grab'
    if (point && state === 'idle') {
      const hit = hitTest(controller.camera.screenToWorld(point), controller.items())
      if (hit) return 'move'
    }
    return 'default'
  }
  const updateCursor = (point?: { x: number; y: number }): void => {
    // Unconditional write: gestures-ui may have overridden last frame,
    // so caching the previous value here would leave stale cursors.
    app.canvas.style.cursor = cursorFor(point)
  }
  const onPointerDown = (event: PointerEvent): void => {
    app.canvas.setPointerCapture(event.pointerId)
    tools.pointerDown(local(event), modifiers(event))
    updateCursor(local(event))
  }
  const onPointerMove = (event: PointerEvent): void => {
    tools.pointerMove(local(event), modifiers(event))
    updateCursor(local(event))
  }
  const onPointerUp = (event: PointerEvent): void => {
    tools.pointerUp(local(event), modifiers(event))
    updateCursor(local(event))
  }
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    // deltaMode 1 = lines, 2 = pages; normalize to pixels before use.
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? app.canvas.clientHeight || 800 : 1
    const dx = event.deltaX * unit
    const dy = event.deltaY * unit
    if (event.ctrlKey || event.metaKey) {
      const speed = event.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED
      controller.camera.zoomAt(local(event), Math.exp(-dy * speed))
    } else {
      controller.camera.panByScreen(-dx, -dy)
    }
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    // §8.2 takeover scoping (AI-IMP-068): no space-pan or tool
    // escape while a project-global view owns the window.
    if (takeoverActive()) return
    if (event.code === 'Space') {
      spaceHeld = true
      updateCursor()
    }
    if (event.code === 'Escape') tools.escape()
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      spaceHeld = false
      updateCursor()
    }
  }
  app.canvas.addEventListener('pointerdown', onPointerDown)
  app.canvas.addEventListener('pointermove', onPointerMove)
  app.canvas.addEventListener('pointerup', onPointerUp)
  app.canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  // §12.1 frame probe: rolling deltaMS samples off the app ticker.
  const FRAME_RING = 600
  let frameSamples: number[] = []
  app.ticker.add(() => {
    frameSamples.push(app.ticker.deltaMS)
    if (frameSamples.length > FRAME_RING) frameSamples.shift()
  })
  function frameStats(): { frames: number; p50: number; p95: number; max: number } {
    if (frameSamples.length === 0) return { frames: 0, p50: 0, p95: 0, max: 0 }
    const sorted = [...frameSamples].sort((a, b) => a - b)
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
    return {
      frames: sorted.length,
      p50: at(0.5),
      p95: at(0.95),
      max: sorted[sorted.length - 1]!,
    }
  }

  /** Benchmark lesson (EPIC-001): numbers off software GL are noise —
   * expose the real GL renderer string so perf specs can refuse it. */
  function glInfo(): { type: string; renderer: string } {
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl
    if (!gl) return { type: 'unknown', renderer: 'unknown' }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    return { type: 'webgl', renderer }
  }

  async function openCanvas(nextCanvasId: string): Promise<void> {
    if (nextCanvasId === canvasId) return
    // Flush the outgoing camera before re-targeting (§4.4 viewpoint).
    if (cameraTimer) {
      clearTimeout(cameraTimer)
      persistCameraNow()
    }
    canvasId = nextCanvasId
    controller.setCanvas(nextCanvasId)
    // Memory release on swap (§12.2): an empty cull pass fires the
    // residency-leave hooks (each releases its budget ref) while the
    // display objects still exist; then the scene and the idle pool go.
    culler.apply([], viewport())
    sync.clear()
    textureBudget.releaseAll()
    const scene = await runQuery<CanvasScene | null>('getCanvasScene', { canvasId })
    if (scene) controller.camera.set(scene.camera)
    if (cameraTimer) clearTimeout(cameraTimer)
    cameraTimer = null
    await refresh()
  }

  window.__ewDebug = {
    sceneStats: () => sync.stats(),
    canvasId: () => canvasId,
    camera: () => controller.camera.state(),
    selection: () => controller.selection.ids(),
    interactionState: () => controller.state,
    activeTool: () => tools.active,
    cullStats: () => culler.stats(controller.items()),
    textureStats: () => textureBudget.stats(),
    frameStats,
    resetFrameStats: () => {
      frameSamples = []
    },
    glInfo,
    openCanvas,
    backgroundTiled: () => backgroundSync.tiled,
    decorations: () =>
      controller.items().filter((item): item is SceneDecoration => item.itemKind === 'decoration'),
    decorationEndpoints: (id: string) => {
      const object = sync.get(id) as
        | { __endpoints?: { x1: number; y1: number; x2: number; y2: number } }
        | undefined
      return object?.__endpoints ?? null
    },
    decorationVisible: (id: string) => sync.get(id)?.visible ?? null,
    guides: () => lastGuides.map((guide) => ({ ...guide })),
    placementBody: (id: string) => {
      const object = sync.get(id)
      if (!object) return null
      const body = object.children.find(
        (child) => child.label === 'image' || child.label === 'image-placeholder',
      )
      return body?.label ?? object.children[0]?.label ?? null
    },
    stage: () => ({
      gridVisible: stageExtent(sceneBackground) === null,
      extent: stageExtent(sceneBackground),
      flightActive: flight.active,
      // §11.5 flat canvas color (074): what a background-less board
      // actually paints right now.
      fallbackColor: stageFallbackColor,
    }),
    setCamera: (state: { x: number; y: number; zoom: number }) => {
      controller.camera.set(state)
    },
    renderedStroke: (id: string) => {
      const object = sync.get(id) as { __renderStroke?: number } | undefined
      return object?.__renderStroke ?? null
    },
    lens: () => controller.lens.ids(),
    setLens: (ids: string[]) => controller.lens.set(ids),
    clearLens: () => controller.lens.clear(),
    lensAlpha: (id: string) => sync.get(id)?.alpha ?? null,
    lensRings: () => [...lensRingIds],
  }

  let detachGestures: () => void = () => {}
  const handle: CanvasHostHandle = {
    controller,
    gateway,
    sync,
    registry,
    planes,
    tools,
    get canvasId() {
      return canvasId
    },
    effectiveItem: (id: string) => ephemeral.get(id) ?? sync.item(id) ?? null,
    flyTo: (bounds: Rect) => {
      const target = controller.camera.fitTarget(bounds, viewport())
      if (target) flight.flyTo(target)
    },
    setLens: (ids: readonly string[]) => controller.lens.set(ids),
    clearLens: () => controller.lens.clear(),
    lens: () => controller.lens.ids(),
    onLensChanged: (listener) => controller.lens.onChanged(listener),
    onSceneApplied(listener: () => void): () => void {
      sceneAppliedListeners.add(listener)
      return () => sceneAppliedListeners.delete(listener)
    },
    openCanvas,
    destroy() {
      textureBudget.releaseAll()
      detachGestures()
      unsubscribe()
      unsubscribeSettings()
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
