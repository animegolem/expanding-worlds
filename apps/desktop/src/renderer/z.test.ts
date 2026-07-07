import { describe, expect, it } from 'vitest'
import { Z } from './z'
import {
  EW_BEAT_AWAY_MS,
  EW_BEAT_BLOOM_MS,
  EW_BEAT_LIFT_MS,
  EW_BEAT_LIFT_SCALE,
  EW_BEAT_NUDGE_MS,
  EW_BEAT_PRESS_SCALE,
  EW_BEAT_SETTLE_MS,
  EW_BEAT_STAGE_EDGE_MS,
  EW_BEAT_STRAIN_PX,
  EW_BEAT_TEAR_MS,
} from './chrome/beats'

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

  it('exports the §8.2 interaction-physics ledger constants (AI-IMP-151)', () => {
    // Confirmed ledger numbers — the contract for the pointer beats.
    expect(EW_BEAT_LIFT_MS).toBe(120)
    expect(EW_BEAT_SETTLE_MS).toBe(150)
    expect(EW_BEAT_NUDGE_MS).toBe(40)
    expect(EW_BEAT_AWAY_MS).toBe(180)
    // Scale rides ±1% and no further (§8.2).
    expect(EW_BEAT_LIFT_SCALE).toBe(0.01)
    expect(EW_BEAT_PRESS_SCALE).toBe(0.01)
    expect(EW_BEAT_STRAIN_PX).toBe(2)
  })
})
