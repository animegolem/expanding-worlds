import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetImportProgressForTests,
  enqueueImportBatch,
  onImportProgressChanged,
  requestImportCancel,
  type ImportOutcome,
  type ImportProgressState,
} from './import-progress'
import { __resetStatusForTests, onToastsChanged, type ToastEntry } from './status'

describe('import batch progress (RFC §14.4, AI-IMP-081)', () => {
  beforeEach(() => {
    __resetImportProgressForTests()
    __resetStatusForTests()
  })

  afterEach(() => {
    __resetImportProgressForTests()
    __resetStatusForTests()
  })

  function trackProgress(): { current: ImportProgressState | null } {
    const box: { current: ImportProgressState | null } = { current: null }
    onImportProgressChanged((state) => (box.current = state))
    return box
  }

  function trackToasts(): { current: readonly ToastEntry[] } {
    const box: { current: readonly ToastEntry[] } = { current: [] }
    onToastsChanged((toasts) => (box.current = toasts))
    return box
  }

  /** A task that resolves only when its release() is called — the
   * unit-level stand-in for one file's import work. */
  function controlledTask(outcome: ImportOutcome): {
    task: () => Promise<ImportOutcome>
    release: () => void
    started: () => boolean
  } {
    let release: () => void = () => {}
    let started = false
    const gate = new Promise<void>((resolve) => (release = resolve))
    return {
      task: async () => {
        started = true
        await gate
        return outcome
      },
      release,
      started: () => started,
    }
  }

  it('counts outcomes live and collapses to one summary toast', async () => {
    const progress = trackProgress()
    const toasts = trackToasts()
    enqueueImportBatch([
      async () => 'imported',
      async () => 'deduped',
      async () => 'failed',
      async () => 'imported',
    ])
    expect(progress.current).toMatchObject({ total: 4, done: 0 })
    await vi.waitFor(() => expect(progress.current).toBeNull())
    expect(toasts.current).toHaveLength(1)
    expect(toasts.current[0]!.message).toBe(
      'Import finished: 2 imported · 1 deduplicated · 1 failed',
    )
    expect(toasts.current[0]!.kind).toBe('error')
    expect(toasts.current[0]!.surface).toBe('import-summary')
  })

  it('a clean run summarizes as success and omits zero counts', async () => {
    const toasts = trackToasts()
    enqueueImportBatch([async () => 'imported', async () => 'imported'])
    await vi.waitFor(() => expect(toasts.current).toHaveLength(1))
    expect(toasts.current[0]!.message).toBe('Import finished: 2 imported')
    expect(toasts.current[0]!.kind).toBe('success')
  })

  it('a thrown task counts as failed instead of wedging the pump', async () => {
    const toasts = trackToasts()
    enqueueImportBatch([
      async () => {
        throw new Error('boom')
      },
      async () => 'imported',
    ])
    await vi.waitFor(() => expect(toasts.current).toHaveLength(1))
    expect(toasts.current[0]!.message).toBe('Import finished: 1 imported · 1 failed')
  })

  it('cancel finishes the in-flight file, skips the rest, keeps counts', async () => {
    const progress = trackProgress()
    const toasts = trackToasts()
    const first = controlledTask('imported')
    const second = controlledTask('deduped')
    const third = controlledTask('imported')
    const fourth = controlledTask('imported')
    enqueueImportBatch([first.task, second.task, third.task, fourth.task])
    first.release()
    await vi.waitFor(() => expect(progress.current?.done).toBe(1))
    await vi.waitFor(() => expect(second.started()).toBe(true))
    // ✕ while file two is in flight: it completes (already a
    // committed import), files three and four never start.
    requestImportCancel()
    expect(progress.current?.cancelRequested).toBe(true)
    second.release()
    await vi.waitFor(() => expect(progress.current).toBeNull())
    expect(third.started()).toBe(false)
    expect(fourth.started()).toBe(false)
    expect(toasts.current[0]!.message).toBe(
      'Import cancelled: 1 imported · 1 deduplicated · 2 skipped',
    )
    expect(toasts.current[0]!.kind).toBe('info')
  })

  it('a second enqueue extends the running batch (one strip, one summary)', async () => {
    const progress = trackProgress()
    const toasts = trackToasts()
    const first = controlledTask('imported')
    enqueueImportBatch([first.task, async () => 'imported'])
    expect(progress.current?.total).toBe(2)
    enqueueImportBatch([async () => 'imported', async () => 'deduped'])
    expect(progress.current?.total).toBe(4)
    expect(progress.current?.done).toBe(0)
    first.release()
    await vi.waitFor(() => expect(progress.current).toBeNull())
    expect(toasts.current).toHaveLength(1)
    expect(toasts.current[0]!.message).toBe('Import finished: 3 imported · 1 deduplicated')
  })

  it('after a batch ends, the next drop starts a fresh batch', async () => {
    const progress = trackProgress()
    const toasts = trackToasts()
    enqueueImportBatch([async () => 'imported'])
    await vi.waitFor(() => expect(progress.current).toBeNull())
    enqueueImportBatch([async () => 'deduped'])
    expect(progress.current?.total).toBe(1)
    await vi.waitFor(() => expect(progress.current).toBeNull())
    // Same summary surface: the second toast replaced the first.
    expect(toasts.current).toHaveLength(1)
    expect(toasts.current[0]!.message).toBe('Import finished: 0 imported · 1 deduplicated')
  })
})
