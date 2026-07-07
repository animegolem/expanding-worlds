import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasHostHandle } from '../canvas/host'

/**
 * AI-IMP-123: `attachPanels` creates the note project port
 * asynchronously; its `dispose` (the project-changed subscription)
 * must be retained and unsubscribed at panel-system teardown — the
 * original code discarded it, leaking the listener past detach. These
 * tests drive both settle orders: the port arriving before detach, and
 * the detach-wins race where the port lands after teardown.
 */

const dispose = vi.fn()
// The mocked port's promise, resolved by hand so each test controls
// whether attachPanels detaches before or after it settles.
let resolvePort: (value: { port: unknown; dispose: () => void }) => void

vi.mock('./project-port', () => ({
  createNoteProjectPort: vi.fn(
    () =>
      new Promise<{ port: unknown; dispose: () => void }>((resolve) => {
        resolvePort = resolve
      }),
  ),
}))

function stubWindow(): void {
  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    ew: { app: { onFlushRequest: () => () => {} } },
  }
  ;(globalThis as unknown as { window: unknown }).window = win
}

function fakeHandle(): CanvasHostHandle {
  return {
    controller: {
      selection: { onChanged: () => () => {} },
      items: () => [],
    },
  } as unknown as CanvasHostHandle
}

function settlePort(): { port: unknown; dispose: () => void } {
  const value = { port: { execute: vi.fn(), query: vi.fn() }, dispose }
  resolvePort(value)
  return value
}

describe('attachPanels port disposer (AI-IMP-123)', () => {
  beforeEach(() => {
    dispose.mockClear()
    stubWindow()
  })
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
    vi.resetModules()
  })

  it('unsubscribes the project-changed listener at teardown', async () => {
    const { attachPanels } = await import('./panels')
    const detach = attachPanels(fakeHandle())
    settlePort()
    await Promise.resolve() // let the port promise's .then assign the disposer
    expect(dispose).not.toHaveBeenCalled()
    detach()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes a port that resolves AFTER detach (no leak on the race)', async () => {
    const { attachPanels } = await import('./panels')
    const detach = attachPanels(fakeHandle())
    detach() // teardown before the async port arrives
    settlePort()
    await Promise.resolve()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
