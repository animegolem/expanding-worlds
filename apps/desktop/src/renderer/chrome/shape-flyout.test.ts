import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentShape,
  rememberShape,
  SHAPE_HOLD_MS,
  ShapeHoldGesture,
  tailOffset,
} from './shape-flyout'

afterEach(() => {
  vi.useRealTimers()
  rememberShape('rect')
})

describe('shape flyout gesture', () => {
  it('separates a quick release from the 300ms hold boundary', () => {
    vi.useFakeTimers()
    const opened = vi.fn()
    const gesture = new ShapeHoldGesture(opened)
    gesture.press()
    vi.advanceTimersByTime(SHAPE_HOLD_MS - 1)
    expect(opened).not.toHaveBeenCalled()
    expect(gesture.release()).toBe('quick')
    vi.advanceTimersByTime(1)
    expect(opened).not.toHaveBeenCalled()

    gesture.press()
    vi.advanceTimersByTime(SHAPE_HOLD_MS)
    expect(opened).toHaveBeenCalledTimes(1)
    expect(gesture.release()).toBe('held')
  })

  it('cancels without a late open', () => {
    vi.useFakeTimers()
    const opened = vi.fn()
    const gesture = new ShapeHoldGesture(opened)
    gesture.press()
    gesture.cancel()
    vi.runAllTimers()
    expect(opened).not.toHaveBeenCalled()
  })

  it('remembers one session-local face and keeps a clamped tail honest', () => {
    rememberShape('diamond')
    expect(currentShape()).toBe('diamond')
    expect(tailOffset(20, 100, 160)).toBe(12)
    expect(tailOffset(180, 100, 160)).toBe(80)
    expect(tailOffset(300, 100, 160)).toBe(148)
  })
})
