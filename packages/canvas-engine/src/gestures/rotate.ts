import { placementTransformOf } from '../gesture'
import { unionBounds } from '../hit-test'
import { rotateDecorationData, rotateShapeData } from './decoration-data'
import type { GestureDriver } from '../controller'
import type { SceneItem } from '../types'

/**
 * Handle-based rotation (§6.9, §10.2): the pointer's angular travel
 * about the selection-bounds center is applied to every member —
 * placements get rotation += delta and their centers orbit the pivot;
 * decoration coordinate pairs rotate in their data JSON. Shift snaps
 * the delta to 15° increments — an ephemeral aid, the gesture still
 * commits one durable command. Rotation does not consult snapping.
 */

export const ROTATE_SNAP_STEP = (15 * Math.PI) / 180
/** Cardinal magnetism window (§6.9 rev 0.12). */
export const CARDINAL_SNAP_RAD = (5 * Math.PI) / 180

/** The item's own orientation, when the kind has one. */
function orientationOf(item: SceneItem): number | null {
  if (item.itemKind === 'placement') return item.rotation
  if (item.kind === 'shape') {
    const r = (item.data as { rotation?: unknown }).rotation
    return typeof r === 'number' && Number.isFinite(r) ? r : 0
  }
  return null
}

export const rotateDriver: GestureDriver = {
  update({ session, startWorld, currentWorld, modifiers }) {
    const items = session.priorItems()
    const bounds = unionBounds(items)
    if (!bounds) return []
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const startAngle = Math.atan2(startWorld.y - center.y, startWorld.x - center.x)
    const currentAngle = Math.atan2(currentWorld.y - center.y, currentWorld.x - center.x)
    let delta = currentAngle - startAngle
    // §6.9 rev 0.12: rotation snaps by ORIENTATION, not delta. A
    // single item with a known angle resolves its target orientation
    // — Shift quantizes it to the 15°-divided circle absolutely,
    // otherwise cardinals magnetize within ±5° — and the applied
    // delta is derived back, so the item lands on clean angles no
    // matter where it started. Alt bypasses all snapping.
    const single = items.length === 1 ? orientationOf(items[0]!) : null
    if (modifiers.alt) {
      // raw
    } else if (single !== null) {
      let target = single + delta
      if (modifiers.shift) {
        target = Math.round(target / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP
      } else {
        const HALF_PI = Math.PI / 2
        const nearest = Math.round(target / HALF_PI) * HALF_PI
        if (Math.abs(target - nearest) < CARDINAL_SNAP_RAD) target = nearest
      }
      delta = target - single
    } else if (modifiers.shift) {
      delta = Math.round(delta / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP
    }
    const cos = Math.cos(delta)
    const sin = Math.sin(delta)
    for (const id of session.ids()) {
      const prior = session.prior(id)
      if (prior.itemKind === 'placement') {
        const t = placementTransformOf(prior)
        const dx = t.x - center.x
        const dy = t.y - center.y
        session.set(id, {
          kind: 'placement',
          transform: {
            ...t,
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos,
            rotation: t.rotation + delta,
          },
        })
      } else {
        session.set(id, {
          kind: 'decoration',
          data:
            prior.itemKind === 'decoration' && prior.kind === 'shape'
              ? rotateShapeData(prior.data, center, delta)
              : rotateDecorationData(prior.data, center, delta),
        })
      }
    }
    return []
  },
}
