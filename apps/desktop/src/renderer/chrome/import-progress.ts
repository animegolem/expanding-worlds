/**
 * Import batch progress store (RFC §14.4, AI-IMP-081): large drops
 * run as an interruptible progress strip, never a modal. The import
 * surface enqueues one task per file — each task is that file's
 * EXISTING committed import (staged pipeline + CreatePin), so cancel
 * has nothing to roll back: it only stops files that have not started.
 * A drop arriving while a batch runs queues into the same strip.
 *
 * Framework-agnostic listener store in the status.ts mold so the
 * queue/cancel/summary logic unit-tests without a DOM; the strip
 * component subscribes via onImportProgressChanged.
 */
import { wake } from './engagement'
import { toast } from './status'

/** §14.4 batch threshold: a drop of MORE than this many files runs
 * as a visible batch; at or below it, the quiet path is unchanged. */
export const IMPORT_BATCH_THRESHOLD = 5

export type ImportOutcome = 'imported' | 'deduped' | 'failed'

/** One file's committed import work; resolves with its outcome. */
export type ImportTask = () => Promise<ImportOutcome>

export interface ImportProgressState {
  total: number
  done: number
  imported: number
  deduped: number
  failed: number
  cancelRequested: boolean
}

type ProgressListener = (state: ImportProgressState | null) => void

let state: ImportProgressState | null = null
const queue: ImportTask[] = []
let pumping = false
let cancelRequested = false
const listeners = new Set<ProgressListener>()

// Deterministic pacing for hidden-window e2e (the ew-test-condition /
// ew-test-set-engagement pattern): `ew-test-import-allow` sets how
// many files may still start; the pump waits at zero. Production
// never dispatches the event, so the allowance stays infinite.
let allowance = Number.POSITIVE_INFINITY
let gateWaiters: Array<() => void> = []
let gateAttached = false

function emit(): void {
  for (const listener of listeners) listener(state)
}

function releaseGate(): void {
  const waiters = gateWaiters
  gateWaiters = []
  for (const release of waiters) release()
}

function attachTestGate(): void {
  if (gateAttached || typeof window === 'undefined') return
  gateAttached = true
  window.addEventListener('ew-test-import-allow', ((event: Event) => {
    const detail = (event as CustomEvent<{ count: number | 'all' }>).detail
    allowance = detail.count === 'all' ? Number.POSITIVE_INFINITY : detail.count
    releaseGate()
  }) as EventListener)
}

// Attach at module load (renderer boot) so a test may close the gate
// BEFORE the first drop; under node (vitest) this is a no-op.
attachTestGate()

async function gate(): Promise<void> {
  while (allowance <= 0 && !cancelRequested) {
    await new Promise<void>((resolve) => gateWaiters.push(resolve))
  }
  allowance -= 1
}

/** True while a batch is running — the import surface routes ANY
 * drop into the running batch so a second drop queues, never blocks. */
export function isImportBatchActive(): boolean {
  return state !== null
}

/** Start a batch, or extend the running one (a second drop queues
 * into the same strip; the total grows, nothing restarts). */
export function enqueueImportBatch(tasks: readonly ImportTask[]): void {
  if (tasks.length === 0) return
  queue.push(...tasks)
  state = state
    ? { ...state, total: state.total + tasks.length }
    : {
        total: tasks.length,
        done: 0,
        imported: 0,
        deduped: 0,
        failed: 0,
        cancelRequested: false,
      }
  emit()
  // §11.4 precedent (AI-IMP-066): an ongoing surface must not arrive
  // into faded chrome.
  wake()
  if (!pumping) void pump()
}

/** ✕: stop files that have not started. The in-flight file finishes
 * (its import is a committed record either way); everything still
 * queued is skipped and reported in the summary. */
export function requestImportCancel(): void {
  if (state === null || cancelRequested) return
  cancelRequested = true
  state = { ...state, cancelRequested: true }
  emit()
  releaseGate()
}

async function pump(): Promise<void> {
  pumping = true
  while (queue.length > 0 && !cancelRequested) {
    await gate()
    if (cancelRequested) break
    const task = queue.shift()
    if (task === undefined) break
    let outcome: ImportOutcome
    try {
      outcome = await task()
    } catch {
      outcome = 'failed'
    }
    if (state !== null) {
      state = {
        ...state,
        done: state.done + 1,
        imported: state.imported + (outcome === 'imported' ? 1 : 0),
        deduped: state.deduped + (outcome === 'deduped' ? 1 : 0),
        failed: state.failed + (outcome === 'failed' ? 1 : 0),
      }
      emit()
    }
  }
  const skipped = queue.length
  queue.length = 0
  finish(skipped)
  pumping = false
}

/** The strip collapses to one summary toast (§14.4) — completion and
 * cancel both end in the same transient vocabulary (§8.6). */
function finish(skipped: number): void {
  const summary = state
  const wasCancelled = cancelRequested
  state = null
  cancelRequested = false
  emit()
  if (summary === null) return
  const parts = [`${summary.imported} imported`]
  if (summary.deduped > 0) parts.push(`${summary.deduped} deduplicated`)
  if (summary.failed > 0) parts.push(`${summary.failed} failed`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  const label = wasCancelled ? 'Import cancelled' : 'Import finished'
  toast(`${label}: ${parts.join(' · ')}`, {
    kind: summary.failed > 0 ? 'error' : wasCancelled ? 'info' : 'success',
    surface: 'import-summary',
  })
  wake()
}

/** Subscribe to batch progress (null = no batch); fires immediately,
 * returns unsub. */
export function onImportProgressChanged(listener: ProgressListener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

/** Test-only: wipe module state so unit tests stay independent. */
export function __resetImportProgressForTests(): void {
  state = null
  queue.length = 0
  cancelRequested = false
  pumping = false
  allowance = Number.POSITIVE_INFINITY
  releaseGate()
  listeners.clear()
}
