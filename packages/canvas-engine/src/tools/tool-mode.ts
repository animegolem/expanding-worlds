import { DEFAULT_STROKE } from '../decoration-data'
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
  | 'shape-arrow'
  | 'path'
  | 'line'
  | 'arrow'
  | 'connector'
  | 'pin'

export interface ToolStyle {
  stroke: string
  /** Stroke WEIGHT as a multiplier on the legible-at-creation
   * baseline (§6.8 rev 0.14): ×1 draws a stroke that reads ~2 screen
   * px (pen arrows ~4) at the creating zoom, then stays a fixed
   * world size. Not an absolute width — the same setting means the
   * same visual weight at any zoom. */
  strokeScale: number
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
    strokeScale: 1,
    fill: null,
    textColor: DEFAULT_STROKE,
  }
  /** The desktop text-entry overlay hooks in here (§12.2 DOM overlay). */
  onPlaceText: ((world: Point) => void) | null = null
  /** The §6.2 pin tool hooks in here (AI-IMP-067): click places a
   * dot node with its phantom note focused; the desktop side owns
   * the provisional dot and the CreatePin transaction. */
  onPlacePin: ((world: Point) => void) | null = null

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
    if (this.#active === 'pin') {
      this.onPlacePin?.(world)
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
        { shift: modifiers.shift ?? false },
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
      const input = this.#session.finish(this.#target.camera.screenToWorld(screen), {
        shift: modifiers.shift ?? false,
      })
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
