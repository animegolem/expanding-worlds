import { expect, test, type Page } from '@playwright/test'
import { launchApp, revealTitleStrip } from './helpers'

const BOARD_ROWS = [
  'ctx-new-board',
  'ctx-select-all',
  'ctx-zoom-to-fit',
  'bg-set-from-selection',
  'bg-set-from-file',
  'bg-edit',
  'bg-reset',
  'bg-remove',
  'ctx-backdrop-color',
  'ctx-board-note',
]

async function visibleBoardRows(win: Page): Promise<string[]> {
  const rows: string[] = []
  for (const id of BOARD_ROWS) if (await win.getByTestId(id).isVisible()) rows.push(id)
  return rows
}

test('❖, right-click, and touch long-press share the board inventory; HERE text starts at the click', async () => {
  const { app, win } = await launchApp('ew-e2e-ground-menu-')
  try {
    const host = win.getByTestId('canvas-host')
    const box = (await host.boundingBox())!

    // Canonical crumb door.
    await win.getByTestId('board-menu-button').click()
    await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'board')
    const canonical = await visibleBoardRows(win)
    expect(canonical).toEqual(BOARD_ROWS)
    await revealTitleStrip(win)
    await win.mouse.move(box.x + 400, box.y + 300)
    await expect(win.getByTestId('title-strip')).toHaveCount(0)
    await expect(win.getByTestId('board-menu')).toBeVisible()
    await win.keyboard.press('Escape')

    // Mouse ground door opens HERE, whose board row opens that exact inventory.
    const textPoint = { x: box.x + 700, y: box.y + 440 }
    await win.mouse.click(textPoint.x, textPoint.y, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'ground')
    for (const id of ['paste-here', 'text-here', 'pin-here', 'shape-here', 'frame-here']) {
      await expect(win.getByTestId(`ctx-${id}`)).toBeVisible()
    }
    await win.getByTestId('ctx-board').click()
    expect(await visibleBoardRows(win)).toEqual(canonical)
    await win.keyboard.press('Escape')

    // HERE text uses the captured ground world point, not the menu's row position.
    await win.mouse.click(textPoint.x, textPoint.y, { button: 'right' })
    await win.getByTestId('ctx-text-here').click()
    const entry = win.getByTestId('text-entry')
    await expect(entry).toBeVisible()
    const entryBox = (await entry.boundingBox())!
    expect(entryBox.x).toBeCloseTo(textPoint.x, 0)
    expect(entryBox.y).toBeCloseTo(textPoint.y, 0)
    await entry.fill('Here words')
    await entry.press('Enter')
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().decorations)).toBe(1)

    // Touch twin: hold empty ground past the 550ms precedent threshold.
    const canvas = host.locator('canvas')
    const touch = { x: box.x + 900, y: box.y + 650 }
    await canvas.dispatchEvent('pointerdown', {
      pointerType: 'touch', pointerId: 9, button: 0, clientX: touch.x, clientY: touch.y,
    })
    await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'ground')
    await win.getByTestId('ctx-board').click()
    expect(await visibleBoardRows(win)).toEqual(canonical)
  } finally {
    await app.close()
  }
})
