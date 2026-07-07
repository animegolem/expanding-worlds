/**
 * The pin tool (RFC §6.2 rev 0.20, AI-IMP-067): ◉ in the dock,
 * shortcut N. A click places a PROVISIONAL dot — pure DOM, no domain
 * record — and opens the focused pin-phantom panel beside it. The
 * first committed edit fires one CreatePin; Escape (or any discard)
 * and nothing ever existed, dot included. The dot lives exactly as
 * long as its phantom does: the panels store is the source of truth.
 */
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { onPanelsChanged, openPinPhantom, panelRecords } from '../note/panels'

export interface PinToolHandle {
  destroy(): void
}

export function attachPinTool(host: CanvasHostHandle, element: HTMLElement): PinToolHandle {
  let dot: HTMLDivElement | null = null
  let dotWorld: { x: number; y: number; canvasId: string } | null = null
  let frame = 0

  function removeDot(): void {
    dot?.remove()
    dot = null
    dotWorld = null
  }

  function layout(): void {
    if (!dot || !dotWorld) return
    if (dotWorld.canvasId !== host.canvasId) {
      dot.style.display = 'none'
      return
    }
    const screen = host.controller.camera.worldToScreen({ x: dotWorld.x, y: dotWorld.y })
    dot.style.display = 'block'
    dot.style.left = `${screen.x - 6}px`
    dot.style.top = `${screen.y - 6}px`
  }

  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function placeDot(world: { x: number; y: number }): void {
    removeDot()
    dot = document.createElement('div')
    dot.dataset['testid'] = 'pin-provisional-dot'
    dot.style.cssText =
      `position:absolute;width:12px;height:12px;border-radius:50%;z-index:${Z.affordance};` +
      'background:var(--ew-node-dot-default);border:2px solid var(--ew-text);opacity:0.85;pointer-events:none;'
    element.appendChild(dot)
    dotWorld = { ...world, canvasId: host.canvasId }
    layout()
  }

  // §6.2: click with the tool places the dot and opens the phantom
  // focused; the tool stays active for repeated placement.
  host.tools.onPlacePin = (world) => {
    placeDot(world)
    openPinPhantom(host.canvasId, world.x, world.y)
  }

  const disposers = [
    host.controller.camera.onChanged(() => schedule()),
    host.onSceneApplied(() => schedule()),
    // The dot exists exactly as long as an unpersisted pin phantom
    // does: materialized (request became a note) or discarded
    // (record gone) both clear it.
    onPanelsChanged(() => {
      const alive = panelRecords().some((record) => record.request.kind === 'pin-phantom')
      if (!alive) removeDot()
    }),
  ]

  return {
    destroy() {
      host.tools.onPlacePin = null
      if (frame) cancelAnimationFrame(frame)
      for (const dispose of disposers) dispose()
      removeDot()
    },
  }
}
