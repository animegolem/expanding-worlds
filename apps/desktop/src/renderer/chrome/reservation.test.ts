import { describe, expect, it } from 'vitest'
import {
  COMPACT_RESERVATION,
  COMFORTABLE_RESERVATION,
  reservationFrameFromValues,
} from './reservation'

const HOST = { x: 10, y: 20, width: 800, height: 600 }

describe('reservation frame (§8.8.3)', () => {
  it('preserves shipped compact geometry', () => {
    const frame = reservationFrameFromValues(HOST, 'compact', false, COMPACT_RESERVATION)
    expect(frame.bands).toEqual({ top: 46, right: 56, bottom: 64, left: 0 })
    expect(frame.rect).toEqual({ x: 34, y: 90, width: 696, height: 442 })
  })

  it('uses the comfortable strip value without a reload', () => {
    const frame = reservationFrameFromValues(HOST, 'comfortable', false, COMFORTABLE_RESERVATION)
    expect(frame.bands.top).toBe(0)
    expect(frame.rect.y).toBe(44)
  })

  it('grows only the dock reservation when expanded', () => {
    const frame = reservationFrameFromValues(HOST, 'compact', true, COMPACT_RESERVATION)
    expect(frame.bands.bottom).toBe(112)
    expect(frame.rect.height).toBe(394)
  })
})
