import { describe, expect, it } from 'vitest'
import { normalizeStep, stepFromKey, stepFromWheel, stepValue } from './stepper-state'
describe('stepper state', () => {
  it('snaps decimal steps from min without floating drift', () => expect(normalizeStep(0.62, { min: 0.1, step: 0.25 })).toBe(0.6))
  it('clamps min and max', () => { expect(stepValue(1, 1, { max: 1, step: 0.5 })).toBe(1); expect(stepValue(0, -1, { min: 0 })).toBe(0) })
  it('maps arrows and wheel direction', () => { expect(stepFromKey('ArrowUp')).toBe(1); expect(stepFromKey('x')).toBeNull(); expect(stepFromWheel(2)).toBe(-1) })
})
