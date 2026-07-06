import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * AI-IMP-098 acceptance (§6.9 "eases toward the target rather than
 * jumping"): a ctrl-flagged wheel burst (macOS pinch shape, events
 * faster than frames) must NOT teleport the camera per event — it
 * feeds a target that the camera chases, converging to EXACTLY the
 * zoom the instant zoomAt chain would have produced, with the world
 * point under the cursor invariant through the whole glide. Pan
 * stays 1:1 and any pan input cancels a running chase.
 */

const CANVAS = '[data-testid="canvas-host"] canvas'

test('a pinch burst glides to the exact analytic zoom, anchored at the cursor', async () => {
  const { app, win } = await launchApp('ew-e2e-zoom-chase-')

  const burst = await win.evaluate((selector: string) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector)!
    const rect = canvas.getBoundingClientRect()
    // MouseEvent client coords coerce to integers; derive the local
    // point from the coerced values so the anchor math is exact.
    const clientX = Math.round(rect.left + 240)
    const clientY = Math.round(rect.top + 180)
    const at = { x: clientX - rect.left, y: clientY - rect.top }
    const before = window.__ewDebug!.camera()
    const worldBefore = { x: before.x + at.x / before.zoom, y: before.y + at.y / before.zoom }
    const deltas = [-40, -36, -32, -28, -24, -20, -16, -12, -8, -4]
    for (const deltaY of deltas) {
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          clientX,
          clientY,
          deltaY,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    const justAfter = window.__ewDebug!.camera()
    const chase = window.__ewDebug!.zoomChase()
    const { pinchSpeed } = window.__ewDebug!.zoomTuning()
    // The analytic target: the same multiply-and-clamp chain the old
    // instant zoomAt path ran, one factor per event.
    let target = before.zoom
    for (const deltaY of deltas) {
      target = Math.min(64, Math.max(0.002, target * Math.exp(-deltaY * pinchSpeed)))
    }
    return { at, before, justAfter, worldBefore, chase, target }
  }, CANVAS)

  // Events arrived faster than frames: the camera responded already
  // (no dead first frame) but did NOT jump — it is strictly mid-glide
  // toward the analytic target.
  expect(burst.chase.active).toBe(true)
  expect(burst.chase.targetZoom).toBeCloseTo(burst.target, 9)
  expect(burst.justAfter.zoom).toBeGreaterThan(burst.before.zoom)
  expect(burst.justAfter.zoom).toBeLessThan(burst.target)

  // Convergence: the epsilon snap lands the exact analytic product.
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera().zoom), { timeout: 5_000 })
    .toBeCloseTo(burst.target, 9)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.zoomChase().active), { timeout: 5_000 })
    .toBe(false)

  // Cursor anchoring held THROUGH the chase: the world point under
  // the cursor before the burst is still under it at rest.
  const after = await win.evaluate(() => window.__ewDebug!.camera())
  const worldAfter = { x: after.x + burst.at.x / after.zoom, y: after.y + burst.at.y / after.zoom }
  expect(worldAfter.x).toBeCloseTo(burst.worldBefore.x, 5)
  expect(worldAfter.y).toBeCloseTo(burst.worldBefore.y, 5)

  await app.close()
})

test('zoomTuning dials live (dev surface) and pan input cancels the chase', async () => {
  const { app, win } = await launchApp('ew-e2e-zoom-tuning-')

  // Setter round-trips, partials leave the rest intact, and the
  // getter reports what the wheel path now uses. No settings UI, no
  // persistence — §11.5 feel constants.
  const tuned = await win.evaluate(() => {
    const defaults = window.__ewDebug!.zoomTuning()
    const set = window.__ewDebug!.zoomTuning({ tau: 40, wheelSpeed: 0.003, pinchSpeed: 0.02 })
    const partial = window.__ewDebug!.zoomTuning({ tau: 55 })
    return { defaults, set, partial }
  })
  // Deliberately shape-only: the owner WILL re-freeze the dialed
  // numbers after the PureRef side-by-side, and that must not break
  // this spec.
  expect(tuned.defaults.tau).toBeGreaterThan(0)
  expect(tuned.defaults.wheelSpeed).toBeGreaterThan(0)
  expect(tuned.defaults.pinchSpeed).toBeGreaterThan(0)
  expect(tuned.set).toEqual({ tau: 40, wheelSpeed: 0.003, pinchSpeed: 0.02 })
  expect(tuned.partial).toEqual({ tau: 55, wheelSpeed: 0.003, pinchSpeed: 0.02 })

  // Mid-chase pan: the plain-wheel camera write aborts the glide
  // (zoom freezes where the chase left it) while pan itself stays
  // the untouched 1:1 passthrough.
  const outcome = await win.evaluate((selector: string) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector)!
    const rect = canvas.getBoundingClientRect()
    const clientX = Math.round(rect.left + 200)
    const clientY = Math.round(rect.top + 150)
    const common = { clientX, clientY, bubbles: true, cancelable: true }
    canvas.dispatchEvent(new WheelEvent('wheel', { ...common, deltaY: -120, ctrlKey: true }))
    const chaseMid = window.__ewDebug!.zoomChase()
    const mid = window.__ewDebug!.camera()
    canvas.dispatchEvent(new WheelEvent('wheel', { ...common, deltaX: 30, deltaY: 40 }))
    return { chaseMid, mid, chaseAfter: window.__ewDebug!.zoomChase(), after: window.__ewDebug!.camera() }
  }, CANVAS)
  expect(outcome.chaseMid.active).toBe(true)
  expect(outcome.chaseAfter.active).toBe(false)
  expect(outcome.after.zoom).toBeCloseTo(outcome.mid.zoom, 9)
  expect(outcome.after.x).toBeCloseTo(outcome.mid.x + 30 / outcome.mid.zoom, 6)
  expect(outcome.after.y).toBeCloseTo(outcome.mid.y + 40 / outcome.mid.zoom, 6)

  // The cancel sticks: frames later the zoom has not resumed gliding
  // toward the abandoned target.
  await win.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)))
  const settled = await win.evaluate(() => window.__ewDebug!.camera())
  expect(settled.zoom).toBeCloseTo(outcome.mid.zoom, 9)

  await app.close()
})
