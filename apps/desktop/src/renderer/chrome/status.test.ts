import type { ServiceStatusEvent, SnapshotPushState } from '@ew/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION_MS } from './feel'
import {
  __resetStatusForTests,
  attachSnapshotPush,
  attachServiceStatus,
  condition,
  dismissCondition,
  dismissToast,
  onConditionsChanged,
  onToastsChanged,
  reportRecoveryRepairs,
  toast,
  type Condition,
  type ToastEntry,
} from './status'

describe('status store (RFC §8.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetStatusForTests()
  })

  afterEach(() => {
    __resetStatusForTests()
    vi.useRealTimers()
  })

  function trackToasts(): { current: readonly ToastEntry[] } {
    const box: { current: readonly ToastEntry[] } = { current: [] }
    onToastsChanged((toasts) => (box.current = toasts))
    return box
  }

  function trackConditions(): { current: readonly Condition[] } {
    const box: { current: readonly Condition[] } = { current: [] }
    onConditionsChanged((conditions) => (box.current = conditions))
    return box
  }

  it('stacks toasts and auto-dissolves them after their lifetime', () => {
    const seen = trackToasts()
    toast('first')
    toast('second', { kind: 'error' })
    expect(seen.current.map((t) => t.message)).toEqual(['first', 'second'])
    vi.advanceTimersByTime(TOAST_DURATION_MS + 1)
    expect(seen.current).toEqual([])
  })

  it('keeps sticky toasts until explicitly dismissed', () => {
    const seen = trackToasts()
    const id = toast('import failed', { sticky: true, surface: 'import-error' })
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10)
    expect(seen.current.map((t) => t.message)).toEqual(['import failed'])
    dismissToast(id)
    expect(seen.current).toEqual([])
  })

  it('replaces a same-surface toast instead of stacking duplicates', () => {
    const seen = trackToasts()
    toast('old notice', { surface: 'board-notice' })
    toast('new notice', { surface: 'board-notice' })
    expect(seen.current.map((t) => t.message)).toEqual(['new notice'])
    // The replaced toast's timer must not dismiss the replacement early
    // or leave a dangling timer.
    vi.advanceTimersByTime(TOAST_DURATION_MS + 1)
    expect(seen.current).toEqual([])
  })

  it('raising two conditions yields one list with a count of 2', () => {
    const seen = trackConditions()
    condition('service').raise('Project service crashed — restarting…')
    condition('integrity').raise('Missing canonical original')
    expect(seen.current).toHaveLength(2)
    expect(seen.current.map((c) => c.id)).toEqual(['service', 'integrity'])
  })

  it('re-raising a condition updates its detail without duplicating', () => {
    const seen = trackConditions()
    condition('service').raise('restarting…')
    condition('service').raise('failed — restart the app')
    expect(seen.current).toEqual([{ id: 'service', detail: 'failed — restart the app' }])
  })

  it('clearing a condition removes its slot entirely', () => {
    const seen = trackConditions()
    condition('a').raise('A holds')
    condition('b').raise('B holds')
    condition('a').clear()
    expect(seen.current).toEqual([{ id: 'b', detail: 'B holds' }])
    condition('b').clear()
    expect(seen.current).toEqual([])
    // Clearing an absent condition is a no-op, not an error.
    condition('b').clear()
    expect(seen.current).toEqual([])
  })

  it('a condition outlives any toast — §11.4 no-silent-hang', () => {
    const seenToasts = trackToasts()
    const seenConditions = trackConditions()
    condition('service').raise('outage')
    toast('Project service crashed', { kind: 'error' })
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10)
    expect(seenToasts.current).toEqual([])
    expect(seenConditions.current).toHaveLength(1)
  })

  it('toasts §11.4 startup repairs once, naming the count', () => {
    const seen = trackToasts()
    reportRecoveryRepairs({ repairs: ['swept orphaned import temp x', 'removed orphan blob y'] })
    expect(seen.current.map((t) => t.message)).toEqual(['Recovered on open: 2 repairs'])
    expect(seen.current[0]?.kind).toBe('success')
    expect(seen.current[0]?.surface).toBe('recovery-repairs')
  })

  it('says nothing when the open was clean (no repairs)', () => {
    const seen = trackToasts()
    reportRecoveryRepairs({ repairs: [] })
    reportRecoveryRepairs(undefined)
    expect(seen.current).toEqual([])
  })

  it('subscription fires immediately with current state and unsubscribes', () => {
    condition('a').raise('A holds')
    let calls = 0
    const unsub = onConditionsChanged(() => calls++)
    expect(calls).toBe(1)
    unsub()
    condition('a').clear()
    expect(calls).toBe(1)
  })
})

