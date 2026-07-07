import { uuidv7 } from '@ew/domain'
import {
  BackgroundSync,
  CameraFlight,
  CameraZoomChase,
  CanvasController,
  Culler,
  CommandGateway,
  createDefaultRegistry,
  createScenePlanes,
  cssColorToNumber,
  drawGrid,
  drawSnapGuides,
  hitTest,
  indexFrameTree,
  innermostFrameAt,
  lensAlpha,
  LENS_RING_COLOR,
  LENS_RING_OFFSET_PX,
  LENS_RING_WIDTH_PX,
  renderStrokeWidth,
  itemWorldAABB,
  LABEL_OUTLINE_GAP_PX,
  orientedCorners,
  SELECTION_OUTLINE_PAD_PX,
  SELECTION_OUTLINE_STROKE_PX,
  stageExtent,
  approachExtent,
  computeContentBounds,
  ratchetExtent,
  rectsEqual,
  subtractRect,
  voidEnabledForTheme,
  voidTone,
  STAGE_CONTENT_PADDING,
  STAGE_VOID_VEIL_ALPHA,
  SceneSync,
  setPlacementTextureResident,
  syncPlacementIconLod,
  syncPlacementLabelOffset,
  TextureBudget,
  ToolManager,
  ToolOverlay,
  type CanvasScene,
  type FrameCandidate,
  type FrameIndex,
  type TileAddress,
  type TileTextureSource,
  type ControllerHost,
  type GestureUpdate,
  type RendererRegistry,
  type RendererResources,
  type SceneBackground,
  type SceneDecoration,
  type SceneItem,
  type ScenePlacement,
  type ScenePlanes,
  type SnapGuide,
  type IconAtlasResource,
} from '@ew/canvas-engine'
import type { TransformContentPayload } from '@ew/commands'
import { Application, Graphics, Texture } from 'pixi.js'
import { loadIconAtlas } from './icon-atlas'
import { takeoverActive } from '../chrome/takeover'
import { appSettings, onAppSettingsChanged } from '../settings/settings'
import { themeTokenValue } from '../theme'
import { runAsUndoGroup } from '../undo/undo-store'
import { attachGesturesUI } from './gestures-ui'
import { scopedArrangePayload } from './frame-arrange'
import { FRAME_SORT_ON_DROP_PREFIX } from '@ew/protocol'
import type { Rect } from '@ew/canvas-engine'

/**
 * Bridges the Project API to the canvas engine: mounts the Pixi
 * application, resolves the root canvas, projects `getCanvasScene`,
 * re-projects on every project-changed event, and feeds pointer/
 * keyboard input to the Canvas Controller (§13.1). All domain access
 * goes through window.ew (§11.1); textures arrive over ew-asset://.
 */

/** AI-IMP-113: default bound for waitForItems, matching the strictest
 * hand-rolled site it replaces (Workspace center / jumpToPlacement both
 * used 2000 ms). A destination scene that has not applied by then is
 * treated as absent and the caller degrades gracefully. */
