import { Container, Graphics } from 'pixi.js'
import { isPathData } from '../../decoration-data'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer } from '../registry'

/**
 * Freehand path (kind 'path'): a stroked polyline through
 * world-space data.points. Points are absolute world coordinates, so
 * the container stays at the origin and TransformContent rewrites
 * the points themselves. Invalid data renders nothing.
 */

function apply(gfx: Graphics, item: SceneDecoration): void {
  gfx.clear()
  if (!isPathData(item.data)) return
  const data = item.data
  const [first, ...rest] = data.points
  gfx.moveTo(first![0], first![1])
  for (const [x, y] of rest) gfx.lineTo(x, y)
  gfx.stroke({ width: data.strokeWidth, color: data.stroke, cap: 'round', join: 'round' })
}

export const pathRenderer: ItemRenderer<SceneDecoration> = {
  create(item) {
    const container = new Container()
    container.label = `decoration:${item.id}`
    const gfx = new Graphics()
    gfx.label = 'path'
    container.addChild(gfx)
    apply(gfx, item)
    return container
  },
  update(object, item) {
    const gfx = object.getChildByLabel('path') as Graphics | null
    if (gfx) apply(gfx, item)
  },
}
