import type { ChromeBands, PlacementRect } from './anchored-placement'

export type ChromeDensity = 'compact' | 'comfortable'

export const COMPACT_RESERVATION = Object.freeze({
  top: 46,
  right: 56,
  bottom: 64,
  left: 0,
  gutter: 24,
  dockExpanded: 112,
})

export const COMFORTABLE_RESERVATION = Object.freeze({
  top: 0,
  right: 56,
  bottom: 64,
  left: 0,
  gutter: 24,
  dockExpanded: 112,
})

export interface ReservationFrame {
  bands: ChromeBands
  gutter: number
  rect: PlacementRect
  density: ChromeDensity
  dockExpanded: boolean
  railReleased: boolean
}

export interface ReservationValues extends ChromeBands {
  gutter: number
  dockExpanded: number
}

const CHANGE_EVENT = 'ew:reservation-change'
const listeners = new Set<() => void>()

function cssPixels(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

export function reservationDensity(root: HTMLElement = document.documentElement): ChromeDensity {
  return root.dataset['density'] === 'comfortable' ? 'comfortable' : 'compact'
}

export function reservationFrame(
  host: PlacementRect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
  root: HTMLElement = document.documentElement,
): ReservationFrame {
  const density = reservationDensity(root)
  const defaults = density === 'comfortable' ? COMFORTABLE_RESERVATION : COMPACT_RESERVATION
  const style = getComputedStyle(root)
  const dockExpanded = root.dataset['dockExpanded'] === 'true'
  const railReleased = root.dataset['takeoverChrome'] === 'true'
  return reservationFrameFromValues(
    host,
    density,
    dockExpanded,
    {
      top: cssPixels(style, '--ew-reserve-strip', defaults.top),
      right: cssPixels(style, '--ew-reserve-rail', defaults.right),
      bottom: cssPixels(style, '--ew-reserve-dock', defaults.bottom),
      left: 0,
      gutter: cssPixels(style, '--ew-reserve-gutter', defaults.gutter),
      dockExpanded: cssPixels(style, '--ew-reserve-dock-expanded', defaults.dockExpanded),
    },
    railReleased,
  )
}

export function reservationFrameFromValues(
  host: PlacementRect,
  density: ChromeDensity,
  dockExpanded: boolean,
  values: ReservationValues,
  railReleased = false,
): ReservationFrame {
  const bands = {
    top: values.top,
    right: railReleased ? 0 : values.right,
    bottom: dockExpanded ? values.dockExpanded : values.bottom,
    left: values.left,
  }
  const gutter = values.gutter
  return {
    bands,
    gutter,
    density,
    dockExpanded,
    railReleased,
    rect: {
      x: host.x + bands.left + gutter,
      y: host.y + bands.top + gutter,
      width: Math.max(0, host.width - bands.left - bands.right - gutter * 2),
      height: Math.max(0, host.height - bands.top - bands.bottom - gutter * 2),
    },
  }
}

export function setReservationDensity(
  density: ChromeDensity,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset['density'] = density
  dispatchReservationChange(root)
}

export function onReservationChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function dispatchReservationChange(root: HTMLElement = document.documentElement): void {
  root.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  for (const listener of listeners) listener()
}

export function setTakeoverChromeActive(
  active: boolean,
  root: HTMLElement = document.documentElement,
): void {
  if ((root.dataset['takeoverChrome'] === 'true') === active) return
  if (active) root.dataset['takeoverChrome'] = 'true'
  else delete root.dataset['takeoverChrome']
  dispatchReservationChange(root)
}

export function listenForReservationChanges(listener: () => void): () => void {
  const root = document.documentElement
  root.addEventListener(CHANGE_EVENT, listener)
  const observer = new MutationObserver(listener)
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-density', 'data-dock-expanded', 'data-takeover-chrome'],
  })
  return () => {
    root.removeEventListener(CHANGE_EVENT, listener)
    observer.disconnect()
  }
}
