/**
 * Frame furniture: the on-edge frame title (RFC §4.9 rev 0.55, §8.2,
 * AI-IMP-138).
 *
 * A frame is furniture, not art — so its title rides the DOM adornment
 * layer over the canvas, exactly like the charm bar (charms-ui.ts): UI,
 * never pixels, so the crop/flip/export exclusion is structural rather
 * than filtered. The title renders in MONO, straddling the frame's TOP
 * edge — deliberately where an item's §4.5 label never sits (labels
 * hang BELOW the body), so the position itself is the tell that this is
 * a frame's name and not a pin's.
 *
 * It is furniture, so it exists ONLY above the shared shrink-ladder
 * furniture floor (isFurnitureVisible on the frame's rendered screen
 * size — never zoom percentage). Below the floor the title vanishes;
 * the region keeps a ≥1px hairline stroke (placement.ts,
 * syncFrameRegionStroke) so membership never disappears with it. The
 * layer fades with the shared engagement clock, the same cadence as the
 * charms it lives beside.
 */
import { isFurnitureVisible, itemWorldAABB } from '@ew/canvas-engine'
import type { CanvasHostHandle } from './host'
import { Z } from '../z'
import { onEngagementChanged } from '../chrome/engagement'

export interface FramesFurnitureHandle {
  destroy(): void
}

let styleInjected = false
function injectStyles(): void {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  // The whole layer fades on the shared engagement clock (parity with
  // the charm layer). A faded layer must not swallow pointer input, but
  // titles are inert to begin with (pointer-events:none), so the fade
  // is purely visual here.
  style.textContent = `
    .ew-frame-furniture { transition: opacity 240ms ease-out; opacity: 1; }
    .ew-frame-furniture.disengaged { opacity: 0; }
  `
  document.head.appendChild(style)
}

export function attachFramesFurniture(
  host: CanvasHostHandle,
  element: HTMLElement,
): FramesFurnitureHandle {
  injectStyles()
  const layer = document.createElement('div')
  layer.dataset['testid'] = 'frame-furniture-layer'
  layer.className = 'ew-frame-furniture'
  layer.style.cssText = `position:absolute;inset:0;z-index:${Z.affordance};pointer-events:none;overflow:hidden;`
  element.appendChild(layer)

  const titles = new Map<string, HTMLDivElement>()
  const disposers: Array<() => void> = []

  function titleFor(id: string): HTMLDivElement {
    let title = titles.get(id)
    if (title) return title
    title = document.createElement('div')
    title.dataset['testid'] = `frame-title-${id}`
    // Mono (§4.9 "renders on its top edge in mono"): the platform
    // monospace stack — chrome keeps the platform face, and Maple Mono
    // is reserved for note TEXT only (theme.css). The ink is the
    // dedicated --ew-frame-label token (no raw hex — the guard forbids
    // it); a soft scrim keeps it legible over whatever sits in the
    // frame. Inert: a label, never a control.
    title.style.cssText =
      'position:absolute;pointer-events:none;box-sizing:border-box;' +
      'transform:translate(-50%,-50%);max-width:60%;padding:1px 6px;border-radius:4px;' +
      'font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.4;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'color:var(--ew-frame-label);background:var(--ew-art-chip-scrim-soft);'
    layer.appendChild(title)
    titles.set(id, title)
    return title
  }

  function removeTitle(id: string): void {
    const title = titles.get(id)
    if (!title) return
    title.remove()
    titles.delete(id)
  }

  let frame = 0
  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      layout()
    })
  }

  function layout(): void {
    const camera = host.controller.camera
    const seen = new Set<string>()
    for (const item of host.controller.items()) {
      if (item.itemKind !== 'placement') continue
      if (item.appearanceKind !== 'frame') continue
      const label = (item.noteTitle ?? '').trim()
      if (label.length === 0) continue // empty title → no furniture
      const aabb = itemWorldAABB(item)
      if (!aabb) continue
      const screenW = aabb.width * camera.zoom
      const screenH = aabb.height * camera.zoom
      // Furniture floor (§8.2): the title exists only above the shared
      // rendered-size threshold, keyed on the smaller on-screen span so
      // a thin frame drops its title before a fat one — the shrink
      // ladder helper, never a zoom percentage.
      if (!isFurnitureVisible(Math.min(screenW, screenH))) continue
      seen.add(item.id)
      const title = titleFor(item.id)
      if (title.textContent !== label) title.textContent = label
      // Straddle the TOP edge, horizontally centered — the position an
      // item label never occupies.
      const topCenter = camera.worldToScreen({ x: aabb.x + aabb.width / 2, y: aabb.y })
      title.style.left = `${topCenter.x}px`
      title.style.top = `${topCenter.y}px`
    }
    for (const id of [...titles.keys()]) {
      if (!seen.has(id)) removeTitle(id)
    }
  }

  disposers.push(host.controller.camera.onChanged(() => schedule()))
  disposers.push(host.onSceneApplied(() => schedule()))
  disposers.push(
    onEngagementChanged((engaged) => {
      layer.classList.toggle('disengaged', !engaged)
    }),
  )
  schedule()

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame)
      for (const dispose of disposers) dispose()
      for (const id of [...titles.keys()]) removeTitle(id)
      layer.remove()
    },
  }
}
