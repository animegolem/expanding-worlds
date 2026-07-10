import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireSourceSlot,
  releaseSourceSlot,
  sourceSlotHolder,
} from './source-slot'

/**
 * CA-013 / CA-014 (AI-IMP-236): the source-slot registry owns the ONE
 * `ew.secondary.open/close('source')` transport. These tests pin the
 * two open→close interleavings the audit found: a release landing
 * during the very first (holder-less) acquire, and a superseded open
 * that must close the handle it just opened WITHOUT stomping a newer
 * owner that replace-on-open already handed the transport to.
 */

type Deferred = {
  resolve: (value: { ok: true } | { ok: false; message: string }) => void
}

/** A controllable `window.ew.secondary`: every open returns a promise
 * the test resolves by hand, so opens can be interleaved deterministically.
 * Close calls are recorded for leak assertions. */
function installSecondaryMock(): {
  opens: Array<{ dir: string; deferred: Deferred }>
  closeCount: () => number
} {
  const opens: Array<{ dir: string; deferred: Deferred }> = []
  let closes = 0
  vi.stubGlobal('window', {
    ew: {
      secondary: {
        open: vi.fn((_target: string, dir: string) => {
          let resolve!: Deferred['resolve']
          const promise = new Promise<{ ok: true } | { ok: false; message: string }>((r) => {
            resolve = r
          })
          opens.push({ dir, deferred: { resolve } })
          return promise
        }),
        close: vi.fn(() => {
          closes += 1
          return Promise.resolve({ ok: true })
        }),
      },
    },
  })
  return { opens, closeCount: () => closes }
}

/** Flush the microtask queue so awaited continuations run. */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('source slot', () => {
  let mock: ReturnType<typeof installSecondaryMock>

  beforeEach(() => {
    mock = installSecondaryMock()
  })

  afterEach(() => {
    // Leave the module with no holder so tests do not bleed state.
    releaseSourceSlot('gallery')
    releaseSourceSlot('panel')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('installs a holder on a plain acquire and closes once on release', async () => {
    const acquired = acquireSourceSlot('gallery', '/lib')
    expect(mock.opens).toHaveLength(1)
    mock.opens[0]!.deferred.resolve({ ok: true })
    expect(await acquired).toEqual({ ok: true })
    expect(sourceSlotHolder()).toEqual({ ownerId: 'gallery', dir: '/lib' })

    releaseSourceSlot('gallery')
    expect(sourceSlotHolder()).toBeNull()
    expect(mock.closeCount()).toBe(1)
  })

  it('CA-013: a release during the pending first acquire closes the late open and installs no holder', async () => {
    const acquired = acquireSourceSlot('gallery', '/lib')
    expect(mock.opens).toHaveLength(1)

    // Release BEFORE the open resolves — holder is still null.
    releaseSourceSlot('gallery')
    // Nothing to close yet (the open has not landed).
    expect(mock.closeCount()).toBe(0)

    // The open now lands, superseded by the release.
    mock.opens[0]!.deferred.resolve({ ok: true })
    const result = await acquired
    await flush()

    expect(result.ok).toBe(false)
    // The late, superseded open must NOT become the holder …
    expect(sourceSlotHolder()).toBeNull()
    // … and its leaked handle must be closed.
    expect(mock.closeCount()).toBe(1)
  })

  it('a superseded FAILED first-acquire open closes nothing', async () => {
    const acquired = acquireSourceSlot('gallery', '/lib')
    releaseSourceSlot('gallery')
    mock.opens[0]!.deferred.resolve({ ok: false, message: 'nope' })
    expect((await acquired).ok).toBe(false)
    await flush()
    // Nothing opened, so there is nothing to close.
    expect(mock.closeCount()).toBe(0)
    expect(sourceSlotHolder()).toBeNull()
  })

  it('a newer acquire supersedes an older pending open, which does NOT close (replace-on-open owns it)', async () => {
    const first = acquireSourceSlot('gallery', '/lib-a')
    const second = acquireSourceSlot('panel', '/lib-b')
    expect(mock.opens).toHaveLength(2)

    // The OLDER open resolves last-ish; a newer acquire exists, so
    // replace-on-open already handed the transport to the newer owner —
    // the older open must not close it.
    mock.opens[0]!.deferred.resolve({ ok: true })
    expect((await first).ok).toBe(false)
    await flush()
    expect(mock.closeCount()).toBe(0)

    // The newer open lands and becomes the holder.
    mock.opens[1]!.deferred.resolve({ ok: true })
    expect((await second).ok).toBe(true)
    expect(sourceSlotHolder()).toEqual({ ownerId: 'panel', dir: '/lib-b' })
    expect(mock.closeCount()).toBe(0)
  })

  it('evicts a different resolved holder and notifies it before the replacing open', async () => {
    const onEvicted = vi.fn()
    const first = acquireSourceSlot('gallery', '/lib-a', onEvicted)
    mock.opens[0]!.deferred.resolve({ ok: true })
    expect((await first).ok).toBe(true)

    const second = acquireSourceSlot('panel', '/lib-b')
    // The eviction callback fires synchronously, before the replacing
    // open resolves.
    expect(onEvicted).toHaveBeenCalledTimes(1)
    mock.opens[1]!.deferred.resolve({ ok: true })
    expect((await second).ok).toBe(true)
    expect(sourceSlotHolder()).toEqual({ ownerId: 'panel', dir: '/lib-b' })

    // The evicted owner releasing is a no-op — never a stomp close.
    releaseSourceSlot('gallery')
    expect(sourceSlotHolder()).toEqual({ ownerId: 'panel', dir: '/lib-b' })
    expect(mock.closeCount()).toBe(0)
  })

  it('a release then a fresh acquire under the same owner keeps the new transport open', async () => {
    const first = acquireSourceSlot('gallery', '/lib-a')
    releaseSourceSlot('gallery') // kill the pending intent
    const second = acquireSourceSlot('gallery', '/lib-b')

    // The first (superseded, because a newer acquire followed) resolves:
    // it must NOT close — the second acquire owns the transport now.
    mock.opens[0]!.deferred.resolve({ ok: true })
    expect((await first).ok).toBe(false)
    await flush()
    expect(mock.closeCount()).toBe(0)

    mock.opens[1]!.deferred.resolve({ ok: true })
    expect((await second).ok).toBe(true)
    expect(sourceSlotHolder()).toEqual({ ownerId: 'gallery', dir: '/lib-b' })
    expect(mock.closeCount()).toBe(0)
  })
})
