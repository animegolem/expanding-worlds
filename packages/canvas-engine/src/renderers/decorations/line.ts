import { Container, Graphics } from 'pixi.js'
import { isLineData, type LineData } from '../../decoration-data'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer } from '../registry'

/**
 * Straight line and arrow decorations (kinds 'line' and 'arrow'):
 * one segment in absolute world coordinates; arrows add a filled
 * head at (x2, y2). Invalid data renders nothing.
 */

export function drawSegment(gfx: Graphics, data: LineData, arrowhead: boolean): void {
  gfx.moveTo(data.x1, data.y1).lineTo(data.x2, data.y2).stroke({
    width: data.strokeWidth,
    color: data.stroke,
    cap: 'round',
  })
  if (!arrowhead) return
  const angle = Math.atan2(data.y2 - data.y1, data.x2 - data.x1)
  const size = Math.max(8, data.strokeWidth * 4)
  const spread = Math.PI / 7
  gfx
    .poly([
      data.x2,
      data.y2,
      data.x2 - size * Math.cos(angle - spread),
      data.y2 - size * Math.sin(angle - spread),
      data.x2 - size * Math.cos(angle + spread),
      data.y2 - size * Math.sin(angle + spread),
    ])
    .fill({ color: data.stroke })
}

function makeRenderer(arrowhead: boolean): ItemRenderer<SceneDecoration> {
  const apply = (gfx: Graphics, item: SceneDecoration): void => {
    gfx.clear()
    if (!isLineData(item.data)) return
    drawSegment(gfx, item.data, arrowhead)
  }
  return {
    create(item) {
      const container = new Container()
      container.label = `decoration:${item.id}`
      const gfx = new Graphics()
      gfx.label = 'line'
      container.addChild(gfx)
      apply(gfx, item)
      return container
    },
    update(object, item) {
      const gfx = object.getChildByLabel('line') as Graphics | null
      if (gfx) apply(gfx, item)
    },
  }
}

export const lineRenderer: ItemRenderer<SceneDecoration> = makeRenderer(false)
export const arrowRenderer: ItemRenderer<SceneDecoration> = makeRenderer(true)
