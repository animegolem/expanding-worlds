/**
 * The ONE source slot (RFC §14.4, AI-IMP-091): the app opens at most
 * one second project read-only at a time (088's replace-on-open slot
 * model), and two renderer surfaces want it — the gallery's
 * everything scope (089) and the open-as-source panel. This registry
 * is the single owner of `ew.secondary.open/close('source', …)`:
 * consumers acquire and release by owner id, and when the OTHER
 * owner holds the slot, acquire REPLACES it — the registry notifies
 * the evicted owner first so it can degrade gracefully (the gallery
 * falls back to this-world; the panel closes itself). The utility's
 * replace-on-open does the actual swap; the registry keeps the
 * renderer's picture of who holds the transport honest.
 *
 * Also here, because import-surfaces must not depend on a Svelte
 * component: the session-scoped tag-border decision (§14.4 "set once,
 * applied to every pull") and the source-panel open-request store —
 * the CharmRail entry point and the ChromeLayer mount speak through
 * it, the search-panel pattern.
 */

export interface SourceSlotHolder {
  ownerId: string
  dir: string
}

export type AcquireResult = { ok: true } | { ok: false; message: string }

let holder: SourceSlotHolder | null = null
/** Bumped by every acquire/release: an open that lands after a newer
 * intent must not install itself as the holder (the callers' own
 * fences — the gallery's scopeEpoch — decide what to SHOW; this one
 * only keeps the registry's ownership record truthful). */
let slotEpoch = 0
const evictionCallbacks = new Map<string, () => void>()

/** Open `dir` into the source slot for `ownerId`. A different owner
 * holding the slot is evicted (notified BEFORE the replacing open,
 * so it stops issuing source queries against a swapped transport).
 * Re-acquire by the same owner just re-opens (dir change included). */
export async function acquireSourceSlot(
  ownerId: string,
  dir: string,
  onEvicted?: () => void,
): Promise<AcquireResult> {
  const epoch = ++slotEpoch
  if (holder && holder.ownerId !== ownerId) {
    const evicted = holder.ownerId
    holder = null
    const notify = evictionCallbacks.get(evicted)
    evictionCallbacks.delete(evicted)
    notify?.()
  }
  const opened = await window.ew.secondary.open('source', dir)
  if (epoch !== slotEpoch) {
    // A newer acquire or release superseded this open mid-flight; the
    // newest intent owns the slot record — report non-acquisition.
    return { ok: false, message: 'superseded by a newer source-slot request' }
  }
  if (!opened.ok) {
    holder = null
    return { ok: false, message: opened.message }
  }
  holder = { ownerId, dir }
  evictionCallbacks.delete(ownerId)
  if (onEvicted) evictionCallbacks.set(ownerId, onEvicted)
  return { ok: true }
}

/** Close the slot — but only if `ownerId` still holds it: releasing
 * after an eviction (or after another surface took over) is a no-op,
 * never a stomp on the new holder's transport. */
export function releaseSourceSlot(ownerId: string): void {
  evictionCallbacks.delete(ownerId)
  if (!holder || holder.ownerId !== ownerId) return
  holder = null
  slotEpoch += 1
  void window.ew.secondary.close('source')
}

export function sourceSlotHolder(): SourceSlotHolder | null {
  return holder
}

// ---- §14.4 tag border: session-scoped, panel-set, drop-read ----

export type SourceBorder = 'none' | 'all' | string[]

let border: SourceBorder = 'none'

/** The panel header's control writes it; every pull reads it. */
export function setSourceBorder(next: SourceBorder): void {
  border = next
}

/** Read by the canvas drop handler at ingest time (import-surfaces):
 * the decision travels with the session, never per-drag. */
export function sourceBorder(): SourceBorder {
  return border
}

// ---- source-panel open requests (the search-panel store pattern) ----

export interface SourcePanelState {
  dir: string
}

type PanelListener = (state: SourcePanelState | null) => void

let panelState: SourcePanelState | null = null
const panelListeners = new Set<PanelListener>()

function notifyPanel(): void {
  for (const listener of panelListeners) listener(panelState)
}

/** Open (or retarget) the pinned source panel at `dir`. The panel
 * component owns the actual slot acquire. */
export function openSourcePanel(dir: string): void {
  panelState = { dir }
  notifyPanel()
}

export function closeSourcePanel(): void {
  if (panelState === null) return
  panelState = null
  notifyPanel()
}

export function onSourcePanelChanged(listener: PanelListener): () => void {
  panelListeners.add(listener)
  listener(panelState)
  return () => panelListeners.delete(listener)
}
