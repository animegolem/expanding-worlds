import { DEFAULT_STROKE, DEFAULT_STROKE_WIDTH } from '../decoration-data'
import { beginDrawSession, type DrawSession, type ToolCreateInput, type ToolPreview } from './draw-tools'
import type { Camera, Point } from '../camera'
import type { PointerModifiers } from '../controller'
import type { SceneItem } from '../types'

/**
 * Tool modes (AI-IMP-021): the ToolManager sits IN FRONT of the
 * Canvas Controller. With the select tool active every pointer event
 * passes through unchanged; with a draw tool active the drag defines
 * decoration geometry, Escape cancels with zero commands, and each
 * completed gesture issues exactly one CreateDecoration through the
 * host callback (§10.2). Space/middle-button panning stays available
 * in every tool by delegating those events to the controller.
 */

export type ToolKind =
  | 'select'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'path'
  | 'line'
  | 'arrow'
  | 'connector'

export interface ToolStyle {
  stroke: string
  strokeWidth: number
  /** null = no fill (stroke-only shapes). */
  fill: string | null
  /** Canvas text color. */
  textColor: string
}

/** The controller surface the ToolManager needs; CanvasController satisfies it. */
export interface ToolTarget {
  camera: Camera
  items(): readonly SceneItem[]
  pointerDown(screen: Point, modifiers?: PointerModifiers): void
  pointerMove(screen: Point, modifiers?: PointerModifiers): void
  pointerUp(screen: Point, modifiers?: PointerModifiers): void
  escape(): void
}

export interface ToolManagerHost {
  /** Exactly one call per completed draw gesture. */
  create(input: ToolCreateInput): void
  renderPreview(preview: ToolPreview | null): void
  highlightPlacement(placementId: string | null): void
}

export class ToolManager {
  #target: ToolTarget
  #host: ToolManagerHost
  #active: ToolKind = 'select'
  #session: DrawSession | null = null
  /** Events delegated to the controller mid-gesture keep flowing there. */
  #passthrough = false
  #changed = new Set<(tool: ToolKind) => void>()
  style: ToolStyle = {
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    fill: null,
    textColor: DEFAULT_STROKE,
  }
  /** The desktop text-entry overlay hooks in here (§12.2 DOM overlay). */
  onPlaceText: ((world: Point) => void) | null = null

  constructor(target: ToolTarget, host: ToolManagerHost) {
    this.#target = target
    this.#host = host
  }

  get active(): ToolKind {
    return this.#active
  }

  setTool(tool: ToolKind): void {
    if (tool === this.#active) return
    this.#cancelSession()
    this.#active = tool
    for (const listener of this.#changed) listener(tool)
  }

  onChanged(listener: (tool: ToolKind) => void): () => void {
    this.#changed.add(listener)
    return () => this.#changed.delete(listener)
  }

  pointerDown(screen: Point, modifiers: PointerModifiers = {}): void {
    if (this.#session) return
    const pan = modifiers.space || modifiers.button === 1
    if (this.#active === 'select' || pan) {
      this.#passthrough = true
      this.#target.pointerDown(screen, modifiers)
      return
    }
    if (modifiers.button !== undefined && modifiers.button !== 0) return
    const world = this.#target.camera.screenToWorld(screen)
    if (this.#active === 'text') {
      this.onPlaceText?.(world)
      return
    }
    this.#session = beginDrawSession(this.#active, world, { ...this.style }, {
      zoom: this.#target.camera.zoom,
      items: () => this.#target.items(),
    })
  }

  pointerMove(screen: Point, modifiers: PointerModifiers = {}): void {
    if (this.#session) {
      const { preview, hoverPlacementId } = this.#session.update(
        this.#target.camera.screenToWorld(screen),
      )
      this.#host.renderPreview(preview)
      this.#host.highlightPlacement(hoverPlacementId)
      return
    }
    if (this.#passthrough || this.#active === 'select') {
      this.#target.pointerMove(screen, modifiers)
    }
  }

  pointerUp(screen: Point, modifiers: PointerModifiers = {}): void {
    if (this.#session) {
      const input = this.#session.finish(this.#target.camera.screenToWorld(screen))
      this.#session = null
      this.#host.renderPreview(null)
      this.#host.highlightPlacement(null)
      if (input) this.#host.create(input)
      return
    }
    const passthrough = this.#passthrough || this.#active === 'select'
    this.#passthrough = false
    if (passthrough) this.#target.pointerUp(screen, modifiers)
  }

  /** Cancels an in-flight draw with zero commands, else forwards. */
  escape(): void {
    if (this.#session) {
      this.#cancelSession()
      return
    }
    this.#target.escape()
  }

  #cancelSession(): void {
    if (!this.#session) return
    this.#session = null
    this.#host.renderPreview(null)
    this.#host.highlightPlacement(null)
  }
}
