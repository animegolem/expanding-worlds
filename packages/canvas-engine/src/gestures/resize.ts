import { placementTransformOf } from '../gesture'
import { placementSize, unionBounds } from '../hit-test'
import { scaleDecorationData } from './decoration-data'
import type { GestureDriver } from '../controller'
import type { Rect } from '../camera'
import type { SceneItem } from '../types'

/**
 * Handle-based resize (§6.9, §10.2). Geometry is anchored scaling:
 * the handle's opposite corner/edge of the selection's union bounds
 * stays fixed and the pointer's travel relative to it yields per-axis
 * scale factors. Corner handles preserve aspect ratio by default when
 * the selection contains an image appearance (§6.1) — alt frees it;
 * edge handles stretch one axis. Every member (single or multi) scales
 * about the shared anchor: placement centers move with the scale and
 * their explicit width/height absorb the factors (placement x/y is
 * the body CENTER; `scale` is left untouched so the durable result is
 * always expressed in dimensions). Resize does not consult snapping.
 */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

/** Collapsing a selection through zero (mirror-by-resize) is not a thing. */
const MIN_SCALE_FACTOR = 0.01

function anchorOf(handle: ResizeHandle, bounds: Rect): { x: number; y: number } {
  const x = handle.includes('w')
    ? bounds.x + bounds.width
    : handle.includes('e')
      ? bounds.x
      : bounds.x + bounds.width / 2
  const y = handle.includes('n')
    ? bounds.y + bounds.height
    : handle.includes('s')
      ? bounds.y
      : bounds.y + bounds.height / 2
  return { x, y }
}

function safeFactor(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < 1e-6) return 1
  return Math.max(numerator / denominator, MIN_SCALE_FACTOR)
}

function hasImageAppearance(items: readonly SceneItem[]): boolean {
  return items.some((item) => item.itemKind === 'placement' && item.appearanceKind === 'image')
}

export function createResizeDriver(handle: ResizeHandle): GestureDriver {
  const affectsX = handle.includes('e') || handle.includes('w')
  const affectsY = handle.includes('n') || handle.includes('s')
  return {
    update({ session, startWorld, currentWorld, modifiers }) {
      const items = session.priorItems()
      const bounds = unionBounds(items)
      if (!bounds) return []
      const anchor = anchorOf(handle, bounds)
      let sx = affectsX ? safeFactor(currentWorld.x - anchor.x, startWorld.x - anchor.x) : 1
      let sy = affectsY ? safeFactor(currentWorld.y - anchor.y, startWorld.y - anchor.y) : 1
      const corner = affectsX && affectsY
      if (corner && !(modifiers.alt ?? false) && hasImageAppearance(items)) {
        // Aspect lock: follow whichever axis moved further from rest.
        const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
        sx = s
        sy = s
      }
      for (const id of session.ids()) {
        const prior = session.prior(id)
        if (prior.itemKind === 'placement') {
          const t = placementTransformOf(prior)
          const effective = placementSize(prior)
          const scale = prior.scale || 1
          session.set(id, {
            kind: 'placement',
            transform: {
              ...t,
              x: anchor.x + (t.x - anchor.x) * sx,
              y: anchor.y + (t.y - anchor.y) * sy,
              width: (effective.width / scale) * sx,
              height: (effective.height / scale) * sy,
            },
          })
        } else {
          session.set(id, {
            kind: 'decoration',
            data: scaleDecorationData(prior.data, anchor, sx, sy),
          })
        }
      }
      return []
    },
  }
}
