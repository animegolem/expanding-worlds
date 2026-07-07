import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * §8.2 node object icons (AI-IMP-132). The six icon appearances render
 * as their own baked objects on the board (from a shared texture
 * atlas), degrade to the plain dot below the furniture threshold, and
 * the appearance switcher previews the real objects instead of unicode
 * glyphs.
 */

const ICON_IDS = ['star', 'pin', 'flag', 'heart', 'bolt', 'leaf'] as const

async function seedIcon(
  win: Page,
  icon: string,
  at: { x: number; y: number },
  size?: number,
): Promise<string> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId,
    x: at.x,
    y: at.y,
    appearance: { kind: 'icon', icon },
  })
  if (size !== undefined) {
    await exec(win, 'TransformContent', {
      canvasId,
      items: [
        { kind: 'placement', placementId, x: at.x, y: at.y, width: size, height: size, scale: 1, rotation: 0 },
      ],
    })
  }
  return placementId
}

test('an icon node renders the object at working zoom and the dot at deep zoom (§8.2)', async () => {
  const { app, win } = await launchApp('ew-e2e-object-icons-')
  const placementId = await seedIcon(win, 'star', { x: 0, y: 0 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const body = (): Promise<string | null> =>
    win.evaluate((id) => window.__ewDebug!.placementBody(id), placementId)

  // Working zoom: the 24px body renders well above the ~8px furniture
  // threshold, so the atlas OBJECT sprite shows.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await expect.poll(body).toBe('icon-object')

  // Deep zoom-out: rendered 24 × 0.1 = 2.4px < threshold → the object
  // degrades to its plain dot.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.1 }))
  await expect.poll(body).toBe('icon-dot')

  // Zoom back in: the object returns (LOD is re-derived per cull, no
  // renderer rebuild).
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 2 }))
  await expect.poll(body).toBe('icon-object')

  await app.close()
})

test('the appearance switcher previews the six real objects (§8.2)', async () => {
  const { app, win } = await launchApp('ew-e2e-object-icons-switcher-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await seedIcon(win, 'star', { x: 500, y: 350 }, 200)
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  // Select the node and open the appearance popover (default camera
  // maps world → canvas-local screen ≈ identity, like charms.spec).
  await win.mouse.click(box.x + 500, box.y + 350)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.getByTestId('charm-appearance').click()
  await expect(win.getByTestId('charm-appearance-popover')).toBeVisible()

  // Each icon button previews its real baked object as a background
  // image (a data URL, not a unicode glyph), and the six are distinct.
  const backgrounds: string[] = []
  for (const id of ICON_IDS) {
    const button = win.getByTestId(`appearance-icon-${id}`)
    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(bg, `icon ${id} preview`).toContain('data:image/svg+xml')
    // The unicode glyph must not be the visible affordance anymore.
    await expect(button).toHaveText('')
    backgrounds.push(bg)
  }
  expect(new Set(backgrounds).size, 'six distinct previews').toBe(ICON_IDS.length)

  await app.close()
})
