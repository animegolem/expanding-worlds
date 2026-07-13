import { expect, test, type Page } from '@playwright/test'
import { openAppMenu, launchApp } from './helpers'

/**
 * AI-IMP-205 (§6.9 mouse/trackpad navigation scheme): middle-button
 * drag pans UNCONDITIONALLY on any device, and a `navigation.scheme`
 * setting governs the plain wheel — trackpad (default) keeps wheel =
 * pan, mouse routes wheel into the cursor-anchored zoom chase. Pinch
 * (ctrl-flagged wheel) and Cmd+wheel (meta) zoom in BOTH schemes.
 */

const CANVAS = '[data-testid="canvas-host"] canvas'

async function canvasBox(win: Page): Promise<{ x: number; y: number }> {
  const box = await win.locator(CANVAS).boundingBox()
  if (!box) throw new Error('no canvas box')
  return { x: box.x, y: box.y }
}

/** Dispatch a plain (or modified) wheel at a canvas-local point, mirroring
 * zoom-smoothing.spec's honest event shape. */
async function wheelAt(
  win: Page,
  local: { x: number; y: number },
  deltaY: number,
  mods: { ctrlKey?: boolean; metaKey?: boolean } = {},
): Promise<void> {
  await win.evaluate(
    ({ selector, local, deltaY, mods }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector)!
      const rect = canvas.getBoundingClientRect()
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          clientX: rect.left + local.x,
          clientY: rect.top + local.y,
          deltaY,
          bubbles: true,
          cancelable: true,
          ...mods,
        }),
      )
    },
    { selector: CANVAS, local, deltaY, mods },
  )
}

test('middle-button drag pans the board, no autoscroll leakage', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-middle-')
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const before = await win.evaluate(() => window.__ewDebug!.camera())

  const origin = await canvasBox(win)
  // A real middle-button drag through Playwright — the actual device
  // path, so the autoscroll-suppression (preventDefault) is exercised.
  await win.mouse.move(origin.x + 260, origin.y + 200)
  await win.mouse.down({ button: 'middle' })
  await win.mouse.move(origin.x + 400, origin.y + 300, { steps: 6 })
  await win.mouse.up({ button: 'middle' })

  const after = await win.evaluate(() => window.__ewDebug!.camera())
  // The camera panned (opposite the drag) and the zoom is untouched —
  // a pan, never a zoom.
  expect(after.zoom).toBeCloseTo(before.zoom, 9)
  expect(after.x).toBeLessThan(before.x)
  expect(after.y).toBeLessThan(before.y)

  await app.close()
})

test('plain wheel pans in trackpad scheme and zooms in mouse scheme; pinch/Cmd zoom in both', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-wheel-')
  const at = { x: 240, y: 180 }

  // Default scheme is trackpad: a plain wheel PANS (zoom untouched).
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await wheelAt(win, at, -100)
  const panned = await win.evaluate(() => window.__ewDebug!.camera())
  expect(panned.zoom).toBeCloseTo(1, 9)
  expect(panned.y).not.toBeCloseTo(0, 3)

  // Pinch (ctrl) and Cmd+wheel (meta) zoom EVEN in trackpad scheme.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await wheelAt(win, at, -100, { ctrlKey: true })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera().zoom), { timeout: 5_000 })
    .toBeGreaterThan(1)

  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await wheelAt(win, at, -100, { metaKey: true })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera().zoom), { timeout: 5_000 })
    .toBeGreaterThan(1)

  // Flip to the mouse scheme through the real settings row.
  await openAppMenu(win)
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('settings-view')).toBeVisible()
  await win.getByTestId('settings-navigation-scheme-mouse').click()
  await expect(win.getByTestId('settings-navigation-scheme-mouse')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await win.keyboard.press('Escape') // close the takeover, back to the board

  // Now a PLAIN wheel zooms at the cursor (routes into the chase).
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await wheelAt(win, at, -100)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera().zoom), { timeout: 5_000 })
    .toBeGreaterThan(1)

  await app.close()
})
