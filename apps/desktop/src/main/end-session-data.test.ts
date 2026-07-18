import { describe, expect, it, vi } from 'vitest'
import { runSnapshotBeforeGc } from './end-session-data'

describe('snapshot-before-GC fail-stop (AI-IMP-224)', () => {
  it('does not invoke the destructive sweep after a typed snapshot failure', async () => {
    const runGcSweep = vi.fn()
    const failure = {
      ok: false,
      trigger: 'end-session',
      message: 'snapshot deferred: database is busy',
    } as const

    await expect(
      runSnapshotBeforeGc(
        {
          runSnapshot: async () => failure,
          runGcSweep,
          nowMs: () => 1_000,
        },
        16_000,
      ),
    ).resolves.toEqual(failure)
    expect(runGcSweep).not.toHaveBeenCalled()
  })

  it('passes the shared deadline to GC only after snapshot success', async () => {
    const runGcSweep = vi.fn(async () => ({ ok: true }))
    await expect(
      runSnapshotBeforeGc(
        {
          runSnapshot: async () => ({ ok: true }),
          runGcSweep,
          nowMs: () => 1_000,
        },
        16_000,
        '2026-01-01T00:00:00.000Z',
      ),
    ).resolves.toEqual({ ok: true })
    expect(runGcSweep).toHaveBeenCalledWith({
      type: 'gc-sweep',
      deadlineAtMs: 16_000,
      nowIso: '2026-01-01T00:00:00.000Z',
    })
  })
})
