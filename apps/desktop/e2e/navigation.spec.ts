import { expect, test } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * AI-IMP-060 acceptance (RFC §8.1): the session history is the path —
 * entry route, never ancestry. Flights go through navigateTo (the
 * __ewNav hook stands in for the dive UI until AI-IMP-063), Back and
 * Forward restore viewports, stale targets skip and collapse, and ⌂
 * returns to the protected root canvas.
 */

async function seedCanvas(win: import('@playwright/test').Page): Promise<string> {
  const nodeId = crypto.randomUUID()
  const canvasId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreateCanvas', { canvasId, nodeId })
  return canvasId
}

test('path, back/forward, viewport restore, home (§17 item 12)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  // A distinctive viewport on the root, to be restored by Back.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 137, y: 59, zoom: 2 }))

  // Fly Home → B → C through the one true flight path.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  // The path renders the back-stack with the current entry last.
  await expect(win.getByTestId('nav-crumb-0')).toHaveText('Home')
  await expect(win.getByTestId('nav-crumb-1')).toHaveText('Harbor')
  await expect(win.getByTestId('nav-crumb-2')).toHaveText('Keep')

  // Back twice via the keyboard: to B, then to the root with its
  // viewport as the user left it.
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({ x: 137, y: 59, zoom: 2 })

  // Forward stack intact: two entries ahead.
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  // A NEW navigation clears the forward stack (§8.1).
  const canvasD = await seedCanvas(win)
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Delta'), { id: canvasD })
  expect(await win.evaluate(() => window.__ewNav!.entries().length)).toBe(3) // Home, Harbor, Delta
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasD)

  // Crumb click returns to that entry.
  await win.getByTestId('nav-crumb-0').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // ⌂ is itself a navigation event: a NEW entry, not a rewind.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // The hover ‹ › affordances exist beside the path and act: Back
  // returns to where ⌂ was pressed, Forward to the root again.
  await win.getByTestId('path-bar').hover()
  await win.getByTestId('nav-back').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.getByTestId('nav-forward').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  await app.close()
})

test('stale targets skip and collapse; history survives trash (§8.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-stale-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  // Trash B while standing on C: Back skips and collapses it.
  await exec(win, 'TrashCanvas', { canvasId: canvasB })
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  // The dead entry is gone from the stack; Keep remains ahead.
  expect(await win.evaluate(() => window.__ewNav!.entries().map((e) => e.label))).toEqual([
    'Home',
    'Keep',
  ])
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  await app.close()
})
