import type { TransformContentItem, TransformContentPayload } from '@ew/commands'
import type { SceneItem } from './types'

/**
 * Ephemeral gesture state (§10.2/invariant 25): a session snapshots
 * the prior state of every member at begin, accumulates proposed
 * values during updates (display objects only — nothing durable), and
 * on commit yields exactly one TransformContent payload. Cancel
 * restores the snapshot and commits nothing.
 */

export interface PlacementTransform {
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
}

export type GestureUpdate =
  | { kind: 'placement'; transform: PlacementTransform }
  | { kind: 'decoration'; data: Record<string, unknown> }

export function placementTransformOf(item: SceneItem): PlacementTransform {
  if (item.itemKind !== 'placement') throw new Error(`item ${item.id} is not a placement`)
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    scale: item.scale,
    rotation: item.rotation,
  }
}

export class GestureSession {
  readonly canvasId: string
  #prior = new Map<string, SceneItem>()
  #current = new Map<string, GestureUpdate>()

  constructor(canvasId: string, items: readonly SceneItem[]) {
    if (items.length === 0) throw new Error('gesture needs at least one item')
    this.canvasId = canvasId
    for (const item of items) this.#prior.set(item.id, item)
  }

  ids(): string[] {
    return [...this.#prior.keys()]
  }

  prior(id: string): SceneItem {
    const item = this.#prior.get(id)
    if (!item) throw new Error(`item ${id} is not part of this gesture`)
    return item
  }

  priorItems(): SceneItem[] {
    return [...this.#prior.values()]
  }

  set(id: string, update: GestureUpdate): void {
    const prior = this.prior(id)
    if (prior.itemKind !== update.kind) {
      throw new Error(`update kind ${update.kind} does not match item ${id}`)
    }
    this.#current.set(id, update)
  }

  get(id: string): GestureUpdate | undefined {
    return this.#current.get(id)
  }

  /** Members whose proposed state differs from their snapshot. */
  changed(): TransformContentItem[] {
    const result: TransformContentItem[] = []
    for (const [id, update] of this.#current) {
      const prior = this.prior(id)
      if (update.kind === 'placement' && prior.itemKind === 'placement') {
        const t = update.transform
        const same =
          t.x === prior.x &&
          t.y === prior.y &&
          t.width === prior.width &&
          t.height === prior.height &&
          t.scale === prior.scale &&
          t.rotation === prior.rotation
        if (!same) result.push({ kind: 'placement', placementId: id, ...t })
      } else if (update.kind === 'decoration' && prior.itemKind === 'decoration') {
        if (JSON.stringify(update.data) !== JSON.stringify(prior.data)) {
          result.push({ kind: 'decoration', decorationId: id, data: update.data })
        }
      }
    }
    return result
  }

  hasChanges(): boolean {
    return this.changed().length > 0
  }

  commitPayload(): TransformContentPayload | null {
    const items = this.changed()
    return items.length === 0 ? null : { canvasId: this.canvasId, items }
  }
}
