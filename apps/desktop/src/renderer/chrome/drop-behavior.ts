import { DROP_BEHAVIOR_KEY, type DropBehavior } from '@ew/protocol'
import { onEngagementChanged, wake } from './engagement'

/**
 * Multi-drop behavior decision (RFC-0001 §4.9 rev 0.38, AI-IMP-129).
 * A drop or paste of N≥{@link MULTI_DROP_MODAL_THRESHOLD} images asks —
 * once — how they should land: kept separate, sorted in place, grouped
 * in a frame, or grouped-and-sorted. The answer MAY be remembered to the
 * project's `drop_behavior` setting, after which the modal is skipped.
 *
 * The renderer-side store in the {@link ./mirror} mold: framework-
 * agnostic listeners, the §14.4 first-drop ask idiom (a small anchored
 * panel that the engagement clock fades). Import is DEFERRED until the
 * choice is known, so every path — separate, sort, group, group-and-sort
 * — runs as ONE compound undo. Ignoring the ask (idle fade / backdrop)
 * lands on `keep-separate`, exactly the mirror ask's ignore-is-dismissal
 * posture; keep-separate is never persisted (only `ask` is the stored
 * default that shows this modal).
 */

/** N≥ this many simultaneous images engages the modal. Tunable. */
export const MULTI_DROP_MODAL_THRESHOLD = 2

/** What a multi-drop ultimately does. `separate` is the transient
 *  keep-as-imported fallback and is never a stored `drop_behavior`. */
export type DropChoice = 'separate' | 'sort' | 'group' | 'group-and-sort'

/** Whether the ask was raised by an OS drop or a clipboard paste — the
 *  modal phrases the same choices differently (§4.9 big paste). */
export type DropSource = 'drop' | 'paste'

export interface DropAskState {
  x: number
  y: number
  count: number
  source: DropSource
}

/** A parked multi-drop awaiting its decision. `run` performs the
 *  deferred import + composition for the chosen behavior. */
interface PendingDrop {
  anchor: { x: number; y: number }
  count: number
  source: DropSource
  run: (choice: DropChoice) => void
}

type Listener = (ask: DropAskState | null) => void

let ask: DropAskState | null = null
let parked: PendingDrop | null = null
const listeners = new Set<Listener>()
let attached = false

function emit(): void {
  for (const listener of listeners) listener(ask)
}

function attach(): void {
  if (attached || typeof window === 'undefined') return
  attached = true
  // §8.2 engagement fade: idling with an unanswered ask keeps the drop
  // separate (imports as-is) — the same ignore-is-dismissal the mirror
  // ask uses. Nothing is persisted, so the next multi-drop asks again.
  onEngagementChanged((engaged) => {
    if (engaged || ask === null) return
    resolve('separate', false)
  })
}

async function readBehavior(): Promise<DropBehavior> {
  try {
    const settings = await window.ew.project.query('getSettings')
    if (settings.ok) {
      const raw = (settings.result as Record<string, unknown>)[DROP_BEHAVIOR_KEY]
      if (raw === 'sort' || raw === 'group' || raw === 'group-and-sort' || raw === 'ask') return raw
    }
  } catch {
    // Fall through to the ask on any settings failure.
  }
  return 'ask'
}

/** Fire the parked run once, clearing the ask; optionally persist. */
function resolve(choice: DropChoice, remember: boolean): void {
  const pending = parked
  parked = null
  ask = null
  emit()
  if (remember && choice !== 'separate') {
    void window.ew.settings.setProject(DROP_BEHAVIOR_KEY, choice)
  }
  pending?.run(choice)
}

/**
 * Entry point for import surfaces: a multi-image drop/paste. Reads the
 * project's stored behavior; a concrete value runs immediately, `ask`
 * (or unset) parks the drop behind the anchored modal.
 */
export async function requestDropBehavior(req: PendingDrop): Promise<void> {
  attach()
  const behavior = await readBehavior()
  if (behavior !== 'ask') {
    req.run(behavior)
    return
  }
  parked = req
  ask = { x: req.anchor.x, y: req.anchor.y, count: req.count, source: req.source }
  emit()
  wake()
}

/** The modal's four buttons. `remember` persists the choice (ignored
 *  for `separate`, which has no stored value). */
export function answerDropBehavior(choice: DropChoice, remember: boolean): void {
  if (parked === null) return
  resolve(choice, remember)
}

/** Explicit dismissal (backdrop / Escape) — keep the drop separate. */
export function dismissDropAsk(): void {
  if (parked === null) return
  resolve('separate', false)
}

/** Subscribe to ask state; fires immediately, returns unsubscribe. */
export function onDropAskChanged(listener: Listener): () => void {
  attach()
  listeners.add(listener)
  listener(ask)
  return () => listeners.delete(listener)
}

/** Test-only reset. */
export function __resetDropBehaviorForTests(): void {
  ask = null
  parked = null
  listeners.clear()
}
