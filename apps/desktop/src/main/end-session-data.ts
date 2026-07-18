import type { GcSweepRequest } from '@ew/protocol'
import type { SnapshotRunResult } from './snapshot'

interface SnapshotBeforeGcDeps {
  runSnapshot: () => Promise<SnapshotRunResult>
  runGcSweep: (request: GcSweepRequest) => Promise<unknown>
  nowMs?: () => number
}

/**
 * The data-safety half of End Session: a successful snapshot/checkpoint
 * is the capability to begin the destructive sweep. A typed failure is
 * returned unchanged and GC is never invoked; callers may still close
 * the app on their independent time bound.
 */
export async function runSnapshotBeforeGc(
  deps: SnapshotBeforeGcDeps,
  deadlineAtMs: number,
  nowIso?: string,
): Promise<SnapshotRunResult> {
  const snapshot = await deps.runSnapshot()
  if (!snapshot.ok) return snapshot

  if ((deps.nowMs ?? Date.now)() >= deadlineAtMs - 100) return snapshot
  await deps.runGcSweep({
    type: 'gc-sweep',
    deadlineAtMs,
    ...(nowIso === undefined ? {} : { nowIso }),
  })
  return snapshot
}
