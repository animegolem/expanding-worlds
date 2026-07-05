import {
  createResizeDriver,
  moveDriver,
  orientedCorners,
  reorderPayloads,
  rotateDriver,
  unionBounds,
  type ReorderOp,
  type ResizeHandle,
  type ScenePlacement,
} from '@ew/canvas-engine'
import { Graphics, type Text } from 'pixi.js'
import type { CanvasHostHandle } from './host'

/**
 * Placement manipulation UI (AI-IMP-019): registers the move driver,
 * renders resize/rotate handles and the label-visibility toggle in
 * the screen-space overlay plane around the selection's union bounds,
 * and wires reorder/flip shortcuts. Continuous gestures go through
 * the controller (one durable TransformContent per gesture, §10.2);
 * instantaneous acts (reorder, flip, label toggle) issue their
 * existing commands directly through the gateway.
 */

const HANDLE_SIZE = 8
const HANDLE_HIT_SLOP = 4
const ROTATE_OFFSET = 28
const HANDLE_FILL = 0xffffff
const HANDLE_STROKE = 0x4a9df0
const LABEL_BUTTON_FILL = 0x2d3540

type UiHandle =
  | { kind: 'resize'; dir: ResizeHandle; x: number; y: number }
  | { kind: 'rotate'; x: number; y: number }
  | { kind: 'label'; x: number; y: number }

