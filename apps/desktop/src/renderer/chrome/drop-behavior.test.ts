import { DROP_BEHAVIOR_KEY } from '@ew/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetDropBehaviorForTests,
  answerDropBehavior,
  dismissDropAsk,
  onDropAskChanged,
  requestDropBehavior,
  type DropAskState,
  type DropChoice,
  type DropSource,
} from './drop-behavior'
import { __resetStatusForTests, onToastsChanged, type ToastEntry } from './status'

/**
 * AI-IMP-178: overlapping multi-drops must QUEUE, not clobber. The old
 * single `parked` slot let a second multi-drop overwrite the first's
 * import closure, silently discarding batch 1. These tests pin the
 * queue semantics: every batch's closure runs exactly once, answers
 * bind to the head, and the next parked ask presents in turn.
 */

/** The stored project `drop_behavior`; `undefined` → the modal asks. */
let storedBehavior: unknown
let setProject: ReturnType<typeof vi.fn>

beforeEach(() => {
  storedBehavior = undefined
  setProject = vi.fn()
  vi.stubGlobal('window', {
    ew: {
      project: {
        query: vi.fn(async (name: string) =>
          name === 'getSettings'
            ? { ok: true, result: { [DROP_BEHAVIOR_KEY]: storedBehavior } }
            : { ok: false },
        ),
      },
      settings: { setProject },
    },
    // Engagement attaches harmlessly; nothing dispatches these in node.
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
  vi.stubGlobal('document', { documentElement: { addEventListener: vi.fn() } })
  __resetDropBehaviorForTests()
  __resetStatusForTests()
})

afterEach(() => {
  __resetDropBehaviorForTests()
  __resetStatusForTests()
  vi.unstubAllGlobals()
})

/** Track the visible ask and a full history of its transitions. */
function trackAsk(): { current: DropAskState | null; history: (DropAskState | null)[] } {
  const box: { current: DropAskState | null; history: (DropAskState | null)[] } = {
    current: null,
    history: [],
  }
  onDropAskChanged((ask) => {
    box.current = ask
    box.history.push(ask)
  })
  return box
}

/** A parked drop whose closure records the choice it was run with. */
function makeReq(count: number, source: DropSource = 'drop') {
  const runs: DropChoice[] = []
  const req = {
    anchor: { x: count * 10, y: count * 20 },
    count,
    source,
    run: (choice: DropChoice) => runs.push(choice),
  }
  return { req, runs }
}

describe('drop-behavior queue (AI-IMP-178)', () => {
  function trackToasts(): { current: readonly ToastEntry[] } {
    const box: { current: readonly ToastEntry[] } = { current: [] }
    onToastsChanged((toasts) => (box.current = toasts))
    return box
  }
  it('a concrete stored behavior runs immediately and never asks', async () => {
    storedBehavior = 'group-and-sort'
    const ask = trackAsk()
    const { req, runs } = makeReq(3)
    await requestDropBehavior(req)
    expect(runs).toEqual(['group-and-sort'])
    expect(ask.current).toBeNull()
  })

  it('two overlapping multi-drops queue; each answer binds to its own batch', async () => {
    const ask = trackAsk()
    const a = makeReq(2)
    const b = makeReq(5)

    // Batch A drops and shows its ask.
    await requestDropBehavior(a.req)
    expect(ask.current).toMatchObject({ count: 2 })

    // Batch B drops BEFORE A is answered — it must wait, not clobber A.
    await requestDropBehavior(b.req)
    expect(ask.current).toMatchObject({ count: 2 }) // still A's ask
    expect(a.runs).toEqual([]) // nothing discarded, nothing run yet
    expect(b.runs).toEqual([])

    // Answer A → A's closure runs with its choice; B's ask now presents.
    answerDropBehavior('sort', false)
    expect(a.runs).toEqual(['sort'])
    expect(b.runs).toEqual([])
    expect(ask.current).toMatchObject({ count: 5 })

    // Answer B → B's closure runs; the ask clears.
    answerDropBehavior('group-and-sort', false)
    expect(b.runs).toEqual(['group-and-sort'])
    expect(ask.current).toBeNull()
  })

  it('three overlapping drops drain in FIFO order, none discarded', async () => {
    const ask = trackAsk()
    const a = makeReq(2)
    const b = makeReq(3)
    const c = makeReq(4)
    await requestDropBehavior(a.req)
    await requestDropBehavior(b.req)
    await requestDropBehavior(c.req)

    expect(ask.current).toMatchObject({ count: 2 })
    answerDropBehavior('group', false)
    expect(ask.current).toMatchObject({ count: 3 })
    answerDropBehavior('sort', false)
    expect(ask.current).toMatchObject({ count: 4 })
    answerDropBehavior('separate', false)

    expect(a.runs).toEqual(['group'])
    expect(b.runs).toEqual(['sort'])
    expect(c.runs).toEqual(['separate'])
    expect(ask.current).toBeNull()
  })

  it('remember persists the head choice for future drops; queued asks still present', async () => {
    const ask = trackAsk()
    const a = makeReq(2)
    const b = makeReq(2)
    await requestDropBehavior(a.req)
    await requestDropBehavior(b.req)

    // Answer A with remember → persisted; B is NOT auto-applied, it asks.
    answerDropBehavior('group-and-sort', true)
    expect(setProject).toHaveBeenCalledWith(DROP_BEHAVIOR_KEY, 'group-and-sort')
    expect(a.runs).toEqual(['group-and-sort'])
    expect(ask.current).toMatchObject({ count: 2 }) // B's ask still up
    expect(b.runs).toEqual([])

    answerDropBehavior('sort', false)
    expect(b.runs).toEqual(['sort'])
  })

  it('remember is ignored for separate (it has no stored value)', async () => {
    const { req, runs } = makeReq(2)
    await requestDropBehavior(req)
    answerDropBehavior('separate', true)
    expect(setProject).not.toHaveBeenCalled()
    expect(runs).toEqual(['separate'])
  })

  it('dismiss keeps the head separate, then presents the next parked ask', async () => {
    const toasts = trackToasts()
    const ask = trackAsk()
    const a = makeReq(2)
    const b = makeReq(3)
    await requestDropBehavior(a.req)
    await requestDropBehavior(b.req)

    dismissDropAsk()
    expect(a.runs).toEqual(['separate'])
    expect(toasts.current.at(-1)?.message).toBe('2 images landed separate')
    expect(ask.current).toMatchObject({ count: 3 }) // B presents
    expect(b.runs).toEqual([])

    dismissDropAsk()
    expect(b.runs).toEqual(['separate'])
    expect(ask.current).toBeNull()
  })

  it('an explicit separate choice stays silent', async () => {
    const toasts = trackToasts()
    const { req } = makeReq(3)
    await requestDropBehavior(req)
    answerDropBehavior('separate', false)
    expect(toasts.current).toEqual([])
  })

  it('answering with no ask showing is a no-op', () => {
    const { req, runs } = makeReq(2)
    void req
    answerDropBehavior('group', false)
    dismissDropAsk()
    expect(runs).toEqual([])
    expect(setProject).not.toHaveBeenCalled()
  })
})
