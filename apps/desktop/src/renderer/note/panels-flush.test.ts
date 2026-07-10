import { afterEach, describe, expect, it, vi } from 'vitest'

describe('panel close flush boundary', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('retains the panel when its draft flush fails', async () => {
    const panels = await import('./panels')
    panels.openCornerPanel('node-1', 'note-1')
    const key = panels.panelRecords()[0]!.key
    panels.registerPanelFlush(key, () => Promise.reject(new Error('disk full')))

    panels.closePanel(key)
    await Promise.resolve()
    await Promise.resolve()

    expect(panels.panelRecords().map((record) => record.key)).toEqual([key])
  })

  it('removes the panel only after its draft flush succeeds', async () => {
    const panels = await import('./panels')
    panels.openCornerPanel('node-1', 'note-1')
    const key = panels.panelRecords()[0]!.key
    let resolveFlush!: () => void
    panels.registerPanelFlush(
      key,
      () =>
        new Promise<void>((resolve) => {
          resolveFlush = resolve
        }),
    )

    panels.closePanel(key)
    expect(panels.panelRecords()).toHaveLength(1)
    resolveFlush()
    await Promise.resolve()
    await Promise.resolve()

    expect(panels.panelRecords()).toHaveLength(0)
  })

  it('propagates a failed app-level flush', async () => {
    const panels = await import('./panels')
    panels.openCornerPanel('node-1', 'note-1')
    const key = panels.panelRecords()[0]!.key
    panels.registerPanelFlush(key, () => Promise.reject(new Error('disk full')))

    await expect(panels.flushAllPanels()).rejects.toThrow('disk full')
    expect(panels.panelRecords()).toHaveLength(1)
  })
})
