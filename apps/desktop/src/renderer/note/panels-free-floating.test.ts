import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AI-IMP-258: the store's `screen` contract — documented since
 * AI-IMP-064 as "Screen-fixed position once pinned (or for anchorless
 * panels)" — is now load-bearing for UNPINNED records too: NotePanel's
 * anchorless fallback honors record.screen, and the header drags
 * free-floating panels without pinning. These pin the store half:
 * movePanel persists a screen position on an unpinned record and
 * never flips its pinned state.
 */

function stubWindow(): void {
  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    ew: { app: { onFlushRequest: () => () => {} } },
  }
  ;(globalThis as unknown as { window: unknown }).window = win
}

describe('free-floating screen contract (AI-IMP-258)', () => {
  beforeEach(() => {
    vi.resetModules()
    stubWindow()
  })

  it('movePanel persists screen on an UNPINNED record without pinning it', async () => {
    const panels = await import('./panels')
    // openPhantomPanel exercises setTethered without project queries.
    panels.openPhantomPanel('loose draft')
    const record = panels.panelRecords()[0]!
    expect(record.pinned).toBe(false)
    expect(record.screen).toBeNull()

    panels.movePanel(record.key, { x: 240, y: 180 })
    const moved = panels.panelRecords()[0]!
    expect(moved.pinned).toBe(false)
    expect(moved.screen).toEqual({ x: 240, y: 180 })
  })

  it('a later pin keeps the dragged screen position', async () => {
    const panels = await import('./panels')
    panels.openPhantomPanel('loose draft')
    const record = panels.panelRecords()[0]!
    panels.movePanel(record.key, { x: 240, y: 180 })
    panels.pinPanel(record.key, { x: 240, y: 180 })
    const pinned = panels.panelRecords()[0]!
    expect(pinned.pinned).toBe(true)
    expect(pinned.screen).toEqual({ x: 240, y: 180 })
  })
})
