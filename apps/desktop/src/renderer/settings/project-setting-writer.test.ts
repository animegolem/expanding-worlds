import { describe, expect, it, vi } from 'vitest'
import {
  ProjectSettingWriter,
  type ProjectSettingWriteResult,
} from './project-setting-writer'

function harness(initial: Record<string, unknown> = {}) {
  let settings = initial
  const persist = vi.fn(
    async (key: string, value: unknown): Promise<ProjectSettingWriteResult> => {
      void key
      void value
      return { ok: true }
    },
  )
  const report = vi.fn()
  const writer = new ProjectSettingWriter({
    current: () => settings,
    replace: (next) => {
      settings = next
    },
    persist,
    report,
  })
  return { writer, settings: () => settings, persist, report }
}

describe('ProjectSettingWriter', () => {
  it('keeps an optimistic value only after durable success', async () => {
    const h = harness({ snapshot_mode: 'off' })
    await expect(h.writer.write('snapshot_mode', 'commit', 'backup mode')).resolves.toBe(true)
    expect(h.settings()).toEqual({ snapshot_mode: 'commit' })
    expect(h.report).not.toHaveBeenCalled()
  })

  it('rolls back and reports a typed refusal', async () => {
    const h = harness({ snapshot_mode: 'off' })
    h.persist.mockResolvedValueOnce({ ok: false, message: 'disk full' })

    await expect(h.writer.write('snapshot_mode', 'commit', 'backup mode')).resolves.toBe(false)

    expect(h.settings()).toEqual({ snapshot_mode: 'off' })
    expect(h.report).toHaveBeenCalledWith("Couldn't save backup mode: disk full")
  })

  it('rolls back a thrown transport failure and removes a newly introduced key', async () => {
    const h = harness()
    h.persist.mockRejectedValueOnce(new Error('utility died'))

    await expect(h.writer.write('snapshot_remote', 'ssh://repo', 'backup remote')).resolves.toBe(
      false,
    )

    expect(h.settings()).toEqual({})
  })

  it('does not let an older failure roll back a newer write to the same key', async () => {
    const h = harness({ snapshot_mode: 'off' })
    let failOld!: (result: { ok: false; message: string }) => void
    h.persist
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          failOld = resolve
        }),
      )
      .mockResolvedValueOnce({ ok: true })

    const old = h.writer.write('snapshot_mode', 'commit', 'backup mode')
    const latest = h.writer.write('snapshot_mode', 'commit-push', 'backup mode')
    await latest
    failOld({ ok: false, message: 'late refusal' })
    await old

    expect(h.settings()).toEqual({ snapshot_mode: 'commit-push' })
  })
})
