import { Camera, type Point, type Rect } from './camera'
import { GestureSession, type GestureUpdate } from './gesture'
import { hitTest, marqueeHits } from './hit-test'
import { Lens } from './lens'
import { Selection } from './selection'
import { noopSnapProvider, type SnapGuide, type SnapProvider } from './snap'
import type { TransformContentPayload } from '@ew/commands'
import type { SceneItem } from './types'

/**
 * Canvas Controller (§13.1): owns camera, selection, the interaction
 * state machine, hit-testing policy, and gesture lifecycle. It is
 * renderer-agnostic — the host applies ephemeral updates to display
 * objects, renders marquee/guides in the overlay, and forwards the
 * one durable command per completed gesture (invariant 25).
 *
 * Gesture drivers (move/resize/rotate, AI-IMP-019) plug in: the
 * default drag on a selected item runs the registered 'move' driver;
 * handle-driven gestures start explicitly via beginGesture().
 */

export interface GestureContext {
  session: GestureSession
  startWorld: Point
  currentWorld: Point
  modifiers: PointerModifiers
  snap: SnapProvider
  camera: Camera
}

export interface GestureDriver {
  /** Mutate the session's proposed values; return guides to render. */
  update(ctx: GestureContext): SnapGuide[]
}

export interface PointerModifiers {
  shift?: boolean
  alt?: boolean
  space?: boolean
  /** 0 left, 1 middle, 2 right (pointer events convention). */
  button?: number
}

export interface ControllerHost {
  applyEphemeral(id: string, update: GestureUpdate): void
  restoreItem(item: SceneItem): void
  /** `meta.isMove` marks a plain drag (the move driver) versus a
   * handle-driven resize/rotate — §4.9 frame membership resolves on
   * moves only, never on resize (geometry immunity, AI-IMP-127). */
  commitTransform(payload: TransformContentPayload, meta: { isMove: boolean }): void
  /** Screen-space rect, or null to clear. */
  renderMarquee(rect: Rect | null): void
  renderGuides(guides: SnapGuide[]): void
  cameraChanged(): void
}

type State =
  | { kind: 'idle' }
  | { kind: 'panning'; last: Point }
  | { kind: 'maybe-marquee'; startScreen: Point; shift: boolean }
  | { kind: 'marquee'; startScreen: Point; shift: boolean }
  | { kind: 'gesture-pending'; startScreen: Point; itemId: string }
  | { kind: 'gesture'; startScreen: Point; session: GestureSession; driver: GestureDriver }

const DRAG_THRESHOLD_PX = 4

export class CanvasController {
  readonly camera = new Camera()
  readonly selection = new Selection()
  /** §4.8/§7.5 dim-to-hits view state; never part of gestures. */
  readonly lens = new Lens()
  #host: ControllerHost
  #snap: SnapProvider = noopSnapProvider
  #moveDriver: GestureDriver | null = null
  #canvasId: string
  #items: readonly SceneItem[] = []
  #state: State = { kind: 'idle' }
  /** §4.9 frame carry (AI-IMP-127): expands the moved set for a plain
   * drag so a dragged frame carries its members. Identity by default. */
  #moveExpansion: (items: readonly SceneItem[]) => readonly SceneItem[] = (items) => items
  /** Selection may refine the ordinary render-order hit for a ruled
   * grouping relation (AI-IMP-308). Other gestures keep `hitTest`. */
  #selectionTarget: (point: Point, items: readonly SceneItem[]) => SceneItem | null = hitTest
  /** True while the in-flight gesture is a plain move (not resize/rotate). */
  #gestureIsMove = false

