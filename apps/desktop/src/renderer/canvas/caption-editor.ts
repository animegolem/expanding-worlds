/**
 * Inline editor for the §4.5 placement caption register.
 *
 * This is screen-space editing chrome anchored to the caption's world
 * position; the committed caption itself is rendered by canvas-engine's
 * world-scaled label pipeline. Enter and click-away commit one
 * SetPlacementCaption, Shift+Enter inserts a line, and Escape discards.
 */
import { itemWorldAABB, type ScenePlacement } from '@ew/canvas-engine'
import type { CommandResult } from '@ew/commands'
import { placeAnchored } from '../chrome/anchored-placement'
import { Z } from '../z'
import { currentSelectionHalo } from './selection-halo'
import type { CanvasHostHandle } from './host'
import {
  CAPTION_EDITOR_EVENT,
  type CaptionEditorRequest,
} from './caption-request'

export interface CaptionEditorHandle {
  destroy(): void
}

function describeFailure(result: CommandResult): string {
  if (result.status === 'error') return `Set caption failed: ${result.message}`
  if (result.status === 'conflict') return 'Set caption failed: the project changed underneath (retry)'
  return 'Set caption failed'
}

export function attachCaptionEditor(
  host: CanvasHostHandle,
  element: HTMLElement,
  onError: (message: string) => void,
): CaptionEditorHandle {
  const textarea = document.createElement('textarea')
  textarea.dataset['testid'] = 'caption-editor'
  textarea.rows = 3
  textarea.placeholder = 'Write a caption…'
  textarea.setAttribute('aria-label', 'Placement caption')
  textarea.style.cssText =
    `position:absolute;z-index:${Z.popover};display:none;box-sizing:border-box;` +
    'min-width:180px;max-width:420px;min-height:72px;resize:none;padding:8px 10px;' +
    'font:13px/1.35 sans-serif;color:var(--ew-text);background:var(--ew-surface-menu);' +
    'border:1px solid var(--ew-border-strong);border-radius:7px;outline:none;' +
    'box-shadow:0 8px 22px var(--ew-shadow);'
  element.appendChild(textarea)

  let openFor: ScenePlacement | null = null
  let finishing = false
  let generation = 0

  function placementById(id: string): ScenePlacement | null {
    const item = host.controller.items().find((candidate) => candidate.id === id)
    return item && item.itemKind === 'placement' ? item : null
  }

  function layout(): void {
    if (!openFor) return
    const bounds = itemWorldAABB(openFor)
    if (!bounds) return
    const camera = host.controller.camera
    const topLeft = camera.worldToScreen({ x: bounds.x, y: bounds.y })
    const bottomRight = camera.worldToScreen({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    })
    const bodyLeft = Math.min(topLeft.x, bottomRight.x)
    const bodyTop = Math.min(topLeft.y, bottomRight.y)
    const bodyWidth = Math.abs(bottomRight.x - topLeft.x)
    const bodyHeight = Math.abs(bottomRight.y - topLeft.y)
    textarea.style.width = `${Math.min(420, Math.max(180, bodyWidth))}px`
    const surface = textarea.getBoundingClientRect()
    const hostBounds = element.getBoundingClientRect()
    const placed = placeAnchored({
      anchor: { x: bodyLeft, y: bodyTop, width: bodyWidth, height: bodyHeight },
      surface: { width: surface.width, height: surface.height },
      host: { x: 0, y: 0, width: hostBounds.width, height: hostBounds.height },
      x: { preferred: 'center' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 6,
      margin: 4,
      avoid: currentSelectionHalo() ?? undefined,
    })
    textarea.style.left = `${placed.x}px`
    textarea.style.top = `${placed.y}px`
  }

  function close(): void {
    generation += 1
    openFor = null
    finishing = false
    textarea.style.display = 'none'
  }

  async function finish(commit: boolean): Promise<void> {
    if (!openFor || finishing) return
    finishing = true
    const placement = openFor
    const activeGeneration = generation
    if (!commit) {
      close()
      return
    }
    // HTML maxLength counts UTF-16 code units, while the handler's
    // 2,000-character ceiling counts Unicode code points. Keep that
    // authoritative validation in the command handler.
    const next = textarea.value.trim() || null
    if (next === placement.caption) {
      close()
      return
    }
    // Keep the surface open if the command refuses: a failed commit must
    // not silently discard the tester's text.
    const result = await host.gateway.execute('SetPlacementCaption', {
      placementId: placement.id,
      caption: next,
    })
    // A prior commit may settle after the user has opened another item.
    // Never let that stale completion close or refocus the newer editor.
    if (generation !== activeGeneration) return
    if (result.status !== 'committed') {
      finishing = false
      onError(describeFailure(result))
      textarea.focus()
      return
    }
    close()
  }

  function open(request: CaptionEditorRequest): void {
    const placement = placementById(request.placementId)
    if (!placement || placement.appearanceKind === 'frame') return
    openFor = placement
    generation += 1
    finishing = false
    textarea.value = placement.caption ?? ''
    textarea.style.display = 'block'
    layout()
    queueMicrotask(() => {
      if (openFor !== placement) return
      textarea.focus()
      textarea.select()
    })
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!openFor) return
    event.stopPropagation()
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      void finish(false)
    }
  }
  const onBlur = (): void => void finish(true)
  const onRequest = (event: Event): void => {
    open((event as CustomEvent<CaptionEditorRequest>).detail)
  }
  textarea.addEventListener('keydown', onKeyDown)
  textarea.addEventListener('blur', onBlur)
  window.addEventListener(CAPTION_EDITOR_EVENT, onRequest)
  const offCamera = host.controller.camera.onChanged(layout)
  const offScene = host.onSceneApplied(() => {
    if (!openFor) return
    const refreshed = placementById(openFor.id)
    if (!refreshed) close()
    else {
      openFor = refreshed
      layout()
    }
  })

  return {
    destroy() {
      close()
      offCamera()
      offScene()
      textarea.removeEventListener('keydown', onKeyDown)
      textarea.removeEventListener('blur', onBlur)
      window.removeEventListener(CAPTION_EDITOR_EVENT, onRequest)
      textarea.remove()
    },
  }
}
