import { uuidv7 } from '@ew/domain'
import { hitTest, isTextData, legibleFontSize, type Point, type SceneDecoration } from '@ew/canvas-engine'
import type { CanvasHostHandle } from './host'

/**
 * DOM text-entry overlay (RFC §12.2, AI-IMP-021): a world-positioned
 * contenteditable div over the canvas. Clicking with the text tool
 * places a new entry; committing (blur or plain Enter) issues exactly
 * one CreateDecoration whose fontSize defaults legible at the
 * creating zoom and is a fixed world size thereafter (§4.9 rev 0.8).
 * Double-clicking an existing text decoration with the select tool
 * re-opens the overlay and commits exactly one UpdateDecoration.
 * Empty text commits nothing; Escape cancels.
 */

export interface TextEntryController {
  /** Test/debug seam: true while the overlay is open. */
  isOpen(): boolean
  destroy(): void
}

interface OpenTarget {
  /** Existing decoration being edited, or null for a new placement. */
  existing: SceneDecoration | null
  world: Point
  fontSize: number
  color: string
  fontFamily?: string | undefined
  bold?: boolean | undefined
  italic?: boolean | undefined
}

/**
 * Measures text in WORLD units via an offscreen DOM node styled
 * exactly like the entry overlay (AI-IMP-034) — the shared metric
 * source for overlay commits and toolbar style edits.
 */
export function measureTextWorld(
  text: string,
  style: {
    fontSize: number
    fontFamily?: string
    bold?: boolean
    italic?: boolean
    width?: number
  },
): { measuredWidth: number; measuredHeight: number } {
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.left = '-99999px'
  probe.style.visibility = 'hidden'
  probe.style.whiteSpace = 'pre-wrap'
  probe.style.lineHeight = '1.2'
  probe.style.fontFamily = style.fontFamily ?? 'sans-serif'
  probe.style.fontWeight = style.bold ? 'bold' : 'normal'
  probe.style.fontStyle = style.italic ? 'italic' : 'normal'
  probe.style.fontSize = `${style.fontSize}px`
  if (style.width !== undefined) probe.style.width = `${style.width}px`
  probe.innerText = text
  document.body.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return { measuredWidth: rect.width, measuredHeight: rect.height }
}

export function attachTextEntry(
  handle: CanvasHostHandle,
  element: HTMLElement,
): TextEntryController {
  let active: { div: HTMLDivElement; close: () => void } | null = null

  function open(target: OpenTarget): void {
    active?.close()
    const camera = handle.controller.camera
    const div = document.createElement('div')
    div.contentEditable = 'true'
    div.dataset['testid'] = 'text-entry'
    div.style.position = 'absolute'
    div.style.minWidth = '2ch'
    div.style.outline = '1px dashed #4a9df0'
    div.style.color = target.color
    div.style.fontFamily = target.fontFamily ?? 'sans-serif'
    div.style.fontWeight = target.bold ? 'bold' : 'normal'
    div.style.fontStyle = target.italic ? 'italic' : 'normal'
    div.style.lineHeight = '1.2'
    div.style.whiteSpace = 'pre-wrap'
    div.style.zIndex = '10'
    if (target.existing && isTextData(target.existing.data)) {
      div.innerText = target.existing.data.text
    }

    const reposition = (): void => {
      const screen = camera.worldToScreen(target.world)
      div.style.left = `${screen.x}px`
      div.style.top = `${screen.y}px`
      div.style.fontSize = `${target.fontSize * camera.zoom}px`
    }
    reposition()
    const offCamera = camera.onChanged(reposition)

    let done = false
    const finish = (commit: boolean): void => {
      if (done) return
      done = true
      const text = div.innerText.replace(/\u00A0/g, ' ').trim()
      // Measure BEFORE close() removes the div: the overlay renders
      // the exact committed text at fontSize \u00D7 zoom, so its rect \u00F7
      // zoom is the world-space extent hit-testing needs (AI-IMP-030).
      const rect = div.getBoundingClientRect()
      const zoom = camera.zoom || 1
      const measured =
        rect.width > 0 && rect.height > 0
          ? { measuredWidth: rect.width / zoom, measuredHeight: rect.height / zoom }
          : {}
      close()
      if (!commit) return
      if (target.existing) {
        const prior = target.existing.data
        const priorText = isTextData(prior) ? prior.text : ''
        if (text.length === 0 || text === priorText) return
        void handle.gateway.execute('UpdateDecoration', {
          decorationId: target.existing.id,
          set: { data: { ...prior, text, ...measured } },
        })
        return
      }
      if (text.length === 0) return
      void handle.gateway.execute('CreateDecoration', {
        decorationId: uuidv7(),
        canvasId: handle.canvasId,
        kind: 'text',
        data: {
          x: target.world.x,
          y: target.world.y,
          text,
          fontSize: target.fontSize,
          color: target.color,
          ...measured,
        },
      })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      // The canvas window listener must not see editing keys.
      event.stopPropagation()
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        finish(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        finish(false)
      }
    }
    const onBlur = (): void => finish(true)
    div.addEventListener('keydown', onKeyDown)
    div.addEventListener('blur', onBlur)

    const close = (): void => {
      done = true
      offCamera()
      div.removeEventListener('keydown', onKeyDown)
      div.removeEventListener('blur', onBlur)
      div.remove()
      if (active?.div === div) active = null
    }

    element.appendChild(div)
    active = { div, close }
    // Focus after the placing pointer event settles. Editing an
    // existing text selects it all (type-to-replace); a new entry
    // just gets the caret.
    setTimeout(() => {
      div.focus()
      const range = document.createRange()
      range.selectNodeContents(div)
      if (!target.existing) range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }, 0)
  }

  // Text tool click → place a new entry legible at the current zoom.
  handle.tools.onPlaceText = (world) => {
    open({
      existing: null,
      world,
      fontSize: legibleFontSize(handle.controller.camera.zoom),
      color: handle.tools.style.textColor,
    })
  }

  // Select-tool double-click on an existing text decoration re-opens it.
  const onDblClick = (event: MouseEvent): void => {
    if (handle.tools.active !== 'select') return
    const bounds = element.getBoundingClientRect()
    const world = handle.controller.camera.screenToWorld({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
    const hit = hitTest(world, handle.controller.items())
    if (!hit || hit.itemKind !== 'decoration' || hit.kind !== 'text') return
    if (!isTextData(hit.data)) return
    open({
      existing: hit,
      world: { x: hit.data.x, y: hit.data.y },
      fontSize: hit.data.fontSize,
      color: hit.data.color,
      fontFamily: hit.data.fontFamily,
      bold: hit.data.bold,
      italic: hit.data.italic,
    })
  }
  element.addEventListener('dblclick', onDblClick)

  return {
    isOpen: () => active !== null,
    destroy() {
      element.removeEventListener('dblclick', onDblClick)
      handle.tools.onPlaceText = null
      active?.close()
    },
  }
}
