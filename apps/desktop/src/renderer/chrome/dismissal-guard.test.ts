// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerDismissibleSurface } from './dismissal-guard'

function pointer(type: string, pointerId: number, button = 0): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('dismissal swallow (§8.8.6)', () => {
  it('dismisses the top surface and consumes down, matching up, and click', () => {
    const panel = document.createElement('div')
    const beneath = document.createElement('button')
    document.body.append(panel, beneath)
    let dispose = () => {}
    const dismiss = vi.fn(() => dispose())
    const seen: string[] = []
    beneath.addEventListener('pointerdown', () => seen.push('down'))
    beneath.addEventListener('pointerup', () => seen.push('up'))
    beneath.addEventListener('click', () => seen.push('click'))
    dispose = registerDismissibleSurface({ contains: (target) => panel.contains(target), dismiss })
    disposers.push(dispose)

    beneath.dispatchEvent(pointer('pointerdown', 7))
    beneath.dispatchEvent(pointer('pointerup', 7))
    beneath.dispatchEvent(pointer('click', 7))

    expect(dismiss).toHaveBeenCalledOnce()
    expect(seen).toEqual([])
  })

  it('peels only the top surface and leaves inside presses alone', () => {
    const lower = document.createElement('div')
    const upper = document.createElement('div')
    const upperChild = document.createElement('button')
    upper.appendChild(upperChild)
    document.body.append(lower, upper)
    const lowerDismiss = vi.fn()
    const upperDismiss = vi.fn()
    disposers.push(registerDismissibleSurface({ contains: (target) => lower.contains(target), dismiss: lowerDismiss }))
    disposers.push(registerDismissibleSurface({ contains: (target) => upper.contains(target), dismiss: upperDismiss }))

    upperChild.dispatchEvent(pointer('pointerdown', 8))
    expect(upperDismiss).not.toHaveBeenCalled()
    expect(lowerDismiss).not.toHaveBeenCalled()

    document.body.dispatchEvent(pointer('pointerdown', 9))
    expect(upperDismiss).toHaveBeenCalledOnce()
    expect(lowerDismiss).not.toHaveBeenCalled()
  })

  it('does not turn a secondary press into a swallowed replacement menu', () => {
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const dismiss = vi.fn()
    disposers.push(registerDismissibleSurface({ contains: (target) => panel.contains(target), dismiss }))

    const event = pointer('pointerdown', 10, 2)
    document.body.dispatchEvent(event)

    expect(dismiss).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
