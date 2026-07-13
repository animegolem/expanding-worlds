import { expect, test } from '@playwright/test'
import { openAppMenu, launchApp } from './helpers'

test('reservation frame owns takeover edges and search uses its centered top-flush contract', async () => {
  const { app, win } = await launchApp('ew-e2e-reservation-frame-')

  await expect.poll(() => win.evaluate(() => Boolean(window.__ewReservations))).toBe(true)
  await win.evaluate(() => window.__ewReservations!.show(true))
  await expect(win.getByTestId('reservation-debug')).toBeVisible()
  const viewport = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }))

  await win.getByTestId('charm-search').click()
  const palette = await win.getByTestId('search-panel').boundingBox()
  expect(palette!.y).toBe(46)
  expect(palette!.width).toBeLessThanOrEqual(viewport.width - 160)
  expect(Math.abs(palette!.x + palette!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
  expect(palette!.y + palette!.height).toBeLessThanOrEqual(viewport.height - 114)
  await win.getByTestId('search-close').click()

  await openAppMenu(win)
  await win.getByTestId('menu-settings').click()
  const takeover = win.getByTestId('takeover-settings')
  await expect(takeover).toBeVisible()
  const compact = await takeover.boundingBox()
  expect(compact!.x).toBeGreaterThanOrEqual(24)
  expect(compact!.y).toBeGreaterThanOrEqual(46 + 24)
  expect(compact!.x + compact!.width).toBeLessThanOrEqual(viewport.width - 56 - 24 + 1)
  expect(compact!.y + compact!.height).toBeLessThanOrEqual(viewport.height - 64 - 24 + 1)

  await win.evaluate(() => window.__ewReservations!.density('comfortable'))
  await expect
    .poll(async () => (await takeover.boundingBox())?.y)
    .toBe(24)

  await app.close()
})