const WAIT_FOR_ITEMS_DEFAULT_TIMEOUT_MS = 2000

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
  /** §6.7 rev 0.50: the content-defined lit stage extent (grow-only
   * target), or null when the board has a background image or no
   * content. Zoom-to-fit frames this so the framing matches what is
   * lit. */
  contentStageExtent(): Rect | null
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
  /** Resolves after the NEXT applied scene — a one-shot wrap of
   * onSceneApplied that always detaches its listener. The primitive
   * for "issue a navigate/commit, then read the fresh scene"; do not
   * read items()/camera synchronously after navigateTo (AI-IMP-113). */
  whenSceneApplied(): Promise<void>
  /** Resolves true once every id in `ids` is present in the applied
   * scene — checked now, then on each scene-apply — or false when
   * `timeoutMs` (default 2000) elapses first. Try-now / subscribe /
   * bounded-timeout in one place; the listener always detaches, the
   * timeout path included. The canonical wait before centering or
   * selecting after a cross-canvas navigateTo (AI-IMP-113). Callers
   * degrade gracefully on false (fly to whatever is present). */
  waitForItems(ids: readonly string[], opts?: { timeoutMs?: number }): Promise<boolean>
  /** §4.9 frame create composite (AI-IMP-127/129): create-node +
   * frame-appearance + placement as one undo group; returns the new
   * frame placement id (null on failure). A caller inside its own undo
   * group (the multi-drop composite) gets the id to capture members. */
  commitFrame(region: { x: number; y: number; width: number; height: number }): Promise<string | null>
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
      /** Stage/grid presentation state (AI-IMP-032, AI-IMP-118). */
      stage: () => {
        gridVisible: boolean
        extent: { x: number; y: number; width: number; height: number } | null
        contentExtent: { x: number; y: number; width: number; height: number } | null
        contentTarget: { x: number; y: number; width: number; height: number } | null
        voidColor: number
        flightActive: boolean
        fallbackColor: string
      }
      /** Test seam: place the camera deterministically (cancels any
       * flight through the external-change hook). */
      setCamera: (state: { x: number; y: number; zoom: number }) => void
      /** AI-IMP-040: last clamp-applied render width, null if never
       * clamped away from the stored width. */
      renderedStroke: (id: string) => number | null
      /** AI-IMP-087: the placement label's on-screen bounds (CSS px,
       * stage frame) — null when the placement has no label. */
      labelBounds: (id: string) => { x: number; y: number; width: number; height: number } | null
      /** AI-IMP-087: outline/label clearance constants as shipped, so
       * e2e asserts against the real numbers (workspace dist is not
       * node-importable from a spec). */
      outlineChrome: () => { pad: number; stroke: number; gap: number }
      /** §4.8 lens introspection + drive (AI-IMP-072). */
      lens: () => string[] | null
      setLens: (ids: string[]) => void
      clearLens: () => void
      /** Display-object alpha as rendered — proves the dim at the
       * object level (1 member/no-lens, LENS_DIM_ALPHA outsider). */
      lensAlpha: (id: string) => number | null
      /** Ids ringed by the last lens adornment pass. */
      lensRings: () => string[]
      /** §4.9 (AI-IMP-127): live membership index, applied-scene fresh. */
      frameMembers: (framePlacementId: string) => string[]
      worldToScreen: (x: number, y: number) => { x: number; y: number }
      /** AI-IMP-098 zoom-feel dial: read current values with no
       * argument, set any subset live with a partial. Dev/test
       * surface ONLY — feel constants are not settings (§11.5); the
       * dialed-in numbers get frozen into the code. */
      zoomTuning: (partial?: { tau?: number; wheelSpeed?: number; pinchSpeed?: number }) => {
        tau: number
        wheelSpeed: number
        pinchSpeed: number
      }
      /** Live chase state: is a wheel/pinch glide in flight, and
       * toward what resting zoom. */
      zoomChase: () => { active: boolean; targetZoom: number | null }
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
/** §4.9 (AI-IMP-127): while an item drag hovers a frame the frame
 * focuses and the rest of the board dims to this alpha — the "this will
 * land inside" affordance. Instant (no fade), so no §8.2 clock. */
