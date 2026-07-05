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

/**
 * Block-arrow silhouette for the 'arrow' ShapeKind (§6.8 rev 0.13):
 * a 7-point polygon filling a centered w×h box, pointing +x —
 * proportions are properties of the BOX, so it scales like any
 * shape. Pure and exported for the tool preview.
 */
export function shapeArrowPolygon(w: number, h: number): number[] {
  const headLength = Math.min(0.5 * w, 0.9 * h)
  const shaftHalf = 0.22 * h
  const headHalf = h / 2
  const base = w / 2 - headLength
  return [
    -w / 2,
    -shaftHalf,
    base,
    -shaftHalf,
    base,
    -headHalf,
    w / 2,
    0,
    base,
    headHalf,
    base,
    shaftHalf,
    -w / 2,
    shaftHalf,
  ]
}

function draw(gfx: Graphics, data: ShapeData): void {
  gfx.clear()
  const w = data.width
  const h = data.height
  if (data.shape === 'rect') gfx.rect(-w / 2, -h / 2, w, h)
  else if (data.shape === 'ellipse') gfx.ellipse(0, 0, w / 2, h / 2)
  else if (data.shape === 'arrow') gfx.poly(shapeArrowPolygon(w, h))
  else gfx.poly([0, -h / 2, w / 2, h / 2, -w / 2, h / 2])
  if (data.fill !== undefined) gfx.fill({ color: data.fill })
  // Triangles and arrows join with 'round': their vertex angles are
  // arbitrary, and the default miter join (limit 10) spikes up to 5x
  // strokeWidth past a sharp vertex at thick strokes (AI-IMP-027).
  // Rect corners are always 90deg (miter factor sqrt(2)) and stay
  // crisp miters.
  gfx.stroke({
    width: data.strokeWidth,
    color: data.stroke,
    join: data.shape === 'rect' || data.shape === 'ellipse' ? 'miter' : 'round',
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