describe('retention perch wiring (§9.1 rev 0.70)', () => {
  beforeEach(() => {
    __resetStatusForTests()
  })

  afterEach(() => {
    __resetStatusForTests()
    vi.unstubAllGlobals()
  })

  it('raises an actionable dismissible condition and clears on a clean open', async () => {
    let emit: (event: ServiceStatusEvent) => void = () => {}
    vi.stubGlobal('window', {
      addEventListener: () => {},
      ew: {
        project: {
          onServiceStatus: (cb: typeof emit) => {
            emit = cb
            return () => {}
          },
          serviceStatus: async () => null,
        },
      },
    })
    vi.stubGlobal('document', { documentElement: { addEventListener: () => {} } })
    const seen = { current: [] as readonly Condition[] }
    onConditionsChanged((conditions) => (seen.current = conditions))
    attachServiceStatus()

    emit({
      status: 'ok',
      retention: {
        retention: '60d',
        purged: [{ kind: 'note', id: 'n1' }],
        failed: [],
      },
    })
    expect(seen.current[0]).toMatchObject({
      id: 'trash-retention',
      detail: '1 item left trash after 60 days',
      dismissible: true,
      action: { label: 'Open Trash', testid: 'retention-open-trash' },
    })
    dismissCondition('trash-retention')
    expect(seen.current).toEqual([])

    emit({
      status: 'ok',
      retention: { retention: '60d', purged: [], failed: [] },
    })
    expect(seen.current).toEqual([])
  })
})

describe('snapshot push wiring (§11.4/§8.6, AI-IMP-122)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetStatusForTests()
  })

  afterEach(() => {
    __resetStatusForTests()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** Stub the preload bridge and return the captured emit hook — the
   * test drives push states exactly as main's broadcast would. The
   * catch-up pull is left undefined (optional in the wiring), so
   * every state transition here is explicit. */
  function attachPush(): (state: SnapshotPushState) => void {
    let emit: (state: SnapshotPushState) => void = () => {}
    // A DEFINED window defeats engagement's node guard, so the stub must
    // also satisfy the listener registrations wake()→attach() performs.
    vi.stubGlobal('window', {
      addEventListener: () => {},
      ew: {
        snapshot: {
          onPushState: (cb: (state: SnapshotPushState) => void): (() => void) => {
            emit = cb
            return () => {}
          },
        },
      },
    })
    vi.stubGlobal('document', { documentElement: { addEventListener: () => {} } })
    attachSnapshotPush()
    return (state) => emit(state)
  }

  function trackToasts(): { current: readonly ToastEntry[] } {
    const box: { current: readonly ToastEntry[] } = { current: [] }
    onToastsChanged((toasts) => (box.current = toasts))
    return box
  }

  function trackConditions(): { current: readonly Condition[] } {
    const box: { current: readonly Condition[] } = { current: [] }
    onConditionsChanged((conditions) => (box.current = conditions))
    return box
  }

  it('an in-flight push holds the perch and a reconciled push clears it', () => {
    const emit = attachPush()
    const conditions = trackConditions()
    emit({ phase: 'pushing', unpushed: 2 })
    expect(conditions.current).toHaveLength(1)
    expect(conditions.current[0]?.detail).toContain('2 snapshots')
    emit({ phase: 'idle', unpushed: 0 })
    expect(conditions.current).toEqual([])
  })

  it('failure toasts ONCE per episode; retries only update the perch debt', () => {
    const emit = attachPush()
    const toasts = trackToasts()
    const conditions = trackConditions()

    // First failure: one toast, debt on the perch.
    emit({ phase: 'error', unpushed: 1, message: 'could not read from remote' })
    expect(toasts.current.map((t) => t.surface)).toEqual(['snapshot-push'])
    expect(toasts.current[0]?.message).toContain('could not read from remote')
    expect(conditions.current[0]?.detail).toContain('1 snapshot not backed up')

    // The toast dissolves; a failing RETRY must not re-raise it, only
    // grow the visible debt (§8.6: no repeated nagging).
    vi.advanceTimersByTime(TOAST_DURATION_MS + 1)
    expect(toasts.current).toEqual([])
    emit({ phase: 'error', unpushed: 2, message: 'could not read from remote' })
    expect(toasts.current).toEqual([])
    expect(conditions.current[0]?.detail).toContain('2 snapshots not backed up')

    // Recovery reconciles: perch clears, and the episode ENDS — a later
    // failure is a new episode and earns a new toast.
    emit({ phase: 'idle', unpushed: 0 })
    expect(conditions.current).toEqual([])
    emit({ phase: 'error', unpushed: 1, message: 'connection reset' })
    expect(toasts.current.map((t) => t.message)).toEqual(['Backup push failed: connection reset'])
  })

  it('an idle state with residual debt keeps the perch rather than dropping it', () => {
    const emit = attachPush()
    const conditions = trackConditions()
    emit({ phase: 'idle', unpushed: 3 })
    expect(conditions.current).toHaveLength(1)
    expect(conditions.current[0]?.detail).toContain('3 snapshots not backed up yet')
  })
})
