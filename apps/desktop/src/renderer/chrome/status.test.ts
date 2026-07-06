import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION_MS } from './feel'
import {
  __resetStatusForTests,
  condition,
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
