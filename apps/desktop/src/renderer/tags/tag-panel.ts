/**
 * Tag panel store (RFC §4.8, AI-IMP-071). ONE panel instance, panel
 * physics not takeover: it floats above the canvas anchored to the
 * control that summoned it (a charm-bar tag chip, a note-panel chip —
 * the ⌕ door arrives with 073). The anchor is the §8.5 point grammar
 * the location chooser uses: client coords of the summoning control,
 * clamped into the host by the component. Opening while open REPLACES
 * tag and anchor; Escape closes (the component owns the layered
 * Escape: an active lens peels first).
 */

export interface TagPanelAnchor {
  x: number
  y: number
}

export interface TagPanelState {
  tagId: string
  /** Client coords of the summoning control; null centers-ish. */
  anchor: TagPanelAnchor | null
}

type Listener = (state: TagPanelState | null) => void

let current: TagPanelState | null = null
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener(current)
}

/** Open (or re-target) THE tag panel. Reopen replaces tag and anchor. */
export function openTagPanel(tagId: string, anchor: TagPanelAnchor | null = null): void {
  current = { tagId, anchor }
  notify()
}

export function closeTagPanel(): void {
  if (current === null) return
  current = null
  notify()
}

export function tagPanelState(): TagPanelState | null {
  return current
}

export function onTagPanelChanged(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}
