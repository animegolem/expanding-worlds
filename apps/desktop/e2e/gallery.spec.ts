import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * §14.4 gallery takeover (AI-IMP-077): the ⊞ charm opens a
 * VIRTUALIZED thumbnail grid over the project's nodes — DOM scales
 * with the viewport, not the collection — grouped into date buckets
 * whose sticky header doubles as the jump control. Kinds render by
 * precedence (board > image > note); image cells load /thumb with
 * original fallback; the takeover leaves the camera untouched.
 */

async function seedGalleryWorld(win: Page): Promise<{ imageHash: string }> {
  // Ballast FIRST so the kind cells land newest — at the top of the
  // date-sorted grid, inside the initial virtualization window.
  for (let i = 0; i < 220; i += 1) {
    await exec(win, 'CreateNode', { nodeId: crypto.randomUUID() })
  }

  // One image node with a REAL imported asset so the cell exercises
  // the 076 thumb URL end to end.
  const { hash, assetId } = await win.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(200, 40, 40)'
    ctx.fillRect(0, 0, 400, 300)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'red.png' })
    if (!result.ok) throw new Error('seed import failed')
    return { hash, assetId: result.assetId }
  })
  const imageNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: imageNode })
  await exec(win, 'SetNodeAppearance', {
    nodeId: imageNode,
    appearance: { kind: 'image', assetId, crop: null },
  })

  const boardNode = crypto.randomUUID()
  const boardNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateNote', { noteId: boardNote, title: 'Ruins Board', body: '' })
  await exec(win, 'AttachNoteToNode', { nodeId: boardNode, noteId: boardNote })
  await exec(win, 'CreateCanvas', { canvasId: crypto.randomUUID(), nodeId: boardNode })

  const notedNode = crypto.randomUUID()
  const clipNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: notedNode })
  await exec(win, 'CreateNote', { noteId: clipNote, title: 'Clipping', body: 'saved text' })
  await exec(win, 'AttachNoteToNode', { nodeId: notedNode, noteId: clipNote })

  return { imageHash: hash }
}

test('⊞ opens a virtualized, bucketed grid; kinds render; camera survives (§14.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-')
  const world = await seedGalleryWorld(win)

  await win.evaluate(() => window.__ewDebug!.setCamera({ x: -30, y: -15, zoom: 1 }))

  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await expect(win.getByTestId('takeover-mode-gallery')).toHaveAttribute('aria-pressed', 'true')

  // Virtualization: 223 entries, viewport-scale DOM.
  const cells = win.locator('[data-testid="gallery-cell"]')
  await expect.poll(() => cells.count()).toBeGreaterThan(10)
  expect(await cells.count()).toBeLessThan(150)

  // Kind cells: the image cell rides the 076 thumb URL (fallback to
  // the original keeps the hash either way); board and note label.
  const imageCell = win.locator('[data-testid="gallery-cell"][data-kind="image"]')
  await expect(imageCell).toHaveCount(1)
  await expect
    .poll(async () => (await imageCell.locator('img').getAttribute('src')) ?? '')
    .toContain(world.imageHash)
  await expect(win.locator('[data-kind="board"]')).toContainText('Ruins Board')
  await expect(
    win.locator('[data-testid="gallery-cell"][data-kind="note"]', { hasText: 'Clipping' }),
  ).toHaveCount(1)

  // Everything seeded today: one bucket, and the sticky header names
  // it; its period list is the jump control (one control, two jobs).
  await expect(win.getByTestId('gallery-period')).toContainText('Today')
  await win.getByTestId('gallery-period').click()
  const periodList = win.getByTestId('gallery-period-list')
  await expect(periodList).toBeVisible()
  await expect(periodList).toContainText('223')
  await win.getByTestId('gallery-period').click()

  // Scrolling swaps the window: different cells, still bounded.
  const firstBefore = await cells.first().getAttribute('data-node-id')
  await win.getByTestId('gallery-scroller').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect
    .poll(async () => (await cells.first().getAttribute('data-node-id')) ?? '')
    .not.toBe(firstBefore)
  expect(await cells.count()).toBeLessThan(150)

  // Mode switch: outline replaces gallery under the same cover rules.
  await win.getByTestId('takeover-mode-outline').click()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await win.getByTestId('takeover-mode-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()

  // Esc returns with the camera untouched (§8.2: DOM, not a flight).
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({
    x: -30,
    y: -15,
    zoom: 1,
  })

  await app.close()
})

test('empty project shows the empty state, not a dead grid', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-empty-')
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await expect(win.getByTestId('gallery-empty')).toBeVisible()
  await app.close()
})
