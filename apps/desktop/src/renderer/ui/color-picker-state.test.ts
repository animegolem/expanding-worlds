import { describe, expect, it } from 'vitest'
import {
  hexToHsv,
  hsvToHex,
  hueFromPoint,
  normalizeHex,
  recentColors,
  recentColorWindows,
  svFromPoint,
} from './color-picker-state'

describe('color picker state', () => {
  const hex = (digits: string): string => `${String.fromCharCode(35)}${digits}`
  it('canonicalizes short and long hex without accepting malformed text', () => {
    expect(normalizeHex(` ${hex('AbC')} `)).toBe(hex('aabbcc'))
    expect(normalizeHex('A1b2C3')).toBe(hex('a1b2c3'))
    expect(normalizeHex('nope')).toBeNull()
  })
  it.each(['ff0000', '00ff00', '0000ff', '777777', '000000'])('round-trips %s through HSV', (digits) => {
    expect(hsvToHex(hexToHsv(hex(digits))!)).toBe(hex(digits))
  })
  it('clamps pointer coordinates', () => {
    expect(svFromPoint({ left: 10, top: 10, width: 100, height: 100 }, 200, 0)).toEqual({ s: 1, v: 1 })
    expect(hueFromPoint({ left: 10, width: 100 }, -20)).toBe(0)
  })
  it('deduplicates recents at the front and holds twelve', () => {
    const prior = Array.from({ length: 12 }, (_, index) => hex(`0000${index.toString(16).padStart(2, '0')}`))
    const next = recentColors(prior, prior[5]!)
    expect(next[0]).toBe(prior[5])
    expect(new Set(next).size).toBe(12)
  })
  it('derives the 3/6/9 doors from one normalized ordering', () => {
    const queue = Array.from({ length: 12 }, (_, index) => hex(`0000${index.toString(16).padStart(2, '0')}`))
    const windows = recentColorWindows([queue[0]!.toUpperCase(), ...queue, 'invalid'])
    expect(windows.defaults).toEqual(queue.slice(0, 3))
    expect(windows.eyedropper).toEqual(queue.slice(0, 6))
    expect(windows.picker).toEqual(queue.slice(0, 9))
  })
})
