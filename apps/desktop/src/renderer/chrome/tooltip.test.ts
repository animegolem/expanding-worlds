// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tooltip } from './tooltip'
import { TOOLTIP_DELAY_MS } from './feel'

// The §8.2 tooltip sweep (AI-IMP-175): every control now routes its
// chip through this one helper, so these assertions guard the single
// chip style the whole app depends on — the naming contract (aria),
// the delay, and the name+shortcut shape.
describe('tooltip helper', () => {
  let node: HTMLButtonElement

  beforeEach(() => {
    vi.useFakeTimers()
    node = document.createElement('button')
    document.body.appendChild(node)
  })

  afterEach(() => {
    vi.useRealTimers()
    // Remove only the test node — the chip is a reused module singleton
    // (its whole point is one chip element app-wide), so detaching it
    // would break the next test's lookup.
    node.remove()
  })

  const chip = (): HTMLElement | null =>
    document.querySelector('[data-testid="tooltip-chip"]')

  it('names the control on the element itself (aria-label)', () => {
    tooltip(node, { name: 'Close' })
    expect(node.getAttribute('aria-label')).toBe('Close')
  })

  it('shows the chip only after the delay, then hides on leave', () => {
    tooltip(node, { name: 'Zoom to fit' })
    node.dispatchEvent(new Event('pointerenter'))
    // Nothing yet — the chip waits out the delay.
    expect(chip()?.style.display ?? 'none').toBe('none')
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(chip()?.style.display).toBe('block')
    expect(chip()?.textContent).toContain('Zoom to fit')
    node.dispatchEvent(new Event('pointerleave'))
    expect(chip()?.style.display).toBe('none')
  })

  it('prints the shortcut beside the name (name+shortcut shape)', () => {
    tooltip(node, { name: 'Zoom to fit', shortcut: '⇧1' })
    node.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    const text = chip()?.textContent ?? ''
    expect(text).toContain('Zoom to fit')
    expect(text).toContain('⇧1')
  })

  it('re-names the control when the spec updates', () => {
    const handle = tooltip(node, { name: 'Lens — dim everything but this tag' })
    handle.update({ name: 'Lens on · esc' })
    expect(node.getAttribute('aria-label')).toBe('Lens on · esc')
  })
})
