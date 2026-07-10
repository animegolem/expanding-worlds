// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AI-IMP-255: the OS-owned title band (mac hidden titlebar / Windows
 * titleBarOverlay) delivers no pointer events and synthesizes a document
 * pointerleave on entry. These tests pin the band-aware leave branch:
 * an in-band "leave" keeps chrome engaged and fires the strip's reveal
 * signal; an out-of-band leave and window blur still fade. The OS layer
 * itself is untestable from here (synthetic events skip it) — the
 * packaged-build behavior is owner-validated per HUMAN-TESTING.md.
 *
 * engagement.ts is a module-level singleton, so each test imports a
 * fresh copy via resetModules.
 */

async function freshEngagement() {
  vi.resetModules()
  return import('./engagement')
}

function pointerLeaveAt(clientY: number): void {
  document.documentElement.dispatchEvent(
    new MouseEvent('pointerleave', { clientY }),
  )
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('engagement title-band leave (AI-IMP-255)', () => {
  it('a pointerleave inside the band keeps chrome engaged and signals reveal', async () => {
    const eng = await freshEngagement()
    let bandEntered = 0
    eng.onTitleBandEnter(() => bandEntered++)
    expect(eng.isEngaged()).toBe(true)

    pointerLeaveAt(20) // inside TITLE_STRIP_REVEAL_PX
    expect(eng.isEngaged()).toBe(true)
    expect(bandEntered).toBe(1)
  })

  it('a pointerleave below the band fades chrome', async () => {
    const eng = await freshEngagement()
    let bandEntered = 0
    eng.onTitleBandEnter(() => bandEntered++)

    pointerLeaveAt(400) // a genuine exit through a side/bottom edge
    expect(eng.isEngaged()).toBe(false)
    expect(bandEntered).toBe(0)
  })

  it('window blur fades unconditionally, even after a band entry', async () => {
    const eng = await freshEngagement()
    eng.onTitleBandEnter(() => {})

    pointerLeaveAt(20)
    expect(eng.isEngaged()).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(eng.isEngaged()).toBe(false)
  })

  it('a held engagement (takeover) is not affected by any leave', async () => {
    const eng = await freshEngagement()
    eng.holdEngagement(true)

    pointerLeaveAt(400)
    expect(eng.isEngaged()).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(eng.isEngaged()).toBe(true)
    eng.holdEngagement(false)
  })
})
