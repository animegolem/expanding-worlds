import {
  classifyCursorZone,
  createResizeDriver,
  hitTest,
  moveDriver,
  orientedBox,
  orientedCorners,
  reorderPayloads,
  rotateDriver,
  unionBounds,
  type CursorZone,
  type Point,
  type Rect,
  type ReorderOp,
  type ResizeHandle,
  type SceneItem,
  type ScenePlacement,
} from '@ew/canvas-engine'
import { uuidv7 } from '@ew/domain'
import { Graphics, type Text } from 'pixi.js'
import { takeoverActive } from '../chrome/takeover'
import { KEY } from '../keys/bindings'
import { matches } from '../keys/registry'
import type { CanvasHostHandle } from './host'

/**
 * Placement manipulation UI, cursor-zone edition (AI-IMP-062, §6.9
 * rev 0.17): selection draws a thin outline only — no handles are
 * ever rendered. The cursor is the affordance, driven by hot zones
 * around the selection (inside = move, edge band = directional
 * resize, corner = diagonal resize, a narrow band outside a corner =
 * rotate, empty canvas = grab/pan). Zone presses start the matching
 * gesture through the controller (one durable TransformContent per
 * gesture, §10.2); ⌥-drag inside duplicates via one CreatePlacement
 * (§6.5: another placement of the same node); locked items refuse
 * transforms with a `not-allowed` cursor and no drag. Instantaneous
 * acts (reorder, flip, delete) keep their keyboard commands.
 */

/** ⌥-click without travel must not duplicate (mirrors the
 * controller's DRAG_THRESHOLD_PX). */
const DUPLICATE_THRESHOLD_PX = 4

const GHOST_COLOR = 0x4a9df0

declare global {
  interface Window {
    /** e2e hooks (AI-IMP-019/062); separate from host's __ewDebug. */
    __ewGestureDebug?: {
      /** Cursor zone at a canvas-local point for the live selection. */
      zoneAt: (x: number, y: number) => string
      labelTexts: () => string[]
    }
  }
}

