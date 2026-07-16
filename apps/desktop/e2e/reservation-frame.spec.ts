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
  expect(compact!.x).toBe(24)
  expect(compact!.y).toBeGreaterThanOrEqual(46 + 24)
  expect(compact!.x + compact!.width).toBe(viewport.width - 24)
  expect(compact!.y + compact!.height).toBe(viewport.height - 64)
  await expect(win.locator('html')).toHaveAttribute('data-takeover-chrome', 'true')
  const releasedRail = await win.getByTestId('reservation-debug').locator('.right').boundingBox()
  expect(releasedRail!.width).toBe(0)

  await win.evaluate(() => window.__ewReservations!.density('comfortable'))
  await expect
    .poll(async () => (await takeover.boundingBox())?.y)
    .toBe(46 + 24)

  await app.close()
})

test('window floor and comfortable control tier enforce the ratified frame law', async () => {
  const { app, win } = await launchApp('ew-e2e-frame-law-')

  const clamped = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!
    window.setSize(700, 800)
    return window.getBounds()
  })
  expect(clamped.width).toBe(960)

  await win.evaluate(() => window.__ewReservations!.density('comfortable'))
  await expect(win.locator('html')).toHaveAttribute('data-density', 'comfortable')
  const token = await win.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ew-control-target').trim(),
  )
  expect(token).toBe('36px')

  const dock = (await win.getByTestId('tool-select').boundingBox())!
  const dockRow = (await win.locator('.dock-row.main').boundingBox())!
  const charm = (await win.getByTestId('charm-menu').boundingBox())!
  expect(dock.width).toBeGreaterThanOrEqual(36)
  expect(dock.height).toBeGreaterThanOrEqual(36)
  expect(charm.width).toBeGreaterThanOrEqual(36)
  expect(charm.height).toBeGreaterThanOrEqual(36)
  expect(dockRow.height).toBeLessThanOrEqual(64)

  await openAppMenu(win)
  const menuRow = (await win.getByTestId('menu-settings').boundingBox())!
  expect(menuRow.height).toBeGreaterThanOrEqual(36)
  await app.close()
})
