import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function expectStationary(actual: Rect | null, expected: Rect | null): void {
  expect(actual).not.toBeNull()
  expect(expected).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual![key] - expected![key])).toBeLessThanOrEqual(1)
  }
}

async function openLooseNote(win: Page): Promise<void> {
  const noteId = crypto.randomUUID()
  await exec(win, 'CreateNote', {
    noteId,
    title: 'Dock overlap probe',
    body: 'A real note panel deliberately seated over the dock.',
  })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, noteId)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await win.waitForTimeout(300)
}

async function movePanelOverDock(win: Page): Promise<void> {
  const panel = (await win.locator('.note-panel').first().boundingBox())!
  const main = (await win.locator('.dock-row.main').boundingBox())!
  const grip = (await win.getByTestId('panel-grip').boundingBox())!
  const target = {
    x: main.x + main.width / 2 - panel.width / 2,
    y: main.y - panel.height + main.height * 0.6,
  }
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await win.mouse.move(start.x, start.y)
  await win.mouse.down()
  await win.mouse.move(start.x + target.x - panel.x, start.y + target.y - panel.y, { steps: 4 })
  await win.mouse.up()
  await win.waitForTimeout(100)
}

async function expectPanelOverlapAndDockOwnership(win: Page): Promise<void> {
  const evidence = await win.evaluate(() => {
    const main = document.querySelector('.dock-row.main')!.getBoundingClientRect()
    const panel = document.querySelector('.note-panel')!.getBoundingClientRect()
    const intersects =
      panel.x < main.x + main.width && panel.x + panel.width > main.x &&
      panel.y < main.y + main.height && panel.y + panel.height > main.y
    const controls = [...document.querySelectorAll<HTMLElement>('.dock-row.main button:not([aria-disabled="true"])')]
    return {
      intersects,
      owners: controls.map((control) => {
        const bounds = control.getBoundingClientRect()
        const first = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        )
        return { id: control.dataset['testid'], owns: first !== null && control.contains(first) }
      }),
    }
  })
  expect(evidence.intersects).toBe(true)
  expect(evidence.owners.length).toBeGreaterThan(0)
  expect(evidence.owners.filter((entry) => !entry.owns)).toEqual([])
}

test('ordinary free and pinned notes stay below every enabled dock control (DOCK-LAYER-01)', async () => {
  for (const density of ['compact', 'comfortable'] as const) {
    const { app, win } = await launchApp(`ew-e2e-dock-note-layer-${density}-`)
    await win.evaluate((next) => window.__ewReservations!.density(next), density)
    await openLooseNote(win)
    await movePanelOverDock(win)
    await expectPanelOverlapAndDockOwnership(win)

    await win.getByTestId('panel-pin').click()
    await expect(win.locator('.note-panel.pinned')).toBeVisible()
    await win.waitForTimeout(100)
    await movePanelOverDock(win)
    await expectPanelOverlapAndDockOwnership(win)
    await app.close()
  }
})

test('each defaults row grows above a stationary main row at both densities (DOCK-GEO-03)', async () => {
  const { app, win } = await launchApp('ew-e2e-dock-defaults-geometry-')
  for (const density of ['compact', 'comfortable'] as const) {
    await win.evaluate((next) => window.__ewReservations!.density(next), density)
    for (const testid of ['tool-text', 'dock-shape', 'tool-line']) {
      await win.getByTestId('tool-select').click()
      await expect(win.getByTestId('tool-defaults')).toHaveCount(0)
      const before = await win.locator('.dock-row.main').boundingBox()

      await win.getByTestId(testid).click()
      await expect(win.getByTestId('tool-defaults')).toBeVisible()
      const during = await win.locator('.dock-row.main').boundingBox()
      const defaults = (await win.getByTestId('tool-defaults').boundingBox())!
      expectStationary(during, before)
      expect(defaults.y + defaults.height).toBeLessThanOrEqual(during!.y)

      await win.getByTestId('tool-select').click()
      await expect(win.getByTestId('tool-defaults')).toHaveCount(0)
      expectStationary(await win.locator('.dock-row.main').boundingBox(), before)
    }
  }
  await app.close()
})
