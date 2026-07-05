import { placementTransformOf } from '../gesture'
import { placementSize, unionBounds } from '../hit-test'
import { scaleDecorationData, scaleTextData } from './decoration-data'
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

/** Body rotation and center for the single-item local-frame path. */
function orientationOf(item: SceneItem): { angle: number; cx: number; cy: number } | null {
  if (item.itemKind === 'placement') {
    return item.rotation !== 0 ? { angle: item.rotation, cx: item.x, cy: item.y } : null
  }
  if (item.kind === 'shape') {
    const d = item.data as Record<string, unknown>
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
    if (!num(d['rotation']) || d['rotation'] === 0) return null
    if (!num(d['x']) || !num(d['y']) || !num(d['width']) || !num(d['height'])) return null
    return { angle: d['rotation'], cx: d['x'] + d['width'] / 2, cy: d['y'] + d['height'] / 2 }
  }
  return null
}

export function createResizeDriver(handle: ResizeHandle): GestureDriver {
  const affectsX = handle.includes('e') || handle.includes('w')
  const affectsY = handle.includes('n') || handle.includes('s')
  return {
    update({ session, startWorld, currentWorld, modifiers }) {
      const items = session.priorItems()
      // A single rotated body resizes in its LOCAL frame (AI-IMP-031):
      // rotate the pointer into the body's axes, run the exact same
      // anchored scaling there, and rotate the moved center back out.
      // The opposite-corner-pinned contract holds in the local frame,
      // which is the only frame where it means anything visually.
      const oriented = items.length === 1 ? orientationOf(items[0]!) : null
      if (oriented) {
        const item = items[0]!
        const { angle, cx, cy } = oriented
        const cos = Math.cos(-angle)
        const sin = Math.sin(-angle)
        const toLocal = (p: { x: number; y: number }) => ({
          x: (p.x - cx) * cos - (p.y - cy) * sin,
          y: (p.x - cx) * sin + (p.y - cy) * cos,
        })
        const size =
          item.itemKind === 'placement'
            ? placementSize(item)
            : {
                width: (item.data as { width: number }).width,
                height: (item.data as { height: number }).height,
              }
        const localBounds: Rect = {
          x: -size.width / 2,
          y: -size.height / 2,
          width: size.width,
          height: size.height,
        }
        const anchor = anchorOf(handle, localBounds)
        const startL = toLocal(startWorld)
        const currentL = toLocal(currentWorld)
        let sx = affectsX ? safeFactor(currentL.x - anchor.x, startL.x - anchor.x) : 1
        let sy = affectsY ? safeFactor(currentL.y - anchor.y, startL.y - anchor.y) : 1
        if (affectsX && affectsY && !(modifiers.alt ?? false) && hasImageAppearance(items)) {
          const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
          sx = s
          sy = s
        }
        // The body center is the local origin; anchored scaling moves
        // it to anchor·(1−s), which rotates back into world space.
        const newCenterL = { x: anchor.x * (1 - sx), y: anchor.y * (1 - sy) }
        const wcos = Math.cos(angle)
        const wsin = Math.sin(angle)
        const newCx = cx + newCenterL.x * wcos - newCenterL.y * wsin
        const newCy = cy + newCenterL.x * wsin + newCenterL.y * wcos
        const newW = size.width * sx
        const newH = size.height * sy
        if (item.itemKind === 'placement') {
          const t = placementTransformOf(item)
          const scale = item.scale || 1
          session.set(item.id, {
            kind: 'placement',
            transform: {
              ...t,
              x: newCx,
              y: newCy,
              width: newW / scale,
              height: newH / scale,
            },
          })
        } else {
          session.set(item.id, {
            kind: 'decoration',
            data: {
              ...item.data,
              x: newCx - newW / 2,
              y: newCy - newH / 2,
              width: newW,
              height: newH,
            },
          })
        }
        return []
      }
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
        } else if (prior.itemKind === 'decoration' && prior.kind === 'text') {
          // Art-text scaling (§4.9 rev 0.12): text scales UNIFORMLY
          // by the gesture's dominant factor — its aspect is owned
          // by the font, not the handles.
          const s = corner
            ? Math.abs(sx - 1) >= Math.abs(sy - 1)
              ? sx
              : sy
            : affectsX
              ? sx
              : sy
          session.set(id, {
            kind: 'decoration',
            data: scaleTextData(prior.data, anchor, s),
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