  constructor(host: ControllerHost, canvasId: string) {
    this.#host = host
    this.#canvasId = canvasId
    this.camera.onChanged(() => this.#host.cameraChanged())
  }

  /** Fresh render_order-sorted snapshot after every scene sync. */
  setItems(items: readonly SceneItem[]): void {
    this.#items = items
    // Drop selected ids that no longer exist (e.g. trashed elsewhere).
    const live = new Set(items.map((i) => i.id))
    const kept = this.selection.ids().filter((id) => live.has(id))
    if (kept.length !== this.selection.size) this.selection.set(kept)
    // The lens survives reapplication by intersecting with survivors
    // (§4.8: pan/zoom/edit keep it); an empty intersection clears it.
    this.lens.intersect(live)
  }

  items(): readonly SceneItem[] {
    return this.#items
  }

  get canvasId(): string {
    return this.#canvasId
  }

  /** Canvas swap (§12.2 single live canvas): resets interaction state;
   * the host re-feeds items from the new scene. */
  setCanvas(canvasId: string): void {
    this.#canvasId = canvasId
    this.#state = { kind: 'idle' }
    this.#items = []
    this.selection.clear()
    this.lens.clear()
  }

  setSnapProvider(provider: SnapProvider): void {
    this.#snap = provider
  }

  /** AI-IMP-019 registers the default drag-selection driver. */
  registerMoveDriver(driver: GestureDriver): void {
    this.#moveDriver = driver
  }

  /** §4.9 frame carry (AI-IMP-127): the host injects an expander that
   * adds a frame's transitive members to a plain-drag set, so moving a
   * frame moves its contents as ONE gesture / one TransformContent. */
  registerMoveExpansion(expand: (items: readonly SceneItem[]) => readonly SceneItem[]): void {
    this.#moveExpansion = expand
  }

  /** Register the single-click selection dialect. Kept separate from
   * generic hit testing so double-click activation remains unchanged. */
  registerSelectionTarget(
    target: (point: Point, items: readonly SceneItem[]) => SceneItem | null,
  ): void {
    this.#selectionTarget = target
  }

  selectionTargetAt(point: Point): SceneItem | null {
    return this.#selectionTarget(point, this.#items)
  }

  get state(): State['kind'] {
    return this.#state.kind
  }

  /** True while the in-flight gesture is a plain move (§4.9 membership
   * and the hover dim key off this — resize/rotate are excluded). */
  get gestureIsMove(): boolean {
    return this.#gestureIsMove
  }

  selectedItems(): SceneItem[] {
    return this.#items.filter((item) => this.selection.has(item.id))
  }

  pointerDown(screen: Point, modifiers: PointerModifiers = {}): void {
    if (this.#state.kind !== 'idle') return
    if (modifiers.space || modifiers.button === 1) {
      this.#state = { kind: 'panning', last: screen }
      return
    }
    if (modifiers.button !== undefined && modifiers.button !== 0) return
    const world = this.camera.screenToWorld(screen)
    const hit = this.selectionTargetAt(world)
    if (hit) {
      if (!this.selection.has(hit.id)) {
        this.selection.click(hit.id, { shift: modifiers.shift ?? false })
      }
      else if (modifiers.shift) this.selection.click(hit.id, { shift: true })
      this.#state = { kind: 'gesture-pending', startScreen: screen, itemId: hit.id }
    } else {
      this.#state = {
        kind: 'maybe-marquee',
        startScreen: screen,
        shift: modifiers.shift ?? false,
      }
    }
  }

  pointerMove(screen: Point, modifiers: PointerModifiers = {}): void {
    const state = this.#state
    switch (state.kind) {
      case 'panning': {
        this.camera.panByScreen(screen.x - state.last.x, screen.y - state.last.y)
        state.last = screen
        return
      }
      case 'maybe-marquee': {
        if (distance(screen, state.startScreen) < DRAG_THRESHOLD_PX) return
        this.#state = { kind: 'marquee', startScreen: state.startScreen, shift: state.shift }
        this.pointerMove(screen, modifiers)
        return
      }
      case 'marquee': {
        this.#host.renderMarquee(screenRect(state.startScreen, screen))
        return
      }
      case 'gesture-pending': {
        if (distance(screen, state.startScreen) < DRAG_THRESHOLD_PX) return
        if (!this.#moveDriver || this.selection.size === 0) return
        // §4.9: a dragged frame carries its members — expand the moved
        // set before the session forms so they travel as one gesture.
        const moved = this.#moveExpansion(this.selectedItems())
        const session = new GestureSession(this.#canvasId, moved)
        const sessionIds = new Set(session.ids())
        this.#snap.begin(this.#items.filter((item) => !sessionIds.has(item.id)))
        this.#gestureIsMove = true
        this.#state = {
          kind: 'gesture',
          startScreen: state.startScreen,
          session,
          driver: this.#moveDriver,
        }
        this.pointerMove(screen, modifiers)
        return
      }
      case 'gesture': {
        const guides = state.driver.update({
          session: state.session,
          startWorld: this.camera.screenToWorld(state.startScreen),
          currentWorld: this.camera.screenToWorld(screen),
          modifiers,
          snap: this.#snap,
          camera: this.camera,
        })
        for (const id of state.session.ids()) {
          const update = state.session.get(id)
          if (update) this.#host.applyEphemeral(id, update)
        }
        this.#host.renderGuides(guides)
        return
      }
      case 'idle':
        return
    }
  }

  pointerUp(screen: Point, modifiers: PointerModifiers = {}): void {
    const state = this.#state
    this.#state = { kind: 'idle' }
    switch (state.kind) {
      case 'maybe-marquee': {
        // A stationary click on empty canvas clears (unless shift).
        if (!state.shift) this.selection.clear()
        return
      }
      case 'marquee': {
        this.#host.renderMarquee(null)
        const rect = worldRect(this.camera, state.startScreen, screen)
        const hits = marqueeHits(rect, this.#items).map((item) => item.id)
        this.selection.marquee(hits, { shift: state.shift })
        return
      }
      case 'gesture': {
        this.#finishGesture(state.session, { commit: true })
        return
      }
      case 'panning':
      case 'gesture-pending':
      case 'idle':
        return
    }
    void modifiers
  }

  /** Handle-driven gestures (resize/rotate, AI-IMP-019) enter here. */
  beginGesture(items: readonly SceneItem[], driver: GestureDriver, startScreen: Point): void {
    if (this.#state.kind !== 'idle') return
    const session = new GestureSession(this.#canvasId, items)
    this.#snap.begin(this.#items.filter((item) => !session.ids().includes(item.id)))
    // Handle-driven gestures (resize/rotate) never resolve membership.
    this.#gestureIsMove = false
    this.#state = { kind: 'gesture', startScreen, session, driver }
  }

  wheel(screen: Point, deltaY: number): void {
    this.camera.zoomAt(screen, Math.exp(-deltaY * 0.0015))
  }

  /** Escape peels one layer per press: an in-flight gesture/marquee
   * cancels first; then the lens drops (WITHOUT touching selection —
   * §4.8: the lens is a view state, exiting it must not disturb what
   * the user has selected); only then does selection clear. */
  escape(): void {
    const state = this.#state
    this.#state = { kind: 'idle' }
    if (state.kind !== 'idle') {
      if (state.kind === 'gesture') this.#finishGesture(state.session, { commit: false })
      if (state.kind === 'marquee') this.#host.renderMarquee(null)
      return
    }
    if (this.lens.active) {
      this.lens.clear()
      return
    }
    this.selection.clear()
  }

  #finishGesture(session: GestureSession, opts: { commit: boolean }): void {
    this.#snap.end()
    this.#host.renderGuides([])
    const isMove = this.#gestureIsMove
    this.#gestureIsMove = false
    if (opts.commit) {
      const payload = session.commitPayload()
      if (payload) {
        this.#host.commitTransform(payload, { isMove })
        return
      }
    }
    // Cancelled — or committed-with-no-change: restore snapshots.
    for (const item of session.priorItems()) this.#host.restoreItem(item)
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function screenRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

function worldRect(camera: Camera, screenA: Point, screenB: Point): Rect {
  const a = camera.screenToWorld(screenA)
  const b = camera.screenToWorld(screenB)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
