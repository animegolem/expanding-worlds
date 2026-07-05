import { describe, expect, it } from 'vitest'
import { Camera } from './camera'
import { CameraFlight } from './camera-flight'

describe('CameraFlight (AI-IMP-032)', () => {
  it('eases from the current state and lands exactly on the target', () => {
    const camera = new Camera()
    camera.set({ x: 0, y: 0, zoom: 1 })
    const flight = new CameraFlight(camera)
    flight.flyTo({ x: 100, y: 50, zoom: 4 }, 200)
    expect(flight.step(100)).toBe(true)
    // Mid-flight: strictly between endpoints, zoom eased in log space.
    expect(camera.x).toBeGreaterThan(0)
    expect(camera.x).toBeLessThan(100)
    expect(camera.zoom).toBeGreaterThan(1)
    expect(camera.zoom).toBeLessThan(4)
    expect(flight.step(150)).toBe(false)
    expect(camera.x).toBe(100)
    expect(camera.y).toBe(50)
    expect(camera.zoom).toBe(4)
    expect(flight.active).toBe(false)
  })

  it('external camera changes cancel the flight; its own writes do not', () => {
    const camera = new Camera()
    const flight = new CameraFlight(camera)
    camera.onChanged(() => flight.cancelOnExternalChange())
    flight.flyTo({ x: 100, y: 0, zoom: 1 }, 200)
    expect(flight.step(50)).toBe(true) // own write survives
    camera.panByScreen(10, 0) // the user grabs the camera
    expect(flight.active).toBe(false)
    const before = camera.state()
    expect(flight.step(50)).toBe(false)
    expect(camera.state()).toEqual(before)
  })

  it('fitTarget centers the bounds at the fitted zoom', () => {
    const camera = new Camera()
    const target = camera.fitTarget(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: 1000, height: 500 },
      0,
    )!
    expect(target.zoom).toBe(10)
    expect(target.x).toBe(0)
    expect(target.y).toBe(0)
  })
})
