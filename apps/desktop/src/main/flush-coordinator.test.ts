import { describe, expect, it, vi } from 'vitest'
import { RendererFlushCoordinator } from './flush-coordinator'

function target(id: number) {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn((channel: 'app:flush', request: { requestId: string }) => {
      void channel
      void request
    }),
  }
}

describe('RendererFlushCoordinator', () => {
  it('accepts only the exact request ID from the expected renderer', async () => {
    const coordinator = new RendererFlushCoordinator(2_000, () => 'request-1')
    const renderer = target(7)
    const result = coordinator.flush(renderer)

    expect(renderer.send).toHaveBeenCalledWith('app:flush', { requestId: 'request-1' })
    expect(coordinator.acknowledge(8, { requestId: 'request-1', ok: true })).toBe(false)
    expect(coordinator.acknowledge(7, { requestId: 'other', ok: true })).toBe(false)
    expect(coordinator.acknowledge(7, { requestId: 'request-1', ok: true })).toBe(true)
    await expect(result).resolves.toBe('ok')
  })

  it('carries an explicit renderer flush failure', async () => {
    const coordinator = new RendererFlushCoordinator(2_000, () => 'request-1')
    const renderer = target(7)
    const result = coordinator.flush(renderer)

    coordinator.acknowledge(7, { requestId: 'request-1', ok: false })

    await expect(result).resolves.toBe('failed')
  })

  it('serializes requests to one renderer and gives each a distinct ID', async () => {
    const ids = ['request-1', 'request-2'][Symbol.iterator]()
    const coordinator = new RendererFlushCoordinator(2_000, () => ids.next().value!)
    const renderer = target(7)
    const first = coordinator.flush(renderer)
    const second = coordinator.flush(renderer)
    expect(renderer.send).toHaveBeenCalledTimes(1)

    coordinator.acknowledge(7, { requestId: 'request-1', ok: true })
    await expect(first).resolves.toBe('ok')
    await Promise.resolve()
    expect(renderer.send).toHaveBeenLastCalledWith('app:flush', { requestId: 'request-2' })

    coordinator.acknowledge(7, { requestId: 'request-2', ok: true })
    await expect(second).resolves.toBe('ok')
  })

  it('times out without accepting a late acknowledgement', async () => {
    vi.useFakeTimers()
    try {
      const coordinator = new RendererFlushCoordinator(20, () => 'request-1')
      const renderer = target(7)
      const result = coordinator.flush(renderer)
      await vi.advanceTimersByTimeAsync(20)

      await expect(result).resolves.toBe('timeout')
      expect(coordinator.acknowledge(7, { requestId: 'request-1', ok: true })).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
