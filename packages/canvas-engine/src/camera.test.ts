import { describe, expect, it } from 'vitest'
import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera'

describe('Camera', () => {
  it('round-trips world and screen coordinates', () => {
    const camera = new Camera()
    camera.set({ x: 100, y: -50, zoom: 2 })
    const world = { x: 130, y: 20 }
    expect(camera.screenToWorld(camera.worldToScreen(world))).toEqual(world)
    expect(camera.worldToScreen(world)).toEqual({ x: 60, y: 140 })
  })

  it('keeps the world point under the cursor fixed through zoom', () => {
    const camera = new Camera()
    camera.set({ x: 10, y: 10, zoom: 1 })
    const cursor = { x: 400, y: 300 }
    const before = camera.screenToWorld(cursor)
    camera.zoomAt(cursor, 2.5)
    const after = camera.screenToWorld(cursor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    camera.zoomAt(cursor, 0.1)
    const again = camera.screenToWorld(cursor)
    expect(again.x).toBeCloseTo(before.x)
    expect(again.y).toBeCloseTo(before.y)
  })

  it('clamps zoom to the allowed range', () => {
    const camera = new Camera()
    camera.zoomAt({ x: 0, y: 0 }, 1e9)
    expect(camera.zoom).toBe(MAX_ZOOM)
    camera.zoomAt({ x: 0, y: 0 }, 1e-12)
    expect(camera.zoom).toBe(MIN_ZOOM)
  })

  it('pans in world units scaled by zoom', () => {
    const camera = new Camera()
    camera.set({ x: 0, y: 0, zoom: 2 })
    camera.panByScreen(100, -60)
    expect(camera.x).toBe(-50)
    expect(camera.y).toBe(30)
  })

  it('fits bounds centered with padding', () => {
    const camera = new Camera()
    const viewport = { width: 800, height: 600 }
    camera.fitBounds({ x: 0, y: 0, width: 352, height: 100 }, viewport, 48)
    // Width-limited: zoom = (800-96)/352 = 2.
    expect(camera.zoom).toBe(2)
    const center = camera.screenToWorld({ x: 400, y: 300 })
    expect(center.x).toBeCloseTo(176)
    expect(center.y).toBeCloseTo(50)
  })

  it('notifies listeners and applies to a world-plane transform', () => {
    const camera = new Camera()
    const seen: number[] = []
    camera.onChanged((state) => seen.push(state.zoom))
    camera.set({ x: 5, y: 7, zoom: 4 })
    expect(seen).toEqual([4])
    const plane = {
      position: { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y } },
      scale: { x: 1, set(x: number) { this.x = x } },
    }
    camera.applyTo(plane)
    expect(plane.position).toMatchObject({ x: -20, y: -28 })
    expect(plane.scale.x).toBe(4)
  })
})
