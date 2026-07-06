import { expect, test } from '@playwright/test'
import { launchApp, seedPlacedNote } from './helpers'

/**
 * AI-IMP-100: a wiki-link activation that flies to a target placement
 * and opens its tethered panel must frame the two SIDE BY SIDE — the
 * fit reserves the panel's screen band (§6.9 rev 0.31 inset) so the
 * flown-to node never lands under the note. Regression: before the
 * inset the panel spawned over the target (owner screenshots).
 */

const ALPHA = { x: 3000, y: 2200 }
// A dot placement is 24×24 world units centered on its point.
const ALPHA_AABB = { x: ALPHA.x - 12, y: ALPHA.y - 12, width: 24, height: 24 }

test('wiki-link flight frames the target beside its tethered panel, never under it', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-flyto-')
  // Two placed notes on distant spots, linked by a wiki link.
  await seedPlacedNote(win, 'Alpha', 'the target', ALPHA)
  await seedPlacedNote(win, 'Source', 'go [[Alpha]] now', { x: 250, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

  // Open the source note, then activate its bound link to Alpha.
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 250, box.y + 200)
  await expect(win.getByTestId('note-editor')).toContainText('Alpha')

  await win.locator('.cm-content [data-link-title="Alpha"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Alpha/)

  // The eased flight must settle before we sample the camera (EPIC-010
  // lesson: never read an in-flight camera synchronously).
  await expect
    .poll(() =>
      win.evaluate(async () => {
        const a = window.__ewDebug!.camera()
        await new Promise((resolve) => setTimeout(resolve, 150))
        const b = window.__ewDebug!.camera()
        return a.x === b.x && a.y === b.y && a.zoom === b.zoom && !window.__ewDebug!.stage().flightActive
      }),
    )
    .toBe(true)

  // Screen bounds of the flown-to placement (host-local → viewport).
  const cam = await win.evaluate(() => window.__ewDebug!.camera())
  const hostBox = (await win.getByTestId('canvas-host').boundingBox())!
  const placement = {
    left: hostBox.x + (ALPHA_AABB.x - cam.x) * cam.zoom,
    top: hostBox.y + (ALPHA_AABB.y - cam.y) * cam.zoom,
    right: hostBox.x + (ALPHA_AABB.x + ALPHA_AABB.width - cam.x) * cam.zoom,
    bottom: hostBox.y + (ALPHA_AABB.y + ALPHA_AABB.height - cam.y) * cam.zoom,
  }
  const panel = (await win.getByTestId('note-pane').boundingBox())!
  const eps = 1

  // (1) The placement the flight promised is fully on screen.
  expect(placement.left).toBeGreaterThanOrEqual(hostBox.x - eps)
  expect(placement.top).toBeGreaterThanOrEqual(hostBox.y - eps)
  expect(placement.right).toBeLessThanOrEqual(hostBox.x + hostBox.width + eps)
  expect(placement.bottom).toBeLessThanOrEqual(hostBox.y + hostBox.height + eps)

  // (2) The panel is fully on screen too...
  expect(panel.x).toBeGreaterThanOrEqual(hostBox.x - eps)
  expect(panel.x + panel.width).toBeLessThanOrEqual(hostBox.x + hostBox.width + eps)

  // (3) ...and the placement's bounds do NOT intersect the panel.
  const disjoint =
    placement.right <= panel.x + eps ||
    placement.left >= panel.x + panel.width - eps ||
    placement.bottom <= panel.y + eps ||
    placement.top >= panel.y + panel.height - eps
  expect(disjoint).toBe(true)

  await app.close()
})