declare global {
  interface Window {
    /** e2e hooks for AI-IMP-019; separate from host's __ewDebug. */
    __ewGestureDebug?: {
      handles: () => Array<{ kind: string; dir: string | null; x: number; y: number }>
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

  const gfx = new Graphics()
  gfx.label = 'gesture-handles'
  planes.overlay.addChild(gfx)
  let uiHandles: UiHandle[] = []

  function selectedPlacements(): ScenePlacement[] {
    return controller
      .selectedItems()
      .filter((item): item is ScenePlacement => item.itemKind === 'placement')
  }

  /** Angle of the currently rendered chrome (0 for AABB layouts) —
   * feeds the angle-aware resize cursors (AI-IMP-031). */
  let chromeAngle = 0

  function render(): void {
    gfx.clear()
    uiHandles = []
    chromeAngle = 0
    // 'gesture-pending' is a mousedown that may become a drag: handles
    // must appear WITH the selection outline at pointer-down, or a
    // plain click reads as two separate draws (AI-IMP-029).
    if (controller.state !== 'idle' && controller.state !== 'gesture-pending') return
    // Effective (ephemeral-aware) items: after a gesture commits, the
    // canonical scene lags until the re-query lands — drawing handles
    // from it would flash them at the pre-gesture position.
    const items = controller
      .selectedItems()
      .map((item) => handle.effectiveItem(item.id) ?? item)
    if (items.length === 0) return

    // Chrome rotates WITH a single oriented item (AI-IMP-031); a
    // multi-selection has no shared frame and keeps the union AABB.
    const toScreen = (p: { x: number; y: number }) => controller.camera.worldToScreen(p)
    let box: Array<{ x: number; y: number }> | null = null
    if (items.length === 1) {
      const oriented = orientedCorners(items[0]!)
      if (oriented) box = oriented.map(toScreen)
    }
    if (!box) {
      const bounds = unionBounds(items)
      if (!bounds) return
      const tl = toScreen({ x: bounds.x, y: bounds.y })
      const br = toScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })
      box = [
        { x: tl.x, y: tl.y },
        { x: br.x, y: tl.y },
        { x: br.x, y: br.y },
        { x: tl.x, y: br.y },
      ]
    }
    const [nw, ne, se, sw] = box as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ]
    chromeAngle = Math.atan2(ne.y - nw.y, ne.x - nw.x)
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    })
    const center = mid(nw, se)
    const outward = (p: { x: number; y: number }): { x: number; y: number } => {
      const dx = p.x - center.x
      const dy = p.y - center.y
      const len = Math.hypot(dx, dy) || 1
      return { x: dx / len, y: dy / len }
    }

    const positions: Array<[ResizeHandle, { x: number; y: number }]> = [
      ['nw', nw],
      ['n', mid(nw, ne)],
      ['ne', ne],
      ['e', mid(ne, se)],
      ['se', se],
      ['s', mid(se, sw)],
      ['sw', sw],
      ['w', mid(sw, nw)],
    ]
    for (const [dir, p] of positions) {
      uiHandles.push({ kind: 'resize', dir, x: p.x, y: p.y })
      gfx
        .rect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
        .fill({ color: HANDLE_FILL })
        .stroke({ width: 1, color: HANDLE_STROKE })
    }

    // Rotate lollipop off the oriented top edge.
    const nMid = mid(nw, ne)
    const oN = outward(nMid)
    const rotate = { x: nMid.x + oN.x * ROTATE_OFFSET, y: nMid.y + oN.y * ROTATE_OFFSET }
    uiHandles.push({ kind: 'rotate', ...rotate })
    gfx
      .moveTo(nMid.x, nMid.y)
      .lineTo(rotate.x, rotate.y)
      .stroke({ width: 1, color: HANDLE_STROKE })
      .circle(rotate.x, rotate.y, HANDLE_SIZE / 2 + 1)
      .fill({ color: HANDLE_FILL })
      .stroke({ width: 1, color: HANDLE_STROKE })

    const showLabelButton = selectedPlacements().length > 0

    // PureRef-style corner rotate zones (AI-IMP-031): invisible hover
    // targets just outside each corner. The nw corner yields to the
    // label button when present.
    for (const corner of showLabelButton ? [ne, se, sw] : [nw, ne, se, sw]) {
      const o = outward(corner)
      uiHandles.push({
        kind: 'rotate',
        x: corner.x + o.x * (HANDLE_SIZE + 10),
        y: corner.y + o.y * (HANDLE_SIZE + 10),
      })
    }

    if (showLabelButton) {
      // §4.5: label visibility toggles from the selection controls.
      const oNW = outward(nw)
      const label = {
        x: nw.x + oNW.x * (ROTATE_OFFSET * 0.7),
        y: nw.y + oNW.y * (ROTATE_OFFSET * 0.7),
      }
      uiHandles.push({ kind: 'label', ...label })
      gfx
        .roundRect(label.x - 7, label.y - 7, 14, 14, 3)
        .fill({ color: LABEL_BUTTON_FILL })
        .stroke({ width: 1, color: HANDLE_STROKE })
        .moveTo(label.x - 4, label.y + 3)
        .lineTo(label.x + 4, label.y + 3)
        .stroke({ width: 1.5, color: HANDLE_FILL })
    }
  }

  function hitHandle(point: { x: number; y: number }): UiHandle | null {
    const slop = HANDLE_SIZE / 2 + HANDLE_HIT_SLOP
    // Later-drawn controls (rotate, label) win over frame handles.
    for (let i = uiHandles.length - 1; i >= 0; i -= 1) {
      const h = uiHandles[i]!
      if (Math.abs(point.x - h.x) <= slop && Math.abs(point.y - h.y) <= slop) return h
    }
    return null
  }

  async function toggleLabels(): Promise<void> {
    const placements = selectedPlacements()
    if (placements.length === 0) return
    const visible = !placements.some((p) => p.labelVisible === 1)
    for (const p of placements) {
      await gateway.execute('SetPlacementLabelVisibility', { placementId: p.id, visible })
    }
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
   * out so a sweep-select can't move or delete them. */
  function selectAll(): void {
    const ids = controller
      .items()
      .filter(
        (item) => !(item.itemKind === 'decoration' && (item.locked === 1 || item.hidden === 1)),
      )
      .map((item) => item.id)
    controller.selection.set(ids)
  }

  const local = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  // Capture phase so a handle press never reaches the controller's
  // hit-test path (which would start a marquee or move instead).
  const onPointerDownCapture = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const point = local(event)
    const hit = hitHandle(point)
    if (!hit) return
    event.preventDefault()
    event.stopImmediatePropagation()
    canvas.setPointerCapture(event.pointerId)
    if (hit.kind === 'label') {
      void toggleLabels()
      return
    }
    const items = controller.selectedItems()
    if (items.length === 0) return
    const driver = hit.kind === 'rotate' ? rotateDriver : createResizeDriver(hit.dir)
    controller.beginGesture(items, driver, point)
    render() // hides handles while the gesture runs
  }

  // §6.9 cursor feedback: runs after the host's base-cursor write on
  // the same pointermove (canvas listeners bubble before window), so
  // setting a handle cursor here wins and the host restores default
  // on the next move once the pointer leaves the handle.
  // Angle-aware (AI-IMP-031): each handle's outward direction rotates
  // with the chrome and quantizes onto the four CSS resize axes.
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
  const resizeCursor = (dir: ResizeHandle): string => {
    const deg = RESIZE_BASE_DEG[dir] + (chromeAngle * 180) / Math.PI
    const axis = Math.round((((deg % 180) + 180) % 180) / 45) % 4
    return AXIS_CURSORS[axis]!
  }
  const onWindowPointerMove = (event: PointerEvent): void => {
    // Hide handles while a controller gesture/marquee is in flight.
    if (controller.state !== 'idle' && uiHandles.length > 0) render()
    if (controller.state !== 'idle' || uiHandles.length === 0) return
    const hit = hitHandle(local(event))
    if (!hit) return
    canvas.style.cursor =
      hit.kind === 'resize'
        ? resizeCursor(hit.dir)
        : hit.kind === 'rotate'
          ? 'crosshair'
          : 'pointer'
  }
  const onWindowPointerUp = (): void => render()

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }
    const meta = event.metaKey || event.ctrlKey
    if (meta && event.code === 'BracketRight') {
      event.preventDefault()
      void reorderSelection(event.shiftKey ? 'front' : 'forward')
    } else if (meta && event.code === 'BracketLeft') {
      event.preventDefault()
      void reorderSelection(event.shiftKey ? 'back' : 'backward')
    } else if (!meta && event.shiftKey && event.code === 'KeyH') {
      void flipSelection('x')
    } else if (!meta && event.shiftKey && event.code === 'KeyV') {
      void flipSelection('y')
    } else if (!meta && (event.code === 'Delete' || event.code === 'Backspace')) {
      event.preventDefault()
      void deleteSelection()
    } else if (meta && event.code === 'KeyA') {
      event.preventDefault()
      selectAll()
    }
  }

  const unsubscribes = [
    controller.selection.onChanged(() => render()),
    controller.camera.onChanged(() => render()),
    // onItemUpdated fires inside sync.apply(), BEFORE the host feeds
    // the fresh snapshot to controller.setItems() — defer a microtask
    // so render() reads the updated selection items, not stale ones.
    sync.onItemUpdated(() => queueMicrotask(render)),
  ]
  canvas.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('keydown', onKeyDown)

  window.__ewGestureDebug = {
    handles: () =>
      uiHandles.map((h) => ({
        kind: h.kind,
        dir: h.kind === 'resize' ? h.dir : null,
        x: h.x,
        y: h.y,
      })),
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
    for (const unsubscribe of unsubscribes) unsubscribe()
    canvas.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('keydown', onKeyDown)
    delete window.__ewGestureDebug
    gfx.destroy()
  }
}
