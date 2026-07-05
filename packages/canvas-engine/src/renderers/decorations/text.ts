import { Container, Text } from 'pixi.js'
import { isTextData } from '../../decoration-data'
import type { SceneDecoration } from '../../types'
import type { ItemRenderer } from '../registry'

/**
 * Canvas text (§4.9): a world-space Pixi text at data.fontSize —
 * world units, fixed at creation, scaling only with canvas zoom.
 * The string lives at data.text (canvas_text_fts contract). Invalid
 * data renders nothing rather than failing the scene.
 */

function apply(text: Text, container: Container, item: SceneDecoration): void {
  if (!isTextData(item.data)) {
    text.visible = false
    return
  }
  const data = item.data
  text.visible = true
  container.position.set(data.x, data.y)
  text.text = data.text
  text.style.fontSize = data.fontSize
  text.style.fill = data.color
  // Whole-object styling (§4.9 rev 0.12).
  text.style.fontFamily = data.fontFamily ?? 'sans-serif'
  text.style.fontWeight = data.bold ? 'bold' : 'normal'
  text.style.fontStyle = data.italic ? 'italic' : 'normal'
  if (data.width !== undefined) {
    text.style.wordWrap = true
    text.style.wordWrapWidth = data.width
  } else {
    text.style.wordWrap = false
  }
}

export const textRenderer: ItemRenderer<SceneDecoration> = {
  create(item) {
    const container = new Container()
    container.label = `decoration:${item.id}`
    const text = new Text({ text: '', style: { fontFamily: 'sans-serif' } })
    text.label = 'text'
    container.addChild(text)
    apply(text, container, item)
    return container
  },
  update(object, item) {
    const text = object.getChildByLabel('text') as Text | null
    if (text) apply(text, object, item)
  },
}
