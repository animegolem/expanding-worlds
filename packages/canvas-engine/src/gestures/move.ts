import { placementTransformOf } from '../gesture'
import { unionBounds } from '../hit-test'
import { translateDecorationData } from './decoration-data'
import type { GestureDriver } from '../controller'

/**
 * Default drag-selection driver (§6.9, §10.2): every update recomputes
 * the pointer delta from gesture start, routes it through the injected
 * SnapProvider (alt disables snapping; snapping itself lands in
 * AI-IMP-022), and proposes the snapped delta to every session member
 * — placement centers move, decoration coordinates shift inside their
 * data JSON. Nothing durable happens here: the controller commits the
 * one TransformContent when the gesture ends.
 */
export const moveDriver: GestureDriver = {
  update({ session, startWorld, currentWorld, modifiers, snap, camera }) {
    const proposed = {
      dx: currentWorld.x - startWorld.x,
      dy: currentWorld.y - startWorld.y,
    }
    const bounds = unionBounds(session.priorItems()) ?? {
      x: startWorld.x,
      y: startWorld.y,
      width: 0,
      height: 0,
    }
    const { dx, dy, guides } = snap.query({
      movingBounds: {
        x: bounds.x + proposed.dx,
        y: bounds.y + proposed.dy,
        width: bounds.width,
        height: bounds.height,
      },
      proposedDelta: proposed,
      disabled: modifiers.alt ?? false,
      zoom: camera.zoom,
    })
    for (const id of session.ids()) {
      const prior = session.prior(id)
      if (prior.itemKind === 'placement') {
        const t = placementTransformOf(prior)
        session.set(id, { kind: 'placement', transform: { ...t, x: t.x + dx, y: t.y + dy } })
      } else {
        session.set(id, { kind: 'decoration', data: translateDecorationData(prior.data, dx, dy) })
      }
    }
    return guides
  },
}
