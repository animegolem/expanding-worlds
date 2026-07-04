import { Container, Graphics } from 'pixi.js'
import { isConnectorData } from '../../decoration-data'
import { drawSegment } from './line'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer, RendererResources } from '../registry'

/**
 * Connector (§4.9): a visual line whose endpoints may be anchored to
 * placements — never a semantic edge. While anchored, the endpoint
 * follows the placement's LIVE display object (resolved through
 * resources.resolveObject each rendered frame via Pixi's
 * container.onRender), so it tracks both committed moves and
 * ephemeral drags. Unanchored endpoints come from data: a freed
 * anchor's `data.start`/`data.end` fallback (written by the domain
 * when the placement was deleted) takes precedence over x1/y1/x2/y2.
 */

export interface ConnectorEndpoints {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ConnectorObject extends Container {
  __item?: SceneDecoration
  __resources?: RendererResources
  /** Last drawn endpoints — exposed for tests and debug hooks. */
  __endpoints?: ConnectorEndpoints | undefined
}

/** Resolves current world endpoints: live anchor > freed fallback > x1..y2. */
export function connectorEndpoints(
  item: SceneDecoration,
  resources: RendererResources,
): ConnectorEndpoints | null {
  if (!isConnectorData(item.data)) return null
  const data = item.data
  const anchored = (placementId: string | null): { x: number; y: number } | null => {
    if (!placementId || !resources.resolveObject) return null
    const object = resources.resolveObject(placementId)
    return object ? { x: object.position.x, y: object.position.y } : null
  }
  const start =
    anchored(item.anchorStartPlacementId) ?? data.start ?? { x: data.x1, y: data.y1 }
  const end = anchored(item.anchorEndPlacementId) ?? data.end ?? { x: data.x2, y: data.y2 }
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function redraw(container: ConnectorObject): void {
  const item = container.__item
  const resources = container.__resources
  if (!item || !resources) return
  const gfx = container.getChildByLabel('connector') as Graphics | null
  if (!gfx) return
  const endpoints = connectorEndpoints(item, resources)
  if (!endpoints) {
    gfx.clear()
    container.__endpoints = undefined
    return
  }
  const prev = container.__endpoints
  if (
    prev &&
    prev.x1 === endpoints.x1 &&
    prev.y1 === endpoints.y1 &&
    prev.x2 === endpoints.x2 &&
    prev.y2 === endpoints.y2
  ) {
    return
  }
  const data = item.data as { stroke: string; strokeWidth: number }
  gfx.clear()
  drawSegment(gfx, { ...endpoints, stroke: data.stroke, strokeWidth: data.strokeWidth }, false)
  container.__endpoints = endpoints
}

export const connectorRenderer: ItemRenderer<SceneDecoration> = {
  create(item, resources) {
    const container: ConnectorObject = new Container()
    container.label = `decoration:${item.id}`
    const gfx = new Graphics()
    gfx.label = 'connector'
    container.addChild(gfx)
    container.__item = item
    container.__resources = resources
    redraw(container)
    // Follow anchors every rendered frame; redraw() no-ops when the
    // resolved endpoints have not moved.
    container.onRender = () => redraw(container)
    return container
  },
  update(object, item, _previous, resources) {
    const container = object as ConnectorObject
    container.__item = item
    container.__resources = resources
    container.__endpoints = undefined
    redraw(container)
  },
}
