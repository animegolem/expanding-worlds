import { placementTransformOf } from '../gesture'
import { unionBounds } from '../hit-test'
import { rotateDecorationData } from './decoration-data'
import type { GestureDriver } from '../controller'

/**
 * Handle-based rotation (§6.9, §10.2): the pointer's angular travel
 * about the selection-bounds center is applied to every member —
 * placements get rotation += delta and their centers orbit the pivot;
 * decoration coordinate pairs rotate in their data JSON. Shift snaps
 * the delta to 15° increments — an ephemeral aid, the gesture still
 * commits one durable command. Rotation does not consult snapping.
 */

export const ROTATE_SNAP_STEP = (15 * Math.PI) / 180

export const rotateDriver: GestureDriver = {
  update({ session, startWorld, currentWorld, modifiers }) {
    const items = session.priorItems()
    const bounds = unionBounds(items)
    if (!bounds) return []
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const startAngle = Math.atan2(startWorld.y - center.y, startWorld.x - center.x)
    const currentAngle = Math.atan2(currentWorld.y - center.y, currentWorld.x - center.x)
    let delta = currentAngle - startAngle
    if (modifiers.shift) delta = Math.round(delta / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP
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
          data: rotateDecorationData(prior.data, center, delta),
        })
      }
    }
    return []
  },
}
