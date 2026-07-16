import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, revision, runQuery } from './helpers'

const hex = (digits: string): string => `${String.fromCharCode(35)}${digits}`

async function swatchColors(locator: import('@playwright/test').Locator): Promise<string[]> {
  return locator.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['color'] ?? (node as HTMLElement).dataset['swatchColor'] ?? ''))
}

async function seedRectAndOpenRestyle(win: Page): Promise<string> {
  const decorationId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateDecoration', {
    decorationId,
    canvasId,
    kind: 'shape',
    data: {
      shape: 'rect',
      x: 200,
      y: 420,
      width: 100,
      height: 60,
      stroke: hex('dde3ea'),
      strokeWidth: 2,
    },
  })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().decorations)).toBe(1)
  const host = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(host.x + 250, host.y + 450)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([decorationId])
  await win.getByTestId('charm-restyle').click()
  await expect(win.getByTestId('restyle-panel')).toBeVisible()
  await win.getByRole('button', { name: 'Open stroke color picker' }).click()
  await expect(win.getByTestId('color-picker')).toBeVisible()
  return decorationId
}

async function decorationStroke(win: Page, decorationId: string): Promise<string> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const contents = await runQuery<Array<{ id: string; data?: Record<string, unknown> }>>(
    win,
    'getCanvasContents',
    { canvasId },
  )
  return contents.find((entry) => entry.id === decorationId)!.data!['stroke'] as string
}

test('picker drag is live locally and commits once on release; hue, arrows, and hex round-trip', async () => {
  const { app, win } = await launchApp('ew-e2e-color-drag-')
  const decorationId = await seedRectAndOpenRestyle(win)
  const input = win.getByRole('textbox', { name: 'Hex color' })

  const sv = (await win.getByRole('button', { name: 'Saturation and value' }).boundingBox())!
  const beforeSv = await revision(win)
  await win.mouse.move(sv.x + sv.width * 0.2, sv.y + sv.height * 0.2)
  await win.mouse.down()
  await win.mouse.move(sv.x + sv.width * 0.8, sv.y + sv.height * 0.7, { steps: 4 })
  const svDraft = await input.inputValue()
  expect(svDraft).toMatch(/^#[0-9a-f]{6}$/)
  expect(await revision(win)).toBe(beforeSv)
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(beforeSv + 1)
  await expect.poll(() => decorationStroke(win, decorationId)).toBe(svDraft)

  const hue = (await win.getByRole('button', { name: 'Hue' }).boundingBox())!
  const beforeHue = await revision(win)
  await win.mouse.move(hue.x + hue.width * 0.1, hue.y + hue.height / 2)
  await win.mouse.down()
  await win.mouse.move(hue.x + hue.width * 0.65, hue.y + hue.height / 2, { steps: 4 })
  const hueDraft = await input.inputValue()
  expect(await revision(win)).toBe(beforeHue)
  await win.mouse.up()
  await expect.poll(() => revision(win)).toBe(beforeHue + 1)
  await expect.poll(() => decorationStroke(win, decorationId)).toBe(hueDraft)

  const beforeArrow = await revision(win)
  await win.getByRole('button', { name: 'Hue' }).press('ArrowRight')
  await expect.poll(() => revision(win)).toBe(beforeArrow + 1)

  const typed = hex('1a2b3c')
  const beforeHex = await revision(win)
  await input.fill(typed.toUpperCase())
  await input.press('Enter')
  await expect(input).toHaveValue(typed)
  await expect.poll(() => revision(win)).toBe(beforeHex + 1)
  await expect.poll(() => decorationStroke(win, decorationId)).toBe(typed)
  await app.close()
})

test('one twelve-color MRU presents the same ordered 3/6/9 windows', async () => {
  const { app, win } = await launchApp('ew-e2e-color-windows-')
  const colors = Array.from({ length: 12 }, (_, index) =>
    hex((0x101010 + index * 0x070503).toString(16).padStart(6, '0')),
  )
  await win.getByTestId('tool-text').click()
  await expect(win.getByTestId('tool-defaults')).toBeVisible()
  await win.getByTestId('default-ink').getByRole('button', { name: 'Open color picker' }).click()
  const input = win.getByRole('textbox', { name: 'Hex color' })
  for (const color of colors) {
    await input.fill(color)
    await input.press('Enter')
  }

  const expected = [...colors].reverse()
  const picker = await swatchColors(win.getByTestId('color-picker-recents').locator('[data-color]'))
  expect(picker).toEqual(expected.slice(0, 9))
  expect(new Set(picker).size).toBe(9)
  await win.getByRole('button', { name: 'Close color picker' }).click()

  const defaults = await swatchColors(win.getByTestId('default-ink').locator('[data-swatch-color]'))
  expect(defaults).toEqual(expected.slice(0, 3))
  expect(new Set(defaults).size).toBe(3)

  await win.getByTestId('tool-eyedropper').click()
  const eyedropper = await swatchColors(win.getByTestId('eyedropper-recents').locator('[data-color]'))
  expect(eyedropper).toEqual(expected.slice(0, 6))
  expect(new Set(eyedropper).size).toBe(6)
  await app.close()
})
