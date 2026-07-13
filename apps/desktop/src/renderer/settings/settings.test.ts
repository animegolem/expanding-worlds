import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetStatusForTests,
  onConditionsChanged,
  onToastsChanged,
  type Condition,
  type ToastEntry,
} from '../chrome/status'
import { __resetSettingsForTests, appSettings, initSettings, setAppSetting } from './settings'

// CA-015 (AI-IMP-237): the renderer's optimistic app-setting apply
// used to discard the persistence promise entirely, so a failed
// write neither rolled back the UI nor said anything. These specs
// cover the fix: a failed `settings:set` reverts the optimistic value
// and toasts, and a main-flagged corrupt-file recovery on boot
// surfaces as a loud toast instead of a silent defaults reset.

interface EwSettingsStub {
  appAll: () => Promise<Record<string, unknown>>
  setApp: (key: string, value: unknown) => Promise<{ ok: boolean; message?: string }>
  onAppChanged: (cb: (change: { key: string; value: unknown }) => void) => () => void
}

function stubWindow(settings: EwSettingsStub): void {
  vi.stubGlobal('window', {
    addEventListener: () => {},
    removeEventListener: () => {},
    ew: {
      settings,
      window: {
        setVibrancy: () => Promise.resolve(false),
        setOpacity: () => Promise.resolve(true),
      },
    },
  })
  vi.stubGlobal('document', {
    documentElement: {
      dataset: {} as Record<string, string>,
      addEventListener: () => {},
      dispatchEvent: () => true,
    },
  })
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

beforeEach(() => {
  __resetSettingsForTests()
  __resetStatusForTests()
})

afterEach(() => {
  __resetSettingsForTests()
  __resetStatusForTests()
  vi.unstubAllGlobals()
})

describe('setAppSetting — CA-015 failed-persist revert', () => {
  it('keeps the optimistic value when the persist succeeds', async () => {
    stubWindow({
      appAll: () => Promise.resolve({}),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })
    await initSettings()

    setAppSetting('charmCorner', 'upper-right')
    expect(appSettings().charmCorner).toBe('upper-right')
    // Let the resolved setApp promise's .then run.
    await Promise.resolve()
    await Promise.resolve()
    expect(appSettings().charmCorner).toBe('upper-right')
  })

  it('reverts the optimistic value and toasts when the persist fails', async () => {
    stubWindow({
      appAll: () => Promise.resolve({}),
      setApp: () => Promise.resolve({ ok: false, message: 'disk full' }),
      onAppChanged: () => () => {},
    })
    await initSettings()
    const toasts = trackToasts()

    setAppSetting('charmCorner', 'upper-right')
    // Optimistic apply is instant.
    expect(appSettings().charmCorner).toBe('upper-right')

    // Flush the rejected-result microtask chain.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(appSettings().charmCorner).toBe('lower-right')
    expect(toasts.current.some((t) => t.message.includes('disk full'))).toBe(true)
  })

  it('does not revert if a later set already superseded the failed one', async () => {
    let resolveFirst: (result: { ok: boolean; message?: string }) => void = () => {}
    stubWindow({
      appAll: () => Promise.resolve({}),
      setApp: (key: string, value: unknown) => {
        if (value === 'upper-right') {
          return new Promise((resolve) => {
            resolveFirst = resolve
          })
        }
        return Promise.resolve({ ok: true })
      },
      onAppChanged: () => () => {},
    })
    await initSettings()

    setAppSetting('charmCorner', 'upper-right') // will fail, but resolves late
    setAppSetting('charmCorner', 'lower-right') // succeeds first, supersedes

    resolveFirst({ ok: false, message: 'stale failure' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // The later, successful set must win — a late failure for a
    // stale value must not clobber it.
    expect(appSettings().charmCorner).toBe('lower-right')
  })
})

describe('initSettings — CA-015 corrupt-file recovery toast', () => {
  it('says nothing on an ordinary load', async () => {
    stubWindow({
      appAll: () => Promise.resolve({ theme: 'dark' }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })
    const toasts = trackToasts()
    await initSettings()
    expect(toasts.current).toEqual([])
  })

  it('toasts loudly when main reports a corrupt-file recovery', async () => {
    stubWindow({
      appAll: () => Promise.resolve({ recovered: true }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })
    const toasts = trackToasts()
    await initSettings()
    expect(toasts.current).toHaveLength(1)
    expect(toasts.current[0]?.message).toMatch(/reset to defaults/i)
    expect(toasts.current[0]?.kind).toBe('error')
  })

  it('consumes an incomplete-quit fact into a dismissible perch', async () => {
    const setApp = vi.fn(() => Promise.resolve({ ok: true }))
    stubWindow({
      appAll: () => Promise.resolve({ lastQuitBackupIncomplete: true }),
      setApp,
      onAppChanged: () => () => {},
    })
    const conditions = trackConditions()
    await initSettings()
    expect(conditions.current).toMatchObject([
      {
        id: 'last-quit-backup',
        detail: 'last session closed before its backup finished.',
        dismissible: true,
      },
    ])
    expect(setApp).toHaveBeenCalledWith('lastQuitBackupIncomplete', false)
  })
})

describe('caption promotion routing', () => {
  it('defaults to asking every time', async () => {
    stubWindow({
      appAll: () => Promise.resolve({}),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })

    await initSettings()

    expect(appSettings().captionPromotionRouting).toBe('ask')
  })

  it.each(['ask', 'title', 'body'] as const)('accepts the persisted %s routing', async (routing) => {
    stubWindow({
      appAll: () => Promise.resolve({ captionPromotionRouting: routing }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })

    await initSettings()

    expect(appSettings().captionPromotionRouting).toBe(routing)
  })

  it('rejects an unknown persisted routing', async () => {
    stubWindow({
      appAll: () => Promise.resolve({ captionPromotionRouting: 'append' }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })

    await initSettings()

    expect(appSettings().captionPromotionRouting).toBe('ask')
  })
})

describe('density', () => {
  it.each(['compact', 'comfortable'] as const)('accepts and applies persisted %s density', async (density) => {
    stubWindow({
      appAll: () => Promise.resolve({ density }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })

    await initSettings()

    expect(appSettings().density).toBe(density)
    expect(document.documentElement.dataset['density']).toBe(density)
  })

  it('falls back from unknown density and applies changes live', async () => {
    stubWindow({
      appAll: () => Promise.resolve({ density: 'auto', menuPlacement: 'system' }),
      setApp: () => Promise.resolve({ ok: true }),
      onAppChanged: () => () => {},
    })

    await initSettings()
    expect(appSettings().density).toBe('compact')
    expect(document.documentElement.dataset['density']).toBe('compact')

    setAppSetting('density', 'comfortable')
    expect(document.documentElement.dataset['density']).toBe('comfortable')
    expect('menuPlacement' in appSettings()).toBe(false)
  })

  it('restores the density token when persistence fails', async () => {
    stubWindow({
      appAll: () => Promise.resolve({ density: 'compact' }),
      setApp: () => Promise.resolve({ ok: false, message: 'read only' }),
      onAppChanged: () => () => {},
    })
    await initSettings()

    setAppSetting('density', 'comfortable')
    expect(document.documentElement.dataset['density']).toBe('comfortable')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(appSettings().density).toBe('compact')
    expect(document.documentElement.dataset['density']).toBe('compact')
  })
})
