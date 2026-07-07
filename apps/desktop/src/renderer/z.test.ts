import { describe, expect, it } from 'vitest'
import { Z } from './z'
import { EW_BEAT_BLOOM_MS, EW_BEAT_STAGE_EDGE_MS, EW_BEAT_TEAR_MS } from './chrome/beats'

describe('z-ladder (§8.8)', () => {
  it('exports the nine named rungs at the normative values', () => {
    expect(Z).toEqual({
      world: 0,
      affordance: 100,
      panel: 200,
      takeover: 300,
      chrome: 400,
      popover: 500,
      modal: 600,
      notice: 700,
      tooltip: 800,
    })
  })

  it('rungs ascend strictly in the §8.8 stacking order', () => {
    const order: (keyof typeof Z)[] = [
      'world',
      'affordance',
      'panel',
      'takeover',
      'chrome',
      'popover',
      'modal',
      'notice',
      'tooltip',
    ]
    const values = order.map((rung) => Z[rung])
    const ascending = [...values].sort((a, b) => a - b)
    expect(values).toEqual(ascending)
    // Strictly increasing — no two rungs share a plane.
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('motion beats (§6)', () => {
  it('exports the three ratified one-shot beat durations (ms)', () => {
    expect(EW_BEAT_TEAR_MS).toBe(300)
    expect(EW_BEAT_BLOOM_MS).toBe(240)
    expect(EW_BEAT_STAGE_EDGE_MS).toBe(180)
  })
})
