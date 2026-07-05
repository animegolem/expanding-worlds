import { Container, Graphics } from 'pixi.js'
import { isShapeData, type ShapeData } from '../../decoration-data'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer } from '../registry'

/**
 * Shape decoration (kind 'shape', discriminated by data.shape):
 * rect | ellipse | triangle. Geometry is drawn centered on the local
 * origin so data.rotation applies about the box center; (data.x,
 * data.y) remains the top-left of the unrotated bounding box, which
 * is what hit-testing reads. Invalid data renders nothing.
 */

function draw(gfx: Graphics, data: ShapeData): void {
  gfx.clear()
  const w = data.width
  const h = data.height
  if (data.shape === 'rect') gfx.rect(-w / 2, -h / 2, w, h)
  else if (data.shape === 'ellipse') gfx.ellipse(0, 0, w / 2, h / 2)
  else gfx.poly([0, -h / 2, w / 2, h / 2, -w / 2, h / 2])
  if (data.fill !== undefined) gfx.fill({ color: data.fill })
  // Triangles join with 'round': their apex angle is arbitrary, and
  // the default miter join (limit 10) spikes up to 5x strokeWidth
  // past a sharp vertex at thick strokes (AI-IMP-027). Rect corners
  // are always 90deg (miter factor sqrt(2)) and stay crisp miters.
  gfx.stroke({
    width: data.strokeWidth,
    color: data.stroke,
    join: data.shape === 'triangle' ? 'round' : 'miter',
  })
}

function apply(gfx: Graphics, container: Container, item: SceneDecoration): void {
  if (!isShapeData(item.data)) {
    gfx.clear()
    return
  }
  const data = item.data
  container.position.set(data.x + data.width / 2, data.y + data.height / 2)
  container.rotation = data.rotation ?? 0
  draw(gfx, data)
}

export const shapeRenderer: ItemRenderer<SceneDecoration> = {
  create(item) {
    const container = new Container()
    container.label = `decoration:${item.id}`
    const gfx = new Graphics()
    gfx.label = 'shape'
    container.addChild(gfx)
    apply(gfx, container, item)
    return container
  },
  update(object, item) {
    const gfx = object.getChildByLabel('shape') as Graphics | null
    if (gfx) apply(gfx, object, item)
  },
}
