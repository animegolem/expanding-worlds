/**
 * The pin tool (RFC §6.2 rev 0.20, AI-IMP-067): ◉ in the dock,
 * shortcut N. A click places a PROVISIONAL dot — pure DOM, no domain
 * record — and opens the focused pin-phantom panel beside it. The
 * first committed edit fires one CreatePin; Escape (or any discard)
 * and nothing ever existed, dot included. The dot lives exactly as
 * long as its phantom does: the panels store is the source of truth.
 */
import { pinWorldDiameterAtZoom } from '@ew/canvas-engine'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import {
  discardPinPhantoms,
  onPanelsChanged,
  openPinPhantom,
  panelRecords,
} from '../note/panels'

export interface PinToolHandle {
  destroy(): void
}

export function attachPinTool(host: CanvasHostHandle, element: HTMLElement): PinToolHandle {
  let dot: HTMLDivElement | null = null
  let dotWorld: { x: number; y: number; canvasId: string; diameter: number } | null = null
  let phantomKey: number | null = null
  let frame = 0

  function discardPair(): void {
    phantomKey = null
    discardPinPhantoms()
    if (!dot) return
    const retiring = dot
    dot = null
    dotWorld = null
    delete retiring.dataset['testid']
    retiring.style.opacity = '0'
    setTimeout(() => retiring.remove(), 120)
  }

  function layout(): void {
    if (!dot || !dotWorld) return
    if (dotWorld.canvasId !== host.canvasId) {
      dot.style.display = 'none'
      return
    }
    const screen = host.controller.camera.worldToScreen({ x: dotWorld.x, y: dotWorld.y })
    const diameter = dotWorld.diameter * host.controller.camera.zoom
    dot.style.display = 'block'
    dot.style.width = `${diameter}px`
    dot.style.height = `${diameter}px`
    dot.style.left = `${screen.x - diameter / 2}px`
    dot.style.top = `${screen.y - diameter / 2}px`
  }

  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function placeDot(world: { x: number; y: number }): number {
    discardPair()
    const diameter = pinWorldDiameterAtZoom(host.controller.camera.zoom)
    dot = document.createElement('div')
    dot.dataset['testid'] = 'pin-provisional-ghost'
    dot.style.cssText =
      `position:absolute;z-index:${Z.affordance};border-radius:50%;` +
      'background:var(--ew-node-dot-default);opacity:0.45;pointer-events:none;' +
      'transition:opacity 180ms ease,transform 180ms ease;transform-origin:50% 50%;'
    element.appendChild(dot)
    dotWorld = { ...world, canvasId: host.canvasId, diameter }
    layout()
    return diameter
  }

  // §6.2: click with the tool places the dot and opens the phantom
  // focused; the tool stays active for repeated placement.
  host.tools.onPlacePin = (world) => {
    const diameter = placeDot(world)
    phantomKey = openPinPhantom(host.canvasId, world.x, world.y, diameter)
  }

  const disposers = [
    host.tools.registerToolLeave('pin', discardPair),
    host.controller.camera.onChanged(() => schedule()),
    host.onSceneApplied(() => schedule()),
    // The dot exists exactly as long as an unpersisted pin phantom
    // does: materialized (request became a note) or discarded
    // (record gone) both clear it.
    onPanelsChanged(() => {
      if (phantomKey === null || !dot) return
      const record = panelRecords().find((candidate) => candidate.key === phantomKey)
      if (record?.request.kind === 'pin-phantom') return
      if (record?.request.kind === 'note' && record.anchor.kind === 'placement') {
        const seated = dot
        seated.dataset['seated'] = 'true'
        seated.style.opacity = '1'
        seated.style.transform = 'scale(0.94)'
        dot = null
        dotWorld = null
        phantomKey = null
        setTimeout(() => seated.remove(), 180)
      } else {
        discardPair()
      }
    }),
  ]

  return {
    destroy() {
      host.tools.onPlacePin = null
      if (frame) cancelAnimationFrame(frame)
      for (const dispose of disposers) dispose()
      discardPair()
    },
  }
}
