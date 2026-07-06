import { describe, expect, it } from 'vitest'
import { Camera, MAX_ZOOM } from './camera'
import { CameraFlight } from './camera-flight'
import { CameraZoomChase, ZOOM_CHASE_HEADSTART_MS } from './camera-zoom-chase'

/** Deterministic clock the chase reads instead of performance.now. */
function makeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

function chaseAt(zoom = 1): { camera: Camera; chase: CameraZoomChase; clock: ReturnType<typeof makeClock> } {
  const camera = new Camera()
  camera.set({ x: 0, y: 0, zoom })
  const clock = makeClock()
  const chase = new CameraZoomChase(camera, clock.now)
  return { camera, chase, clock }
}

describe('CameraZoomChase (AI-IMP-098)', () => {
  it('τ is frame-rate independent: different step patterns over the same elapsed time land the same zoom', () => {
    const run = (stepMs: number, steps: number): number => {
      const { camera, chase, clock } = chaseAt(1)
      chase.zoomBy({ x: 100, y: 80 }, 4)
      for (let i = 0; i < steps; i += 1) {
        clock.advance(stepMs)
        chase.tick()
      }
      return camera.zoom
    }
    // 240 ms total, well before the epsilon snap for a ×4 gap.
    const fine = run(16, 15)
    const coarse = run(48, 5)
    const single = run(240, 1)
    expect(fine).toBeGreaterThan(1)
    expect(fine).toBeLessThan(4)
    expect(coarse).toBeCloseTo(fine, 9)
    expect(single).toBeCloseTo(fine, 9)
  })

  it('holds the world point under the cursor fixed through every frame of the chase', () => {
    const { camera, chase, clock } = chaseAt(1)
    camera.set({ x: 50, y: -20, zoom: 1 })
    const cursor = { x: 240, y: 180 }
    const anchorWorld = camera.screenToWorld(cursor)
    chase.zoomBy(cursor, 3)
    for (let i = 0; i < 40; i += 1) {
      clock.advance(16)
      const active = chase.tick()
      const under = camera.screenToWorld(cursor)
      expect(under.x).toBeCloseTo(anchorWorld.x, 9)
      expect(under.y).toBeCloseTo(anchorWorld.y, 9)
      if (!active) break
    }
    expect(chase.active).toBe(false)
  })

  it('epsilon snap: rest is exactly what chained instant zoomAt math produces', () => {
    const { camera, chase, clock } = chaseAt(2)
    camera.set({ x: 10, y: 20, zoom: 2 })
    const twin = new Camera()
    twin.set(camera.state())
    const cursor = { x: 320, y: 240 }
    const factors = [1.3, 1.2, 0.9, 1.5, 1.1]
    for (const factor of factors) {
      chase.zoomBy(cursor, factor)
      twin.zoomAt(cursor, factor)
      clock.advance(4) // events arrive faster than frames
      chase.tick()
    }
    let guard = 0
    while (chase.active && guard < 1_000) {
      clock.advance(16)
      chase.tick()
      guard += 1
    }
    expect(chase.active).toBe(false)
    // Zoom is bit-exact: the target multiplied through the identical
    // clamp-and-multiply sequence zoomAt runs.
    expect(camera.zoom).toBe(twin.zoom)
    expect(camera.x).toBeCloseTo(twin.x, 9)
    expect(camera.y).toBeCloseTo(twin.y, 9)
  })

  it('clamps the target at the zoom bounds like zoomAt does', () => {
    const { camera, chase, clock } = chaseAt(32)
    chase.zoomBy({ x: 0, y: 0 }, 1_000)
    expect(chase.targetZoom).toBe(MAX_ZOOM)
    let guard = 0
    while (chase.active && guard < 1_000) {
      clock.advance(16)
      chase.tick()
      guard += 1
    }
    expect(camera.zoom).toBe(MAX_ZOOM)
  })

  it('activation backdates one nominal frame so the first event responds synchronously', () => {
    const { camera, chase } = chaseAt(1)
    chase.zoomBy({ x: 100, y: 100 }, 2)
    // No clock advance: the headstart alone moved the camera.
    expect(camera.zoom).toBeGreaterThan(1)
    expect(camera.zoom).toBeLessThan(2)
    expect(ZOOM_CHASE_HEADSTART_MS).toBeGreaterThan(0)
  })

  it('mid-chase events multiply the TARGET, not the current zoom', () => {
    const { chase, clock } = chaseAt(1)
    chase.zoomBy({ x: 0, y: 0 }, 2)
    clock.advance(30)
    chase.tick()
    chase.zoomBy({ x: 0, y: 0 }, 2)
    expect(chase.targetZoom).toBe(4)
  })

  it('external camera changes cancel the chase; its own ticks do not', () => {
    const { camera, chase, clock } = chaseAt(1)
    camera.onChanged(() => chase.cancelOnExternalChange())
    chase.zoomBy({ x: 50, y: 50 }, 3)
    clock.advance(16)
    expect(chase.tick()).toBe(true) // own write survives the hook
    camera.panByScreen(10, 0) // the user grabs the camera
    expect(chase.active).toBe(false)
    const before = camera.state()
    clock.advance(16)
    expect(chase.tick()).toBe(false)
    expect(camera.state()).toEqual(before)
  })

  it('never fights a flight: a flight step cancels the chase, and a chase tick cancels a flight', () => {
    const { camera, chase, clock } = chaseAt(1)
    const flight = new CameraFlight(camera)
    camera.onChanged(() => {
      flight.cancelOnExternalChange()
      chase.cancelOnExternalChange()
    })
    // Flight wins over a running chase (host also cancels explicitly
    // on flyTo; the hook is the backstop).
    chase.zoomBy({ x: 0, y: 0 }, 2)
    flight.flyTo({ x: 100, y: 0, zoom: 1 }, 200)
    flight.step(50)
    expect(chase.active).toBe(false)
    expect(flight.active).toBe(true)
    // Zoom input wins over a running flight.
    chase.zoomBy({ x: 0, y: 0 }, 2)
    clock.advance(16)
    chase.tick()
    expect(flight.active).toBe(false)
    expect(chase.active).toBe(true)
  })
})
