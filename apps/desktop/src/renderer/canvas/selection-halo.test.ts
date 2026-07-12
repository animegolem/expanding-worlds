import { describe, expect, it } from 'vitest'
import {
  currentSelectionHalo,
  registerSelectionHaloProvider,
  selectionHaloRect,
} from './selection-halo'

describe('selection halo (§8.8.4)', () => {
  it('pads three sides by 12 and the bottom by measured furniture', () => {
    expect(selectionHaloRect({ x: 100, y: 80, width: 200, height: 150 }, 32)).toEqual({
      x: 88,
      y: 68,
      width: 224,
      height: 206,
    })
  })

  it('uses the 32px furniture fallback for a missing measurement', () => {
    expect(selectionHaloRect({ x: 0, y: 0, width: 10, height: 10 }, Number.NaN).height).toBe(66)
  })

  it('registers and clears the mounted selection provider', () => {
    const halo = { x: 1, y: 2, width: 3, height: 4 }
    const dispose = registerSelectionHaloProvider(() => halo)
    expect(currentSelectionHalo()).toBe(halo)
    dispose()
    expect(currentSelectionHalo()).toBeNull()
  })
})
