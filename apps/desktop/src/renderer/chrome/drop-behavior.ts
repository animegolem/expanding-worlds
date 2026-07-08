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
/** Multi-drops parked behind the anchored modal, oldest first. The
 *  head is the batch the visible ask decides; the rest wait their turn.
 *  A queue (not a single slot) so overlapping multi-drops never clobber
 *  one another — copies `mirror.ts`'s `pendingAsk` array (AI-IMP-178). */
let pendingAsk: PendingDrop[] = []
const listeners = new Set<Listener>()
let attached = false

function emit(): void {
  for (const listener of listeners) listener(ask)
}

function attach(): void {
  if (attached || typeof window === 'undefined') return
  attached = true
  // §8.2 engagement fade: idling with unanswered asks keeps every parked
  // drop separate (imports as-is) — the same ignore-is-dismissal the
  // mirror ask uses. Nothing is persisted, so the next multi-drop asks
  // again. Each batch's closure still runs, so no import is discarded.
  onEngagementChanged((engaged) => {
    if (engaged || ask === null) return
    const queued = pendingAsk
    pendingAsk = []
    ask = null
    emit()
    for (const req of queued) req.run('separate')
  })
}

/** Reflect the head parked drop into the visible ask (or clear it when
 *  the queue is empty), then wake the fade clock so a fresh modal
 *  demands attention. */
function present(): void {
  const head = pendingAsk[0]
  ask =
    head === undefined
      ? null
      : { x: head.anchor.x, y: head.anchor.y, count: head.count, source: head.source }
  emit()
  if (head !== undefined) wake()
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

/** Fire the HEAD parked run once and dequeue it, then present the next
 *  parked ask (if any); optionally persist the choice. The answer binds
 *  to exactly one batch, so no other batch's closure is discarded. */
function resolveHead(choice: DropChoice, remember: boolean): void {
  const head = pendingAsk.shift()
  if (head === undefined) return
  if (remember && choice !== 'separate') {
    void window.ew.settings.setProject(DROP_BEHAVIOR_KEY, choice)
  }
  present()
  head.run(choice)
}

/**
 * Entry point for import surfaces: a multi-image drop/paste. Reads the
 * project's stored behavior; a concrete value runs immediately, `ask`
 * (or unset) parks the drop behind the anchored modal. Overlapping
 * multi-drops queue — a second drop arriving before the first is
 * answered waits its turn rather than clobbering it (AI-IMP-178).
 */
export async function requestDropBehavior(req: PendingDrop): Promise<void> {
  attach()
  const behavior = await readBehavior()
  if (behavior !== 'ask') {
    req.run(behavior)
    return
  }
  pendingAsk.push(req)
  // Present only when no ask is already showing — otherwise this request
  // waits behind the head (mirror.ts's `if (ask === null)` present-guard).
  if (ask === null) present()
}

/** The modal's four buttons apply to the HEAD parked drop. `remember`
 *  persists the choice for FUTURE drops (ignored for `separate`, which
 *  has no stored value); any already-queued asks still present in turn. */
export function answerDropBehavior(choice: DropChoice, remember: boolean): void {
  if (ask === null) return
  resolveHead(choice, remember)
}

/** Explicit dismissal (backdrop / Escape) — keep the head drop separate,
 *  then present the next parked ask. */
export function dismissDropAsk(): void {
  if (ask === null) return
  resolveHead('separate', false)
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
  pendingAsk = []
  listeners.clear()
}
