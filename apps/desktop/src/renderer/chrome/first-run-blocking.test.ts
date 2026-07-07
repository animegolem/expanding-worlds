import { describe, expect, it } from 'vitest'
import { isFirstRunVisible, showFirstRun } from './first-run'
import { takeoverActive } from './takeover'

/**
 * PR #14 review (P2): the first-run guide must block board input the
 * way every named takeover does. The board's keyboard seams guard on
 * takeoverActive(); a visible guide has to register there — a focused
 * card div is not enough against capture-phase listeners.
 */
describe('first-run guide blocks board input (AI-IMP-160)', () => {
  it('takeoverActive() is true while the guide is visible', () => {
    expect(takeoverActive()).toBe(false)
    showFirstRun()
    expect(isFirstRunVisible()).toBe(true)
    expect(takeoverActive()).toBe(true)
  })
})
