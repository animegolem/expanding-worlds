import { describe, expect, it, vi } from 'vitest'
import { ContextHoldGesture } from './context-hold'

function pointer(x: number, y: number, pointerId = 1): PointerEvent {
  return { pointerType: 'touch', pointerId, clientX: x, clientY: y } as PointerEvent
}

describe('ContextHoldGesture', () => {
  it('fires after the hold, blocks drag, and swallows the synthetic click once', () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const hold = new ContextHoldGesture()
    hold.begin(pointer(10, 10), open)
    expect(hold.blocksDrag()).toBe(true)
    vi.advanceTimersByTime(550)
    expect(open).toHaveBeenCalledOnce()
    hold.end(pointer(10, 10))
    expect(hold.blocksDrag()).toBe(false)
    expect(hold.consumeClick()).toBe(true)
    expect(hold.consumeClick()).toBe(false)
    vi.useRealTimers()
  })

  it('cancels into drag after meaningful movement', () => {
    vi.useFakeTimers()
    const open = vi.fn()
    const hold = new ContextHoldGesture()
    hold.begin(pointer(10, 10), open)
    hold.move(pointer(30, 10))
    expect(hold.blocksDrag()).toBe(false)
    vi.advanceTimersByTime(600)
    expect(open).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
