/**
 * Search panel store (RFC §8.3, AI-IMP-073). ONE panel instance,
 * panel physics like the tag panel: it floats above the canvas
 * anchored to the ⌕ rail charm that summoned it (client coords,
 * clamped into the host by the component). Two modes on one surface:
 * 'search' (the ⌕ charm — grouped full-text results with the leading
 * `#` tag mode) and 'quick' (Mod+P — title_key quick-open, no groups,
 * no `#`). Opening while open REPLACES mode and anchor; Escape and
 * the charm close it. A takeover opening closes it too (§8.2: the
 * takeover owns the window; the panel is board chrome sharing its
 * z-plane, so a survivor would float above the takeover).
 */

import { onTakeoverChanged, takeoverActive } from './takeover'

export type SearchPanelMode = 'search' | 'quick'

export interface SearchPanelAnchor {
  x: number
  y: number
}

export interface SearchPanelState {
  mode: SearchPanelMode
  /** Client coords of the summoning control; null (Mod+P) centers. */
  anchor: SearchPanelAnchor | null
}

type Listener = (state: SearchPanelState | null) => void

let current: SearchPanelState | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener(current)
}

/** Open (or re-target) THE search panel. Reopen replaces the state. */
export function openSearchPanel(
  mode: SearchPanelMode,
  anchor: SearchPanelAnchor | null = null,
): void {
  current = { mode, anchor }
  notify()
}

export function closeSearchPanel(): void {
  if (current === null) return
  current = null
  notify()
}

/** Charm click grammar: the originating control toggles its panel. */
export function toggleSearchPanel(anchor: SearchPanelAnchor | null = null): void {
  if (current !== null) closeSearchPanel()
  else openSearchPanel('search', anchor)
}

export function searchPanelState(): SearchPanelState | null {
  return current
}

/** Subscribe; fires immediately with the current state. */
export function onSearchPanelChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}

// The takeover store stays dependency-free; the panel retires itself.
// (Fires immediately with the current takeover on module load — a
// no-op close while nothing is open.)
// AI-IMP-183 (M-29): retire under ANY takeover-family overlay — a named
// view OR an input blocker like the big editor — not only a named kind.
onTakeoverChanged(() => {
  if (takeoverActive()) closeSearchPanel()
})
