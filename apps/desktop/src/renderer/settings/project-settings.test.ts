import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SetSettingResponse } from '@ew/protocol'
import { __resetStatusForTests, onToastsChanged, type ToastEntry } from '../chrome/status'
import {
  createProjectSettingWriter,
  runAfterProjectSettingSaved,
  type ProjectSettingPersist,
} from './project-settings'

function state(initial: Record<string, unknown>) {
  const values = { ...initial }
  return {
    values,
    port: {
      read: (key: string) => values[key],
      apply: (key: string, value: unknown) => {
        if (value === undefined) delete values[key]
        else values[key] = value
      },
    },
  }
}

function trackToasts(): { current: readonly ToastEntry[] } {
  const box: { current: readonly ToastEntry[] } = { current: [] }
  onToastsChanged((toasts) => (box.current = toasts))
  return box
}

beforeEach(() => __resetStatusForTests())
afterEach(() => {
  __resetStatusForTests()
  vi.restoreAllMocks()
})

describe('result-aware project settings (AI-IMP-251)', () => {
  it.each([
    {
      name: 'no project',
      persist: async (): Promise<SetSettingResponse> => ({
        type: 'set-setting',
        ok: false,
        code: 'NO_PROJECT',
        message: 'no project is open',
      }),
    },
    {
      name: 'read-only project',
      persist: async (): Promise<SetSettingResponse> => ({
        type: 'set-setting',
        ok: false,
        code: 'SET_SETTING_FAILED',
        message: 'this project is open read-only',
      }),
    },
    {
      name: 'transport/write rejection',
      persist: async (): Promise<SetSettingResponse> => {
        throw new Error('forced write failure')
      },
    },
  ])('rolls back and surfaces $name failures', async ({ persist }) => {
    const model = state({ snapshot_mode: 'off' })
    const toasts = trackToasts()
    const writer = createProjectSettingWriter(model.port, persist)

    const saving = writer.write('snapshot_mode', 'commit')
    expect(model.values['snapshot_mode']).toBe('commit')
    await expect(saving).resolves.toBe(false)
    expect(model.values['snapshot_mode']).toBe('off')
    expect(toasts.current).toHaveLength(1)
    expect(toasts.current[0]?.kind).toBe('error')
  })

  it('keeps a successful optimistic write', async () => {
    const model = state({ snapshot_mode: 'off' })
    const writer = createProjectSettingWriter(model.port, async () => ({
      type: 'set-setting',
      ok: true,
    }))
    await expect(writer.write('snapshot_mode', 'commit')).resolves.toBe(true)
    expect(model.values['snapshot_mode']).toBe('commit')
  })

  it('shares an identical in-flight write so remote testing can await the blur-save', async () => {
    let resolve: (result: SetSettingResponse) => void = () => {}
    const persist = vi.fn<ProjectSettingPersist>(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const model = state({ snapshot_remote: '' })
    const writer = createProjectSettingWriter(model.port, persist)

    const blurSave = writer.write('snapshot_remote', 'ssh://backup')
    const testSave = writer.write('snapshot_remote', 'ssh://backup')
    await Promise.resolve()
    expect(persist).toHaveBeenCalledTimes(1)

    let settled = false
    void testSave.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    resolve({ type: 'set-setting', ok: true })
    await expect(Promise.all([blurSave, testSave])).resolves.toEqual([true, true])
  })

  it('never runs a remote probe after its setting save fails', async () => {
    const probe = vi.fn(async () => ({ ok: true as const }))
    await expect(runAfterProjectSettingSaved(async () => false, probe)).resolves.toBeNull()
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('SettingsView adoption guard', () => {
  it('has no direct unchecked project-setting write', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../views/SettingsView.svelte', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/window\.ew\.settings\.setProject\s*\(/)
    expect(source).toContain('createProjectSettingWriter')
    expect(source).not.toContain('deferredRow')
    expect(source).not.toContain('menuPlacement')
    expect(source).not.toMatch(/<button\b/)
    expect(source).toContain('<SettingsSection')
    expect(source).toContain('<Segmented')
    expect(source).toContain('<SwatchRow')
    expect(source).toContain('<Toggle')
  })
})
