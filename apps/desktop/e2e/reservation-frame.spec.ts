import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

test('reservation frame owns takeover and anchored-surface viewport edges', async () => {
  const { app, win } = await launchApp('ew-e2e-reservation-frame-')

  await expect.poll(() => win.evaluate(() => Boolean(window.__ewReservations))).toBe(true)
  await win.evaluate(() => window.__ewReservations!.show(true))
  await expect(win.getByTestId('reservation-debug')).toBeVisible()
  const viewport = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }))

  await win.getByTestId('charm-search').click()
  const anchored = await win.getByTestId('search-panel').boundingBox()
  expect(anchored!.x).toBeGreaterThanOrEqual(24)
  expect(anchored!.y).toBeGreaterThanOrEqual(46 + 24)
  expect(anchored!.x + anchored!.width).toBeLessThanOrEqual(viewport.width - 56 - 24 + 1)
  expect(anchored!.y + anchored!.height).toBeLessThanOrEqual(viewport.height - 64 - 24 + 1)
  await win.getByTestId('search-close').click()

  await win.getByTestId('charm-menu').click()
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
