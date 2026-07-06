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

  it('reserves a screen inset and centers the target in the remaining region', () => {
    const camera = new Camera()
    const viewport = { width: 800, height: 600 }
    // Reserve 200px on the right (a panel band). availWidth = 600.
    const target = camera.fitTarget(
      { x: 0, y: 0, width: 252, height: 100 },
      viewport,
      48,
      { top: 0, right: 200, bottom: 0, left: 0 },
    )!
    camera.set(target)
    // Width-limited against the 600px region: zoom = (600-96)/252 = 2.
    expect(camera.zoom).toBe(2)
    // The bounds center lands at the CENTER of the panel-free region
    // (screen x = availWidth/2 = 300), not the raw viewport center.
    const regionCenter = camera.screenToWorld({ x: 300, y: 300 })
    expect(regionCenter.x).toBeCloseTo(126)
    expect(regionCenter.y).toBeCloseTo(50)
    // Consequently the target sits LEFT of the true viewport center,
    // leaving the reserved band on the right free for the panel.
    expect(camera.worldToScreen({ x: 126, y: 50 }).x).toBeLessThan(400)
  })

  it('a zero inset is byte-identical to no inset', () => {
    const camera = new Camera()
    const viewport = { width: 800, height: 600 }
    const bounds = { x: 10, y: 20, width: 352, height: 100 }
    const plain = camera.fitTarget(bounds, viewport, 48)
    const zeroed = camera.fitTarget(bounds, viewport, 48, { top: 0, right: 0, bottom: 0, left: 0 })
    expect(zeroed).toEqual(plain)
  })

  it('applies a one-shot pending inset to exactly the next fit', () => {
    const camera = new Camera()
    const viewport = { width: 800, height: 600 }
    const bounds = { x: 0, y: 0, width: 252, height: 100 }
    const inset = { top: 0, right: 200, bottom: 0, left: 0 }
    camera.setNextFitInset(inset)
    const armed = camera.fitTarget(bounds, viewport, 48)
    const after = camera.fitTarget(bounds, viewport, 48)
    // The armed fit reserved the band; the next fit is back to plain.
    expect(armed).toEqual(camera.fitTarget(bounds, viewport, 48, inset))
    expect(armed).not.toEqual(after)
    expect(after).toEqual(camera.fitTarget(bounds, viewport, 48))
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
