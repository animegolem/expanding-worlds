import { placementTransformOf } from '../gesture'
import { placementSize, unionBounds } from '../hit-test'
import { scaleDecorationData, scaleTextData } from './decoration-data'
import type { GestureDriver } from '../controller'
import type { Point, Rect } from '../camera'
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
 * always expressed in dimensions).
 *
 * Snapping (§6.9, AI-IMP-082): the union-AABB path consults the snap
 * seam with an edge mask — only the edge(s) the handle drives are
 * candidates — then folds the returned adjustment back into the
 * pointer and recomputes the factors once, so the snapped geometry
 * flows through the ordinary per-member application. Shift promises
 * exact geometry (AI-IMP-041) and Alt is the §6.9 bypass, so either
 * disables snapping, exactly like move (AI-IMP-043). The rotated
 * single-item local-frame path never queries: its edges are not
 * world-axis-aligned, so edge guides would be ill-defined.
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
    update({ session, startWorld, currentWorld, modifiers, snap, camera }) {
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
        // Aspect lock: images by default (Alt frees); Shift forces it
        // for anything and wins over Alt (AI-IMP-041).
        if (
          affectsX &&
          affectsY &&
          ((hasImageAppearance(items) && !(modifiers.alt ?? false)) || (modifiers.shift ?? false))
        ) {
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
      const corner = affectsX && affectsY
      // Aspect lock: images by default (Alt frees); Shift forces it
      // for anything and wins over Alt (AI-IMP-041). Follows
      // whichever axis moved further from rest.
      const locked =
        corner &&
        ((hasImageAppearance(items) && !(modifiers.alt ?? false)) || (modifiers.shift ?? false))
      const rawFactors = (current: Point) => ({
        sx: affectsX ? safeFactor(current.x - anchor.x, startWorld.x - anchor.x) : 1,
        sy: affectsY ? safeFactor(current.y - anchor.y, startWorld.y - anchor.y) : 1,
      })
      let { sx, sy } = rawFactors(currentWorld)
      // When locked, the leading axis is decided ONCE from the raw
      // pointer, so a snap adjustment can never flip dominance and
      // pull the snapped edge back off its guide.
      const lockAxis: 'x' | 'y' | null = locked
        ? Math.abs(sx - 1) >= Math.abs(sy - 1)
          ? 'x'
          : 'y'
        : null
      const applyLock = (f: { sx: number; sy: number }): { sx: number; sy: number } => {
        if (!lockAxis) return f
        const s = lockAxis === 'x' ? f.sx : f.sy
        return { sx: s, sy: s }
      }
      ;({ sx, sy } = applyLock({ sx, sy }))
      // Snap consultation (§6.9, AI-IMP-082): the proposed post-scale
      // union bounds go to the provider with the handle's dragged
      // edge(s) as the only candidates. Under an aspect lock the
      // dominant axis alone snaps — the locked aspect follows, and
      // the one guide drawn is honest. Shift promises exact geometry
      // (AI-IMP-041); Alt is §6.9's bypass — both disable, exactly
      // like move (AI-IMP-043).
      const { dx, dy, guides } = snap.query({
        movingBounds: {
          x: anchor.x + (bounds.x - anchor.x) * sx,
          y: anchor.y + (bounds.y - anchor.y) * sy,
          width: bounds.width * sx,
          height: bounds.height * sy,
        },
        proposedDelta: { dx: 0, dy: 0 },
        edges: {
          x:
            affectsX && (lockAxis === null || lockAxis === 'x')
              ? handle.includes('e')
                ? 'max'
                : 'min'
              : undefined,
          y:
            affectsY && (lockAxis === null || lockAxis === 'y')
              ? handle.includes('s')
                ? 'max'
                : 'min'
              : undefined,
        },
        disabled: (modifiers.alt ?? false) || (modifiers.shift ?? false),
        zoom: camera.zoom,
      })
      if (dx !== 0 || dy !== 0) {
        // The pointer and the dragged edge scale about the same
        // anchor, so an edge adjustment maps into pointer travel by
        // the ratio of their start offsets; recompute the factors
        // ONCE from the nudged pointer.
        const edgeX = handle.includes('e') ? bounds.x + bounds.width : bounds.x
        const edgeY = handle.includes('s') ? bounds.y + bounds.height : bounds.y
        const px =
          Math.abs(edgeX - anchor.x) < 1e-6 ? 0 : dx * ((startWorld.x - anchor.x) / (edgeX - anchor.x))
        const py =
          Math.abs(edgeY - anchor.y) < 1e-6 ? 0 : dy * ((startWorld.y - anchor.y) / (edgeY - anchor.y))
        ;({ sx, sy } = applyLock(rawFactors({ x: currentWorld.x + px, y: currentWorld.y + py })))
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
          // Annotation arrows keep constant pen weight under resize,
          // exactly like lines (§6.8 rev 0.13) — the box-scaling
          // arrow is the 'arrow' ShapeKind.
          session.set(id, {
            kind: 'decoration',
            data: scaleDecorationData(prior.data, anchor, sx, sy),
          })
        }
      }
      return guides
    },
  }
}
