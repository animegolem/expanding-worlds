/**
 * Session navigation history (RFC §8.1, AI-IMP-060): one
 * project-scoped stack per window rendering the ENTRY ROUTE, never
 * structural ancestry (§4.4: containment is a graph with legal
 * cycles; no canonical parent exists). Every cross-canvas jump from
 * any surface MUST route through `navigateTo` — that is how "every
 * jump enters history" holds by construction. Later tickets (frame
 * charm 063, uses rows 065, bookmarks 061) call this; nothing calls
 * host.openCanvas directly except this store.
 *
 * Entries retain the viewport the user LEFT at (session state — the
 * domain's per-canvas camera persistence in host.ts is the fallback
 * when an entry has none). Back/Forward skip and collapse entries
 * whose target is trashed or purged (§8.1 stale-target rule),
 * checked at traversal time via getCanvasScene.
 */
import type { CanvasHostHandle } from '../canvas/host'
import { KEY } from '../keys/bindings'
import { matches } from '../keys/registry'
import { openSearchPanel } from './search'
import { takeoverActive } from './takeover'

export interface NavViewport {
  x: number
  y: number
  zoom: number
}

export interface NavEntry {
  canvasId: string
  label: string
  viewport: NavViewport | null
}

type Listener = () => void

let handle: CanvasHostHandle | null = null
let entries: NavEntry[] = []
let cursor = -1
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener()
}

function captureViewport(): void {
  const current = entries[cursor]
  if (current && handle) current.viewport = handle.controller.camera.state()
}

async function targetAlive(canvasId: string): Promise<boolean> {
  const response = await window.ew.project.query('getCanvasScene', { canvasId })
  return response.ok && response.result !== null
}

async function openEntry(entry: NavEntry): Promise<void> {
  if (!handle) return
  await handle.openCanvas(entry.canvasId)
  // openCanvas restored the canvas's persisted camera; the session
  // entry's own viewport wins when we have one.
  if (entry.viewport) handle.controller.camera.set(entry.viewport)
  notify()
}

/** Push a new entry and go. The one true flight path for every
 * cross-canvas jump. No-op when already standing there. */
export async function navigateTo(canvasId: string, label = 'Board'): Promise<void> {
  if (!handle || canvasId === handle.canvasId) return
  captureViewport()
  entries = entries.slice(0, cursor + 1)
  entries.push({ canvasId, label, viewport: null })
  cursor = entries.length - 1
  await openEntry(entries[cursor]!)
}

/** Back: land on the nearest LIVE prior entry; dead entries are
 * removed as they are found (§8.1 skip-and-collapse). */
export async function back(): Promise<void> {
  if (!handle) return
  while (cursor > 0) {
    const candidate = entries[cursor - 1]!
    if (await targetAlive(candidate.canvasId)) {
      captureViewport()
      cursor -= 1
      await openEntry(candidate)
      return
    }
    entries.splice(cursor - 1, 1)
    cursor -= 1
    notify()
  }
}

export async function forward(): Promise<void> {
  if (!handle) return
  while (cursor < entries.length - 1) {
    const candidate = entries[cursor + 1]!
    if (await targetAlive(candidate.canvasId)) {
      captureViewport()
      cursor += 1
      await openEntry(candidate)
      return
    }
    entries.splice(cursor + 1, 1)
    notify()
  }
}

/** Crumb click: return to that history entry (Back-to-there), with
 * its viewport restored. */
export async function goToIndex(index: number): Promise<void> {
  if (!handle || index < 0 || index > cursor) return
  if (index === cursor) return
  const target = entries[index]!
  if (!(await targetAlive(target.canvasId))) {
    entries.splice(index, 1)
    if (index <= cursor) cursor -= 1
    notify()
    return
  }
  captureViewport()
  cursor = index
  await openEntry(target)
}

/** ⌂: the project's protected root canvas, as a history entry. */
export async function home(): Promise<void> {
  const root = entries[0]
  if (!root) return
  if (handle && root.canvasId === handle.canvasId) return
  await navigateTo(root.canvasId, root.label)
}

export function pathEntries(): ReadonlyArray<NavEntry> {
  return entries.slice(0, cursor + 1)
}

export function canGoBack(): boolean {
  return cursor > 0
}

export function canGoForward(): boolean {
  return cursor < entries.length - 1
}

export function onNavigationChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Wire the store to the mounted canvas host. The canvas the host
 * mounted with is the root entry (CanvasHost opens the project's
 * root canvas). Returns a detach. */
export function attachNavigation(host: CanvasHostHandle): () => void {
  handle = host
  entries = [{ canvasId: host.canvasId, label: 'Home', viewport: null }]
  cursor = 0

  const onKeydown = (event: KeyboardEvent): void => {
    if (takeoverActive()) return
    if (matches(event, KEY.navBack)) {
      event.preventDefault()
      void back()
    } else if (matches(event, KEY.navForward)) {
      event.preventDefault()
      void forward()
    }
  }
  // §8.3 Mod+P quick-open: CAPTURE phase, so it works from board
  // focus AND from inside an open note editor (CodeMirror's own
  // keydown handlers run on the editor DOM before window-bubble
  // listeners; capture on window runs before any of them).
  const onQuickOpenKey = (event: KeyboardEvent): void => {
    if (takeoverActive()) return
    if (!matches(event, KEY.quickOpen)) return
    event.preventDefault()
    event.stopPropagation()
    openSearchPanel('quick', null)
  }
  window.addEventListener('keydown', onQuickOpenKey, true)
  // Mouse buttons 4/5 arrive as pointer buttons 3/4.
  const onPointerUp = (event: PointerEvent): void => {
    if (takeoverActive()) return
    if (event.button === 3) void back()
    else if (event.button === 4) void forward()
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerup', onPointerUp)
  // macOS trackpad swipe / Windows mouse X-buttons, forwarded by main.
  const offGesture = window.ew.nav.onGesture((direction) => {
    if (takeoverActive()) return
    if (direction === 'back') void back()
    else void forward()
  })

  // e2e drives flights through this hook until the dive UI (063)
  // exists; it stays afterward alongside __ewDebug.
  window.__ewNav = {
    navigateTo: (canvasId: string, label?: string) => navigateTo(canvasId, label),
    back,
    forward,
    home,
    goToIndex,
    entries: () => entries.map((entry) => ({ ...entry })),
    cursor: () => cursor,
  }

  notify()
  return () => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keydown', onQuickOpenKey, true)
    window.removeEventListener('pointerup', onPointerUp)
    offGesture()
    delete window.__ewNav
    handle = null
    entries = []
    cursor = -1
  }
}

declare global {
  interface Window {
    __ewNav?: {
      navigateTo: (canvasId: string, label?: string) => Promise<void>
      back: () => Promise<void>
      forward: () => Promise<void>
      home: () => Promise<void>
      goToIndex: (index: number) => Promise<void>
      entries: () => NavEntry[]
      cursor: () => number
    }
  }
}
