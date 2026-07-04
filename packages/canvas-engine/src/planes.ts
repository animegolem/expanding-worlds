import { Container } from 'pixi.js'

/**
 * §4.4: three conceptual render planes — a dedicated background
 * plane, one shared ordered plane for placements and decorations, and
 * temporary interaction overlays. The world container carries the
 * camera transform (018); overlays that must stay screen-space attach
 * outside it.
 */
export interface ScenePlanes {
  /** Camera-transformed root: background + content live under it. */
  world: Container
  background: Container
  content: Container
  /** Screen-space sibling of `world` for selection boxes, handles, guides. */
  overlay: Container
}

export function createScenePlanes(): ScenePlanes {
  const world = new Container()
  world.label = 'world'
  const background = new Container()
  background.label = 'plane:background'
  const content = new Container()
  content.label = 'plane:content'
  content.sortableChildren = false
  const overlay = new Container()
  overlay.label = 'plane:overlay'
  world.addChild(background, content)
  return { world, background, content, overlay }
}
