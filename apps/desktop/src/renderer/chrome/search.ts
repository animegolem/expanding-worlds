/** One centered search palette, reached through the rail or Mod+K. */
import { inputBlockerActive, onTakeoverChanged } from './takeover'

export type SearchPanelMode = 'search' | 'quick'
export interface SearchPanelState { mode: SearchPanelMode; serial: number }
type Listener = (state: SearchPanelState | null) => void

let current: SearchPanelState | null = null
let serial = 0
const listeners = new Set<Listener>()

function notify(): void { for (const listener of listeners) listener(current) }

/** The mode records the summoning door for compatibility/telemetry only;
 * both doors now expose the same palette and result universe. */
export function openSearchPanel(mode: SearchPanelMode = 'search'): void {
  current = { mode, serial: ++serial }
  notify()
}

export function closeSearchPanel(): void {
  if (current === null) return
  current = null
  notify()
}

export function toggleSearchPanel(): void {
  if (current) closeSearchPanel()
  else openSearchPanel('search')
}

export function searchPanelState(): SearchPanelState | null { return current }

export function onSearchPanelChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}

// A centered Search layer may sit above a named view and return to it.
// Unnamed takeover-family blockers still retire Search for input safety.
onTakeoverChanged(() => { if (inputBlockerActive()) closeSearchPanel() })