const FRAME_HOVER_DIM_ALPHA = 0.32

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
  // §8.2 object-icon atlas (AI-IMP-132): loaded once, shared by every
  // icon sprite. A failure must not sink the board — icons fall back
  // to the engine's generic glyph if the atlas can't decode.
  let iconAtlas: IconAtlasResource | undefined
  try {
    iconAtlas = await loadIconAtlas()
  } catch {
    iconAtlas = undefined
  }
  const resources: RendererResources = {
    loadTexture,
    loadTileSource,
    ...(iconAtlas ? { iconAtlas } : {}),
    textures: {
      acquire: (hash, url) => textureBudget.acquire(hash, url),
      release: (hash) => textureBudget.release(hash),
    },
    resolveObject: (id) => sync.get(id),
    // Renderers position screen-constant chrome (the label's outline
    // clearance) from the live zoom; safe because renderer calls only
    // happen after mount completes (controller exists by then).
    getZoom: () => controller.camera.zoom,
    // §4.9 frame region colors, resolved from theme tokens so the
    // renderer carries no raw hex and both themes restyle live.
    frameColors: () => ({
      fill: cssColorToNumber(themeTokenValue('--ew-frame-fill')),
      border: cssColorToNumber(themeTokenValue('--ew-frame-border')),
      label: cssColorToNumber(themeTokenValue('--ew-frame-label')),
    }),
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
            .stroke({ width: SELECTION_OUTLINE_STROKE_PX, color: SELECTION_COLOR })
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
      // Pad + stroke are engine constants (AI-IMP-087): the label's
      // screen-space clearance is derived from the same numbers, so
      // outline and label cannot drift into each other.
      const pad = SELECTION_OUTLINE_PAD_PX
      selectionGfx
        .rect(tl.x - pad, tl.y - pad, br.x - tl.x + pad * 2, br.y - tl.y + pad * 2)
        .stroke({ width: SELECTION_OUTLINE_STROKE_PX, color: SELECTION_COLOR })
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
    commitTransform(payload, meta) {
      // §4.9 (AI-IMP-127): a plain drag resolves frame membership from
      // the drop point in the SAME batch as the move (one undo); resize/
      // rotate never touch membership (geometry immunity).
      if (!meta.isMove) {
        void gateway.execute('TransformContent', payload)
        return
      }
      void resolveMoveWithMembership(payload)
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
      // §4.9 hover dim: recompute the focused frame each move (this runs
      // once per pointermove during a gesture); clears when not a move.
      updateHoverDim()
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

  // ---- §4.9 frames (AI-IMP-127) ----
  // Membership index, refreshed from getFrameTree after every applied
  // scene. Drives: carry-on-move (a dragged frame moves its members),
  // drag-end capture/release, and the hover dim. Membership is NEVER
  // inferred from geometry — only a completed ITEM drag edits it.
  let frameIndex: FrameIndex = indexFrameTree([])

  /** Current frame geometry as containment candidates, taking each
   * frame's live gesture value when it is mid-drag (`geomFor`). */
  function frameCandidates(
    geomFor: (frame: ScenePlacement) => ScenePlacement,
    exclude?: (id: string) => boolean,
  ): FrameCandidate[] {
    const out: FrameCandidate[] = []
    for (const item of controller.items()) {
      if (item.itemKind !== 'placement' || !frameIndex.isFrame(item.id)) continue
      if (exclude?.(item.id)) continue
      out.push({ placement: geomFor(item), depth: frameIndex.depthOf(item.id) })
    }
    return out
  }

  // Hover dim: focused frame + its members + the dragged items stay lit;
  // everything else drops to FRAME_HOVER_DIM_ALPHA. Instant; cleared on
  // drop/cancel (renderGuides runs with an idle state) via applyLensDim.
  let hoverFrameId: string | null = null
  function applyHoverDim(dragIds: Set<string>): void {
    if (hoverFrameId === null) return
    const keep = new Set<string>([
      hoverFrameId,
      ...frameIndex.transitiveMembers(hoverFrameId),
      ...dragIds,
    ])
    for (const item of controller.items()) {
      const object = sync.get(item.id)
      if (object) object.alpha = keep.has(item.id) ? 1 : FRAME_HOVER_DIM_ALPHA
    }
  }
  function clearHoverDim(): void {
    if (hoverFrameId === null) return
    hoverFrameId = null
    applyLensDim() // restores each object's lens-correct alpha (1 with no lens)
  }
  function updateHoverDim(): void {
    if (controller.state !== 'gesture' || !controller.gestureIsMove) {
      clearHoverDim()
      return
    }
    const dragIds = new Set<string>(ephemeral.keys())
    // Candidate frames use their live (possibly dragged) geometry, but a
    // dragged frame is never itself a drop target.
    const candidates = frameCandidates(
      (frame) => (ephemeral.get(frame.id) as ScenePlacement | undefined) ?? frame,
      (id) => dragIds.has(id),
    )
    let focus: string | null = null
    let focusDepth = -1
    for (const id of dragIds) {
      const eff = ephemeral.get(id)
      if (!eff || eff.itemKind !== 'placement' || frameIndex.isFrame(id)) continue
      const parent = frameIndex.parentOf(id)
      if (parent !== null && dragIds.has(parent)) continue // carried with its frame
      const target = innermostFrameAt({ x: eff.x, y: eff.y }, candidates)
      if (target === null) continue
      const depth = frameIndex.depthOf(target)
      if (depth > focusDepth) {
        focus = target
        focusDepth = depth
      }
    }
    if (focus === null) {
      clearHoverDim()
      return
    }
    hoverFrameId = focus
    applyHoverDim(dragIds)
  }

  // §4.9 carry-on-move: expand a plain-drag set with each selected
  // frame's transitive members, so moving a frame moves its contents as
  // one gesture / one TransformContent (one undo).
  controller.registerMoveExpansion((items) => {
    const result = new Map<string, SceneItem>()
    for (const item of items) result.set(item.id, item)
    for (const item of items) {
      if (item.itemKind !== 'placement' || !frameIndex.isFrame(item.id)) continue
      for (const memberId of frameIndex.transitiveMembers(item.id)) {
        const member = sync.item(memberId)
        if (member) result.set(memberId, member)
      }
    }
    return [...result.values()]
  })

  interface MembershipChanges {
    captures: Map<string, string[]>
    releases: string[]
  }
  /** Resolve, from a completed MOVE payload, which items changed frame:
   * an item captured by the innermost frame under its drop point, or
   * released when it lands in none. Items carried inside a frame that
   * moved with them keep their parent; frames never re-parent. */
  function computeMembershipChanges(payload: TransformContentPayload): MembershipChanges {
    const moved = payload.items.filter(
      (i): i is Extract<TransformContentPayload['items'][number], { kind: 'placement' }> =>
        i.kind === 'placement',
    )
    const movedIds = new Set(moved.map((m) => m.placementId))
    const movedById = new Map(moved.map((m) => [m.placementId, m]))
    // Candidate frames use their post-move geometry when they moved too.
    const candidates = frameCandidates((frame) => {
      const m = movedById.get(frame.id)
      if (!m) return frame
      return { ...frame, x: m.x, y: m.y, width: m.width, height: m.height, scale: m.scale, rotation: m.rotation }
    })
    const captures = new Map<string, string[]>()
    const releases: string[] = []
    for (const m of moved) {
      if (frameIndex.isFrame(m.placementId)) continue // frames never re-parent
      const currentParent = frameIndex.parentOf(m.placementId)
      if (currentParent !== null && movedIds.has(currentParent)) continue // carried
      const target = innermostFrameAt({ x: m.x, y: m.y }, candidates)
      if (target === currentParent) continue
      if (target !== null) {
        const list = captures.get(target)
        if (list) list.push(m.placementId)
        else captures.set(target, [m.placementId])
      } else if (currentParent !== null) {
        releases.push(m.placementId)
      }
    }
    return { captures, releases }
  }

  /** §4.9 sort-on-drop (AI-IMP-129): build a scoped-arrange
   * TransformContent for each captured frame whose per-frame flag is ON
   * (absent = ON), from the members' POST-MOVE geometry — this runs
   * inside the drop's undo group, so the drop + the sort are one Mod+Z.
   * Fires ONLY on a capture (never mid-drag, never a plain move / carry).
   * Direct members only: nested frames arrange their own contents. */
  function sortOnDropPayloads(
    payload: TransformContentPayload,
    captures: Map<string, string[]>,
    settings: Record<string, unknown>,
  ): TransformContentPayload[] {
    const movedById = new Map(
      payload.items
        .filter(
          (i): i is Extract<TransformContentPayload['items'][number], { kind: 'placement' }> =>
            i.kind === 'placement',
        )
        .map((m) => [m.placementId, m]),
    )
    const geomOf = (id: string): SceneItem | null => {
      const base = sync.item(id) ?? null
      if (!base || base.itemKind !== 'placement') return base
      const m = movedById.get(id)
      if (!m) return base
      return { ...base, x: m.x, y: m.y, width: m.width, height: m.height, scale: m.scale, rotation: m.rotation }
    }
    // Ids this move re-parented AWAY from a given frame (captured by
    // another frame) — excluded so a stale index entry doesn't drag them
    // back into the arrange.
    const capturedElsewhere = (frameId: string, id: string): boolean => {
      for (const [otherFrame, ids] of captures) {
        if (otherFrame !== frameId && ids.includes(id)) return true
      }
      return false
    }
    const out: TransformContentPayload[] = []
    for (const [frameId, capturedHere] of captures) {
      // Sort-on-drop tidies the frame when a genuine multi-item drop
      // lands (a Pinterest-board drop, §4.9) — a single item dragged in
      // never reshuffles the existing arrangement. `arrangePayload` is
      // itself a no-op below 2 members, so this also guards that.
      if (capturedHere.length < 2) continue
      if (settings[`${FRAME_SORT_ON_DROP_PREFIX}${frameId}`] === false) continue
      const frame = geomOf(frameId)
      if (!frame || frame.itemKind !== 'placement') continue
      // Direct members post-drop: the newly captured ids plus the frame's
      // existing direct members (stale index, minus anything leaving).
      const memberIds = new Set<string>(capturedHere)
      for (const item of controller.items()) {
        if (frameIndex.parentOf(item.id) !== frameId) continue
        if (capturedElsewhere(frameId, item.id)) continue
        memberIds.add(item.id)
      }
      const members: SceneItem[] = []
      for (const id of memberIds) {
        const g = geomOf(id)
        if (g) members.push(g)
      }
      const arrange = scopedArrangePayload(canvasId, frame, members)
      if (arrange) out.push(arrange)
    }
    return out
  }

  async function resolveMoveWithMembership(payload: TransformContentPayload): Promise<void> {
    const { captures, releases } = computeMembershipChanges(payload)
    if (captures.size === 0 && releases.length === 0) {
      await gateway.execute('TransformContent', payload)
      clearHoverDim()
      return
    }
    // §4.9 sort-on-drop reads the per-frame flags before mutating; the
    // arrange payloads are computed from the move's post-move geometry
    // (the scene has not re-applied yet) so they land in the same group.
    let arranges: TransformContentPayload[] = []
    if (captures.size > 0) {
      const response = await window.ew.project.query('getSettings')
      const settings = response.ok ? (response.result as Record<string, unknown>) : {}
      arranges = sortOnDropPayloads(payload, captures, settings)
    }
    // One undo entry: the move, every capture/release, and the scoped
    // arrange of each sort-on-drop frame all commit together.
    await runAsUndoGroup(async () => {
      await gateway.execute('TransformContent', payload)
      for (const [framePlacementId, memberPlacementIds] of captures) {
        await gateway.execute('CaptureInFrame', { framePlacementId, memberPlacementIds })
      }
      if (releases.length > 0) {
        await gateway.execute('ReleaseFromFrame', { memberPlacementIds: releases })
      }
      for (const arrange of arranges) {
        await gateway.execute('TransformContent', arrange)
      }
    })
    clearHoverDim()
  }

  /** §4.9 frame create composite (AI-IMP-127): create-node +
   * frame-appearance + placement as ONE undo entry. Region is the drawn
   * rect (top-left + size); the placement (x,y) is its center. Returns
   * the new frame placement id (or null on failure) so a caller inside
   * its OWN undo group — the multi-drop group composite (AI-IMP-129) —
   * can capture members into it; nested runAsUndoGroup runs inline. */
  async function commitFrame(region: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<string | null> {
    const nodeId = uuidv7()
    const placementId = uuidv7()
    let ok = false
    await runAsUndoGroup(async () => {
      const created = await gateway.execute('CreateNode', { nodeId })
      if (created.status !== 'committed') return
      const appearance = await gateway.execute('SetNodeAppearance', {
        nodeId,
        appearance: { kind: 'frame' },
      })
      if (appearance.status !== 'committed') return
      const placed = await gateway.execute('CreatePlacement', {
        placementId,
        canvasId,
        nodeId,
        x: region.x + region.width / 2,
        y: region.y + region.height / 2,
        width: region.width,
        height: region.height,
      })
      ok = placed.status === 'committed'
    })
    return ok ? placementId : null
  }

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
  // §6.7 rev 0.50: three world-plane graphics beneath all content —
  // the lit stage fill (both stage kinds), the grid, and the void veil
  // that dims the grid beyond a content-defined extent. Kept at the
  // bottom so content and the background image plane render above them.
  const stageFillGfx = new Graphics()
  stageFillGfx.label = 'stage-fill'
  const gridGfx = new Graphics()
  gridGfx.label = 'stage-grid'
  const voidVeilGfx = new Graphics()
  voidVeilGfx.label = 'stage-void'
  planes.world.addChildAt(stageFillGfx, 0)
  planes.world.addChildAt(gridGfx, 1)
  planes.world.addChildAt(voidVeilGfx, 2)
  let sceneBackground: SceneBackground | null = null
  // Content-defined stage ratchet (§6.7 rev 0.50). `contentTarget` is
  // the grow-only lit extent; `contentDisplayed` eases toward it so
  // growth glides and the first placement blooms. `stageSnap` makes
  // the NEXT recompute land snug without animation (board open); a
  // live edit eases. All ephemeral — nothing persisted.
  let contentTarget: Rect | null = null
  let contentDisplayed: Rect | null = null
  let stageSnap = true
  const effectiveFill = (): string => sceneBackground?.color ?? stageFallbackColor
  // The active theme drives whether the void renders (§6.7): glass turns
  // it off (the translucent desktop is the stage). applyTheme() stamps
  // documentElement's data-theme; default to dark before it runs.
  const currentTheme = (): string => document.documentElement.dataset['theme'] ?? 'dark'
  const visibleWorldRect = (): Rect => {
    const view = viewport()
    const tl = controller.camera.screenToWorld({ x: 0, y: 0 })
    const br = controller.camera.screenToWorld({ x: view.width, y: view.height })
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y }
  }
  function drawStageOrGrid(): void {
    const imageExtent = stageExtent(sceneBackground)
    if (imageExtent) {
      // Image stage (rev 0.11) — unchanged: lit rect, fixed void, no
      // grid, no veil.
      app.renderer.background.color = VOID_COLOR
      stageFillGfx.clear()
      stageFillGfx
        .rect(imageExtent.x, imageExtent.y, imageExtent.width, imageExtent.height)
        .fill({ color: effectiveFill() })
      gridGfx.clear()
      voidVeilGfx.clear()
      return
    }
    // No background image → content-defined stage over void, or (no
    // content) all void. The grid runs across both; the veil dims it
    // beyond the lit extent. Void tone derives from the effective fill.
    // On glass the void is OFF (§6.7): the desktop is the stage, so the
    // beyond-content area stays the plain fill and the grid is undimmed.
    const fill = effectiveFill()
    const voidOn = voidEnabledForTheme(currentTheme())
    app.renderer.background.color = voidOn ? voidTone(fill) : cssColorToNumber(fill)
    stageFillGfx.clear()
    if (contentDisplayed) {
      stageFillGfx
        .rect(
          contentDisplayed.x,
          contentDisplayed.y,
          contentDisplayed.width,
          contentDisplayed.height,
        )
        .fill({ color: fill })
    }
    drawGrid(gridGfx, controller.camera.state(), viewport())
    voidVeilGfx.clear()
    if (voidOn) {
      const bands = subtractRect(visibleWorldRect(), contentDisplayed)
      for (const band of bands) {
        voidVeilGfx
          .rect(band.x, band.y, band.width, band.height)
          .fill({ color: voidTone(fill), alpha: STAGE_VOID_VEIL_ALPHA })
      }
    }
  }
  // Recompute the ratcheted target from the current items and drive the
  // eased displayed extent. Snaps snug on board open; eases on edits.
  function updateContentStage(): void {
    if (sceneBackground?.assetContentHash) {
      // Image stage owns the extent; retire the content ratchet.
      contentTarget = null
      contentDisplayed = null
      stageSnap = false
      return
    }
    const rects: Rect[] = []
    for (const item of controller.items()) {
      const aabb = itemWorldAABB(item)
      if (aabb) rects.push(aabb)
    }
    const bounds = computeContentBounds(rects, STAGE_CONTENT_PADDING)
    if (stageSnap) {
      contentTarget = bounds
      contentDisplayed = bounds
      stageSnap = false
    } else {
      contentTarget = ratchetExtent(contentTarget, bounds)
    }
  }
  // Per-frame ease toward the target; redraw only when the displayed
  // extent actually moved (the snap in approachExtent ends the loop).
  app.ticker.add(() => {
    if (rectsEqual(contentDisplayed, contentTarget)) return
    const next = approachExtent(contentDisplayed, contentTarget, app.ticker.deltaMS)
    if (rectsEqual(next, contentDisplayed)) return
    contentDisplayed = next
    drawStageOrGrid()
  })
  // Repaint the stage when the flat-canvas color OR the theme flips. The
  // theme matters even when the fallback color is unchanged (dark↔glass
  // share --ew-surface-solid): glass toggles the void off/on (§6.7).
  let stageTheme = currentTheme()
  const unsubscribeSettings = onAppSettingsChanged(() => {
    const nextFill = computeStageFallback()
    const nextTheme = currentTheme()
    if (nextFill === stageFallbackColor && nextTheme === stageTheme) return
    stageFallbackColor = nextFill
    stageTheme = nextTheme
    drawStageOrGrid()
  })

  // Eased camera flights (fit/frame actions). The flight's own steps
  // survive the cancel hook; any other camera write — a pan, a pinch,
  // a restore — aborts it. Human wins.
  const flight = new CameraFlight(controller.camera)
  controller.camera.onChanged(() => flight.cancelOnExternalChange())
  app.ticker.add(() => flight.step(app.ticker.deltaMS))

  // AI-IMP-098: wheel/pinch zoom chases a cursor-anchored target
  // instead of jumping per event. Same cancel discipline as the
  // flight — any external camera write (a pan, a restore, a flight
  // step) aborts the chase; a chase tick aborts a flight (human
  // input wins). The chase owns its clock: zoomBy ticks with true
  // elapsed time at the event, the ticker keeps it moving between
  // events, and the two compose exactly (exponential smoothing).
  const zoomChase = new CameraZoomChase(controller.camera)
  controller.camera.onChanged(() => zoomChase.cancelOnExternalChange())
  app.ticker.add(() => zoomChase.tick())

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

  // AI-IMP-087: the label hangs a constant SCREEN distance below the
  // body (its world offset is clearance / zoom), but renderer updates
  // only run on scene changes — camera motion must re-derive the
  // offset here, one cheap position.set per labeled placement.
  function applyLabelClearance(): void {
    const zoom = controller.camera.zoom
    for (const canonical of controller.items()) {
      if (canonical.itemKind !== 'placement') continue
      const object = sync.get(canonical.id)
      if (!object) continue
      // Mid-gesture the display object tracks ephemeral values, like
      // drawSelection: offset from what is actually on screen.
      const item = ephemeral.get(canonical.id) ?? canonical
      if (item.itemKind !== 'placement') continue
      syncPlacementLabelOffset(object, item, zoom)
      // §8.2 (AI-IMP-132): swap object icon ↔ dot and pick the crispest
      // atlas tier for the current rendered size — camera motion never
      // re-runs a renderer update, so the LOD is re-derived here.
      syncPlacementIconLod(object, item, zoom, resources)
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
      applyLabelClearance()
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
  // §4.9 frame tool: a drawn region commits the frame create composite.
  tools.onDrawFrame = (region) => void commitFrame(region)

  const sceneAppliedListeners = new Set<() => void>()
  function notifySceneApplied(): void {
    for (const listener of sceneAppliedListeners) listener()
  }
  function subscribeSceneApplied(listener: () => void): () => void {
    sceneAppliedListeners.add(listener)
    return () => sceneAppliedListeners.delete(listener)
  }
  // AI-IMP-113: the scene-ready primitive. Every navigate-then-read
  // site used to hand-roll try-now / one-shot onSceneApplied / timeout
  // and each new copy regressed as a "flake" (IMP-018/023/048/065/073).
  function whenSceneApplied(): Promise<void> {
    return new Promise((resolve) => {
      const off = subscribeSceneApplied(() => {
        off()
        resolve()
      })
    })
  }
  function waitForItems(
    ids: readonly string[],
    opts?: { timeoutMs?: number },
  ): Promise<boolean> {
    const wanted = new Set(ids)
    const present = (): boolean => {
      if (wanted.size === 0) return true
      let hits = 0
      for (const item of controller.items()) if (wanted.has(item.id)) hits++
      return hits >= wanted.size
    }
    return new Promise((resolve) => {
      if (present()) {
        resolve(true)
        return
      }
      const off = subscribeSceneApplied(() => {
        if (!present()) return
        off()
        clearTimeout(timer)
        resolve(true)
      })
      const timer = setTimeout(() => {
        off()
        resolve(false)
      }, opts?.timeoutMs ?? WAIT_FOR_ITEMS_DEFAULT_TIMEOUT_MS)
    })
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
      // §4.9 (AI-IMP-127): scene AND frame tree fetched TOGETHER — one
      // suspension point, so the apply below stays synchronous. Adding a
      // second await between setItems and scheduleCull opened a window
      // where an openCanvas texture-release could interleave and the
      // resuming refresh re-acquired the old scene's textures (perf
      // memory-release regression).
      const forCanvas = canvasId
      const [scene, frameTree] = await Promise.all([
        runQuery<CanvasScene | null>('getCanvasScene', { canvasId }),
        runQuery<{ roots: Parameters<typeof indexFrameTree>[0] }>('getFrameTree', { canvasId }),
      ])
      // An openCanvas swap while this query was in flight makes the
      // result STALE: applying it would re-acquire the old scene's
      // just-released textures into the idle pool, which nothing purges
      // again until the next swap (§12.2 leak — the perf memory-release
      // flake). The swap's own refresh owns the new canvas; drop ours.
      if (forCanvas !== canvasId) return
      if (!scene) {
        sync.clear()
        controller.setItems([])
        frameIndex = indexFrameTree([])
        sceneBackground = null
        updateContentStage()
        drawStageOrGrid()
        notifySceneApplied()
        return
      }
      backgroundSync.apply(scene.background)
      sceneBackground = scene.background
      sync.apply(scene.items)
      controller.setItems(scene.items)
      // Rebuild the membership index so carry-on-move, drag-end capture,
      // and the hover dim read the current parents/depths.
      frameIndex = indexFrameTree(frameTree.roots)
      // §6.7 rev 0.50: recompute the content-defined stage extent from
      // the fresh items (grow-only within a session; snug on open).
      updateContentStage()
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
  // `let` deliberately (AI-IMP-098): live-tunable via
  // __ewDebug.zoomTuning so the owner dials feel against PureRef;
  // the dialed numbers then freeze here as constants (§11.5 — feel
  // constants are not settings; no UI, no persistence).
  let wheelZoomSpeed = 0.0015 // Cmd+wheel; ~×1.2 per 120px notch
  let pinchZoomSpeed = 0.01 // ctrl-flagged pinch deltas run 1–10px
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
    // A touch stops the glide (AI-IMP-098): any drag/pan gesture must
    // start from a camera at rest, never mid-chase under its feet.
    zoomChase.cancel()
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
      // AI-IMP-098: feed the chase target; the camera glides to the
      // exact zoom the old instant zoomAt chain would have produced.
      const speed = event.ctrlKey ? pinchZoomSpeed : wheelZoomSpeed
      flight.cancel() // zoom input wins over a flight, at event time
      zoomChase.zoomBy(local(event), Math.exp(-dy * speed))
    } else {
      // Pan stays 1:1 passthrough (Apple's deltas ARE the tuned
      // curve); the camera write cancels any chase via the hook.
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
    // §6.7 rev 0.50: board open recomputes the stage snug — reset the
    // ratchet so the incoming board's extent is not inherited/eased.
    contentTarget = null
    contentDisplayed = null
    stageSnap = true
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
      if (body) return body.label
      // §8.2 icon bodies carry both a sprite ('icon-object') and its
      // dot ('icon-dot'); report whichever the LOD pass left visible so
      // e2e can prove the shrink-ladder swap at two zooms.
      const iconBody = object.children.find(
        (child) => (child.label === 'icon-object' || child.label === 'icon-dot') && child.visible,
      )
      if (iconBody) return iconBody.label
      return object.children[0]?.label ?? null
    },
    stage: () => ({
      gridVisible: stageExtent(sceneBackground) === null,
      extent: stageExtent(sceneBackground),
      // §6.7 rev 0.50 content-defined stage: the eased lit extent and
      // its grow-only target (null when the board is empty / all void).
      contentExtent: contentDisplayed ? { ...contentDisplayed } : null,
      contentTarget: contentTarget ? { ...contentTarget } : null,
      voidColor: voidTone(effectiveFill()),
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
    labelBounds: (id: string) => {
      const label = sync.get(id)?.children.find((child) => child.label === 'label')
      if (!label) return null
      const bounds = label.getBounds()
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    },
    outlineChrome: () => ({
      pad: SELECTION_OUTLINE_PAD_PX,
      stroke: SELECTION_OUTLINE_STROKE_PX,
      gap: LABEL_OUTLINE_GAP_PX,
    }),
    lens: () => controller.lens.ids(),
    setLens: (ids: string[]) => controller.lens.set(ids),
    clearLens: () => controller.lens.clear(),
    lensAlpha: (id: string) => sync.get(id)?.alpha ?? null,
    lensRings: () => [...lensRingIds],
    // §4.9 frames (AI-IMP-127): the host's live membership index —
    // reflects the applied scene, so e2e gates carry/capture on it.
    frameMembers: (framePlacementId: string) =>
      frameIndex.transitiveMembers(framePlacementId).slice().sort(),
    // World→canvas-local screen: e2e computes mouse coords through the
    // live camera so panel insets/zoom never skew absolute positions.
    worldToScreen: (x: number, y: number) => controller.camera.worldToScreen({ x, y }),
    zoomTuning: (partial?: { tau?: number; wheelSpeed?: number; pinchSpeed?: number }) => {
      if (partial?.tau !== undefined) zoomChase.tau = partial.tau
      if (partial?.wheelSpeed !== undefined) wheelZoomSpeed = partial.wheelSpeed
      if (partial?.pinchSpeed !== undefined) pinchZoomSpeed = partial.pinchSpeed
      return { tau: zoomChase.tau, wheelSpeed: wheelZoomSpeed, pinchSpeed: pinchZoomSpeed }
    },
    zoomChase: () => ({ active: zoomChase.active, targetZoom: zoomChase.targetZoom }),
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
      if (target) {
        // An explicit framing action supersedes a wheel glide
        // (AI-IMP-098) — cancel first so the chase's next tick
        // cannot abort the flight through the external-change hook.
        zoomChase.cancel()
        flight.flyTo(target)
      }
    },
    contentStageExtent: () => (contentTarget ? { ...contentTarget } : null),
    commitFrame,
    setLens: (ids: readonly string[]) => controller.lens.set(ids),
    clearLens: () => controller.lens.clear(),
    lens: () => controller.lens.ids(),
    onLensChanged: (listener) => controller.lens.onChanged(listener),
    onSceneApplied: subscribeSceneApplied,
    whenSceneApplied,
    waitForItems,
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