export function attachGesturesUI(
  handle: CanvasHostHandle,
  canvas: HTMLCanvasElement,
): () => void {
  const { controller, gateway, sync, planes } = handle
  controller.registerMoveDriver(moveDriver)

  // ⌥-duplicate ghost: transient gesture feedback (like marquee and
  // snap guides), not selection adornment — §6.9 forbids only chrome.
  const ghostGfx = new Graphics()
  ghostGfx.label = 'duplicate-ghost'
  planes.overlay.addChild(ghostGfx)

  interface DupDrag {
    source: ScenePlacement
    startScreen: Point
    currentScreen: Point
    pointerId: number
  }
  let dupDrag: DupDrag | null = null
  let spaceHeld = false
  /** Cursor held while a zone-started resize/rotate is in flight. */
  let gestureCursor: string | null = null

  function selectedPlacements(): ScenePlacement[] {
    return controller
      .selectedItems()
      .filter((item): item is ScenePlacement => item.itemKind === 'placement')
  }

  /** Effective (ephemeral-aware) selection: during and just after a
   * gesture the canonical scene lags the display objects (AI-IMP-025). */
  function effectiveSelection(): SceneItem[] {
    return controller.selectedItems().map((item) => handle.effectiveItem(item.id) ?? item)
  }

  /** Zone frame: a single oriented item rotates its zones with the
   * body (AI-IMP-031); a multi-selection keeps the union AABB. */
  function zoneFrame(items: readonly SceneItem[]): { bounds: Rect; rotation: number } | null {
    if (items.length === 1) {
      const box = orientedBox(items[0]!)
      if (box) {
        return {
          bounds: {
            x: box.cx - box.halfW,
            y: box.cy - box.halfH,
            width: box.halfW * 2,
            height: box.halfH * 2,
          },
          rotation: box.rotation,
        }
      }
    }
    const bounds = unionBounds(items)
    return bounds ? { bounds, rotation: 0 } : null
  }

  function zoneAtPoint(point: Point): { zone: CursorZone; rotation: number } {
    const items = effectiveSelection()
    const frame = items.length > 0 ? zoneFrame(items) : null
    if (!frame) return { zone: 'none', rotation: 0 }
    const world = controller.camera.screenToWorld(point)
    return {
      zone: classifyCursorZone(world, frame.bounds, frame.rotation, controller.camera.zoom),
      rotation: frame.rotation,
    }
  }

  const selectionLocked = (items: readonly SceneItem[]): boolean =>
    items.some((item) => item.locked === 1)

  // §6.9 cursor affordances. Directional resize cursors are
  // angle-aware (AI-IMP-031): the zone's outward direction rotates
  // with the item and quantizes onto the four CSS resize axes.
  const RESIZE_BASE_DEG: Record<ResizeHandle, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  }
  const AXIS_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const
  /** CSS has no native rotate cursor; theme.css owns the SVG glyph
   * (--ew-cursor-rotate, crosshair fallback baked into the token). */
  const ROTATE_CURSOR =
    getComputedStyle(document.documentElement).getPropertyValue('--ew-cursor-rotate').trim() ||
    'crosshair'
  function zoneCursor(zone: CursorZone, rotation: number): string | null {
    if (zone === 'move') return 'move'
    if (zone.startsWith('resize-')) {
      const dir = zone.slice('resize-'.length) as ResizeHandle
      const deg = RESIZE_BASE_DEG[dir] + (rotation * 180) / Math.PI
      const axis = Math.round((((deg % 180) + 180) % 180) / 45) % 4
      return AXIS_CURSORS[axis]!
    }
    if (zone.startsWith('rotate-')) return ROTATE_CURSOR
    return null
  }

  function renderGhost(): void {
    ghostGfx.clear()
    if (!dupDrag) return
    const cam = controller.camera
    const start = cam.screenToWorld(dupDrag.startScreen)
    const current = cam.screenToWorld(dupDrag.currentScreen)
    const corners = orientedCorners(dupDrag.source)
    if (!corners) return
    const pts = corners.map((c) =>
      cam.worldToScreen({ x: c.x + current.x - start.x, y: c.y + current.y - start.y }),
    )
    ghostGfx
      .poly(pts.flatMap((p) => [p.x, p.y]))
      .stroke({ width: 1.5, color: GHOST_COLOR, alpha: 0.7 })
  }

  function cancelDuplicate(): void {
    dupDrag = null
    ghostGfx.clear()
    canvas.style.cursor = 'default'
  }

  /** One CreatePlacement of the same node at the release position
   * (§6.5: a copy is another placement, not another node). */
  async function commitDuplicate(releaseScreen: Point): Promise<void> {
    const drag = dupDrag!
    dupDrag = null
    ghostGfx.clear()
    const travel = Math.hypot(
      releaseScreen.x - drag.startScreen.x,
      releaseScreen.y - drag.startScreen.y,
    )
    if (travel < DUPLICATE_THRESHOLD_PX) return
    const cam = controller.camera
    const start = cam.screenToWorld(drag.startScreen)
    const release = cam.screenToWorld(releaseScreen)
    const source = drag.source
    await gateway.execute('CreatePlacement', {
      placementId: uuidv7(),
      canvasId: handle.canvasId,
      nodeId: source.nodeId,
      x: source.x + release.x - start.x,
      y: source.y + release.y - start.y,
      width: source.width,
      height: source.height,
      scale: source.scale,
      rotation: source.rotation,
      flipX: source.flipX === 1,
      flipY: source.flipY === 1,
      labelVisible: source.labelVisible === 1,
    })
  }

  async function flipSelection(axis: 'x' | 'y'): Promise<void> {
    // §6.9: flips are instantaneous acts — one command per placement.
    for (const p of selectedPlacements()) {
      await gateway.execute('FlipPlacement', { placementId: p.id, axis })
    }
  }

  async function reorderSelection(op: ReorderOp): Promise<void> {
    const payloads = reorderPayloads(handle.canvasId, controller.items(), controller.selection.ids(), op)
    for (const payload of payloads) {
      await gateway.execute('ReorderContent', payload)
    }
  }

  /** Delete/Backspace: one DeleteContent command for the whole
   * selection (§9.2 per placement; decorations hard-delete). Bare
   * nodes auto-trashed by the command surface a non-blocking notice
   * with a Keep in Project action (handled by CanvasHost). */
  async function deleteSelection(): Promise<void> {
    const items = controller.selectedItems()
    if (items.length === 0) return
    const result = await gateway.execute('DeleteContent', {
      canvasId: handle.canvasId,
      placementIds: items.filter((i) => i.itemKind === 'placement').map((i) => i.id),
      decorationIds: items.filter((i) => i.itemKind === 'decoration').map((i) => i.id),
    })
    if (result.status !== 'committed') return
    controller.selection.clear()
    const trashedNodes = result.affected
      .filter((record) => record.kind === 'node')
      .map((record) => record.id)
    if (trashedNodes.length > 0) {
      canvas.dispatchEvent(
        new CustomEvent('ew-board-notice', {
          bubbles: true,
          detail: {
            message:
              trashedNodes.length === 1
                ? 'Node moved to Trash with its last placement.'
                : `${trashedNodes.length} nodes moved to Trash with their last placements.`,
            keepNodeIds: trashedNodes,
          },
        }),
      )
    }
  }

  /** Cmd+A: every selectable item — locked or hidden decorations stay
   * out so a sweep-select can't move or delete them. Locked
   * placements stay in: they remain click-selectable and Delete is
   * not a transform (§6.9 lock refuses move/resize/rotate only). */
  function selectAll(): void {
    const ids = controller
      .items()
      .filter(
        (item) => !(item.itemKind === 'decoration' && (item.locked === 1 || item.hidden === 1)),
      )
      .map((item) => item.id)
    controller.selection.set(ids)
  }

  const local = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const overCanvas = (event: PointerEvent): boolean => {
    const rect = canvas.getBoundingClientRect()
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }

  // Capture phase so a zone press never reaches the controller's
  // hit-test path (which would start a marquee or move instead).
  const onPointerDownCapture = (event: PointerEvent): void => {
    if (event.button !== 0) return
    if (spaceHeld) return // space-pan wins over every zone
    if (handle.tools.active !== 'select') return
    if (controller.state !== 'idle') return
    const point = local(event)
    const world = controller.camera.screenToWorld(point)
    const items = effectiveSelection()
    const frame = items.length > 0 ? zoneFrame(items) : null
    const zone: CursorZone = frame
      ? classifyCursorZone(world, frame.bounds, frame.rotation, controller.camera.zoom)
      : 'none'
    if (zone === 'none') {
      // Lock refusal on first contact (§6.9): a press on a locked,
      // not-yet-selected placement selects it but never becomes a
      // drag. (Locked decorations never hit-test at all.)
      const hit = hitTest(world, controller.items())
      if (hit && hit.locked === 1) {
        event.preventDefault()
        event.stopImmediatePropagation()
        controller.selection.click(hit.id, { shift: event.shiftKey })
        canvas.style.cursor = 'not-allowed'
      }
      return
    }
    if (selectionLocked(items)) {
      // Refusal cursor, no drag starts, no command commits.
      event.preventDefault()
      event.stopImmediatePropagation()
      canvas.style.cursor = 'not-allowed'
      return
    }
    if (zone === 'move') {
      const placements = items.filter(
        (item): item is ScenePlacement => item.itemKind === 'placement',
      )
      if (event.altKey && items.length === 1 && placements.length === 1) {
        event.preventDefault()
        event.stopImmediatePropagation()
        canvas.setPointerCapture(event.pointerId)
        dupDrag = {
          source: placements[0]!,
          startScreen: point,
          currentScreen: point,
          pointerId: event.pointerId,
        }
        canvas.style.cursor = 'copy'
      }
      // Otherwise the controller's own hit-test path runs the move
      // (and keeps click-to-deselect in union-bounds gaps working).
      return
    }
    // Edge/corner/rotate zones start their gesture here.
    event.preventDefault()
    event.stopImmediatePropagation()
    canvas.setPointerCapture(event.pointerId)
    const driver = zone.startsWith('rotate-')
      ? rotateDriver
      : createResizeDriver(zone.slice('resize-'.length) as ResizeHandle)
    controller.beginGesture(controller.selectedItems(), driver, point)
    gestureCursor = zoneCursor(zone, frame?.rotation ?? 0)
  }

  // §6.9 cursor feedback: runs after the host's base-cursor write on
  // the same pointermove (canvas listeners bubble before window), so
  // a zone cursor written here wins and the host restores its base on
  // the next move once the pointer leaves the zone.
  const onWindowPointerMove = (event: PointerEvent): void => {
    if (dupDrag) {
      if (event.pointerId !== dupDrag.pointerId) return
      dupDrag.currentScreen = local(event)
      renderGhost()
      canvas.style.cursor = 'copy'
      return
    }
    if (handle.tools.active !== 'select') return
    const state = controller.state
    if (state === 'gesture' && gestureCursor) {
      // Zone-started resize/rotate keeps its directional cursor for
      // the whole drag (the host writes 'grabbing' first each move).
      canvas.style.cursor = gestureCursor
      return
    }
    if (state !== 'idle' || spaceHeld || !overCanvas(event)) return
    const point = local(event)
    const world = controller.camera.screenToWorld(point)
    const items = effectiveSelection()
    if (items.length > 0) {
      const frame = zoneFrame(items)
      if (frame) {
        const zone = classifyCursorZone(world, frame.bounds, frame.rotation, controller.camera.zoom)
        if (zone !== 'none') {
          canvas.style.cursor = selectionLocked(items)
            ? 'not-allowed'
            : zone === 'move' &&
                event.altKey &&
                items.length === 1 &&
                items[0]!.itemKind === 'placement'
              ? 'copy'
              : (zoneCursor(zone, frame.rotation) ?? 'default')
          return
        }
      }
    }
    const hit = hitTest(world, controller.items())
    if (hit) {
      // Unlocked hover keeps the host's 'move'; locked refuses.
      if (hit.locked === 1) canvas.style.cursor = 'not-allowed'
      return
    }
    canvas.style.cursor = 'grab' // §6.9: empty canvas means grab and pan
  }

  const onWindowPointerUp = (event: PointerEvent): void => {
    gestureCursor = null
    if (dupDrag && event.pointerId === dupDrag.pointerId) {
      void commitDuplicate(local(event))
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // §8.2 takeover scoping (AI-IMP-068): board gestures are dead
    // while a project-global view owns the window.
    if (takeoverActive()) return
    if (event.code === 'Space') spaceHeld = true
    if (event.code === 'Escape' && dupDrag) {
      // Esc mid-⌥-drag cancels with nothing committed.
      cancelDuplicate()
      return
    }
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }
    // §6.8/§6.9 board keys, consulting the registry (AI-IMP-117). The
    // Shift-split reorder combos are checked front/back FIRST so
    // Shift+Mod+] means "to front", exactly as the old shift ternary.
    if (matches(event, KEY.boardSendFront)) {
      event.preventDefault()
      void reorderSelection('front')
    } else if (matches(event, KEY.boardSendForward)) {
      event.preventDefault()
      void reorderSelection('forward')
    } else if (matches(event, KEY.boardSendBack)) {
      event.preventDefault()
      void reorderSelection('back')
    } else if (matches(event, KEY.boardSendBackward)) {
      event.preventDefault()
      void reorderSelection('backward')
    } else if (matches(event, KEY.boardFlipH)) {
      void flipSelection('x')
    } else if (matches(event, KEY.boardFlipV)) {
      void flipSelection('y')
    } else if (matches(event, KEY.boardDelete)) {
      event.preventDefault()
      void deleteSelection()
    } else if (matches(event, KEY.boardSelectAll)) {
      event.preventDefault()
      selectAll()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceHeld = false
  }

  canvas.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  window.__ewGestureDebug = {
    zoneAt: (x: number, y: number) => zoneAtPoint({ x, y }).zone,
    labelTexts: () => {
      const texts: string[] = []
      for (const item of controller.items()) {
        if (item.itemKind !== 'placement') continue
        const object = sync.get(item.id)
        const label = object?.children.find((child) => child.label === 'label') as
          | Text
          | undefined
        if (label) texts.push(String(label.text))
      }
      return texts
    },
  }

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    delete window.__ewGestureDebug
    ghostGfx.destroy()
  }
}
