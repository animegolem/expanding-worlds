import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

interface World {
  rootCanvas: string
  boardCanvas: string
  boardNode: string
  notedNode: string
  placedNode: string
  unplacedNode: string
  multiNode: string
}

async function seed(win: Page): Promise<World> {
  const rootCanvas = await win.evaluate(() => window.__ewDebug!.canvasId())
  const boardNode = crypto.randomUUID()
  const boardNote = crypto.randomUUID()
  const boardCanvas = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateNote', { noteId: boardNote, title: 'Arena', body: '' })
  await exec(win, 'AttachNoteToNode', { nodeId: boardNode, noteId: boardNote })
  await exec(win, 'CreateCanvas', { canvasId: boardCanvas, nodeId: boardNode })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(), canvasId: rootCanvas, nodeId: boardNode, x: -300, y: 0,
  })

  const notedNode = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: notedNode })
  await exec(win, 'CreateNote', { noteId, title: 'Field Notes', body: 'hello' })
  await exec(win, 'AttachNoteToNode', { nodeId: notedNode, noteId })

  const placedNode = crypto.randomUUID()
  const unplacedNode = crypto.randomUUID()
  const multiNode = crypto.randomUUID()
  for (const nodeId of [placedNode, unplacedNode, multiNode]) {
    await exec(win, 'CreateNode', { nodeId })
  }
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(), canvasId: rootCanvas, nodeId: placedNode, x: 0, y: 0,
  })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(), canvasId: rootCanvas, nodeId: multiNode, x: 100, y: 0,
  })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(), canvasId: boardCanvas, nodeId: multiNode, x: 100, y: 0,
  })
  return { rootCanvas, boardCanvas, boardNode, notedNode, placedNode, unplacedNode, multiNode }
}

async function openGallery(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
}

function cell(win: Page, nodeId: string) {
  return win.locator(`[data-testid="gallery-cell"][data-node-id="${nodeId}"]`)
}

async function openMenu(win: Page, nodeId: string): Promise<void> {
  await cell(win, nodeId).click({ button: 'right' })
  await expect(win.getByTestId('gallery-context-menu')).toBeVisible()
}

async function openMenuAt(
  win: Page,
  nodeId: string,
  point: { clientX: number; clientY: number },
): Promise<void> {
  await cell(win, nodeId).evaluate((element, coordinates) => {
    element.dispatchEvent(new MouseEvent('contextmenu', {
      ...coordinates,
      bubbles: true,
      cancelable: true,
      button: 2,
    }))
  }, point)
  await expect(win.getByTestId('gallery-context-menu')).toBeVisible()
}

async function verbIds(win: Page): Promise<string[]> {
  return win
    .getByTestId('gallery-context-menu')
    .locator('[data-verb-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-verb-id')!))
}

test('right-click selection semantics, filtered inventory, clamp, and touch parity', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-context-')
  try {
    const world = await seed(win)
    await openGallery(win)

    await cell(win, world.unplacedNode).click()
    await cell(win, world.placedNode).click({ modifiers: ['ControlOrMeta'] })
    await openMenuAt(win, world.notedNode, { clientX: 120, clientY: 160 })
    await expect(win.getByTestId('gallery-action-count')).toHaveText('1')
    expect(await verbIds(win)).toEqual(['place', 'open-note', 'tag', 'trash'])
    await expect(win.getByTestId('gallery-context-menu-open-note')).toHaveText(/open note/)
    await expect(win.getByTestId('gallery-context-menu')).not.toContainText('crop')

    await expect.poll(async () => {
      const box = await win.getByTestId('gallery-context-menu').boundingBox()
      return box === null ? -1 : Math.round(box.x)
    }).toBe(120)
    const firstBounds = (await win.getByTestId('gallery-context-menu').boundingBox())!
    const viewport = win.viewportSize() ?? { width: 1280, height: 800 }
    expect(firstBounds.x).toBeGreaterThanOrEqual(0)
    expect(firstBounds.y).toBeGreaterThanOrEqual(0)
    expect(firstBounds.x + firstBounds.width).toBeLessThanOrEqual(viewport.width)
    expect(firstBounds.y + firstBounds.height).toBeLessThanOrEqual(viewport.height)

    // A second right-click without Escape must replace both TARGET and
    // measured anchor; retaining the mounted component would leave it at
    // Field Notes' old point.
    await openMenuAt(win, world.unplacedNode, { clientX: 760, clientY: 480 })
    expect(await verbIds(win)).toEqual(['place', 'add-note', 'tag', 'trash'])
    await expect.poll(async () => {
      const box = await win.getByTestId('gallery-context-menu').boundingBox()
      return box === null ? -1 : Math.round(box.x)
    }).toBe(760)
    const secondBounds = (await win.getByTestId('gallery-context-menu').boundingBox())!
    expect({ x: secondBounds.x, y: secondBounds.y }).not.toEqual({
      x: firstBounds.x,
      y: firstBounds.y,
    })
    await win.keyboard.press('Escape')

    await cell(win, world.unplacedNode).click()
    await cell(win, world.placedNode).click({ modifiers: ['ControlOrMeta'] })
    await openMenu(win, world.unplacedNode)
    await expect(win.getByTestId('gallery-action-count')).toHaveText('2')
    expect(await verbIds(win)).toEqual(['place', 'tag', 'trash'])
    await win.keyboard.press('Escape')

    await openMenu(win, world.boardNode)
    expect(await verbIds(win)).toEqual(['dive', 'fly-to', 'open-note', 'tag', 'trash'])
    await win.keyboard.press('Escape')

    // GR-5: the same inventory opens after a stationary touch hold.
    await cell(win, world.notedNode).dispatchEvent('pointerdown', {
      pointerType: 'touch', pointerId: 77, clientX: 400, clientY: 300,
    })
    await win.waitForTimeout(575)
    await expect(win.getByTestId('gallery-context-menu')).toBeVisible()
    expect(await verbIds(win)).toEqual(['place', 'open-note', 'tag', 'trash'])
    await cell(win, world.notedNode).dispatchEvent('pointerup', {
      pointerType: 'touch', pointerId: 77, clientX: 400, clientY: 300,
    })
  } finally {
    await app.close()
  }
})

test('menu verbs reuse shipped open/place/tag/trash/dive paths', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-context-verbs-')
  try {
    const world = await seed(win)
    await openGallery(win)

    await openMenu(win, world.notedNode)
    await win.getByTestId('gallery-context-menu-open-note').click()
    await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
    await expect(win.getByTestId('note-pane')).toBeVisible()

    await openGallery(win)
    await openMenu(win, world.unplacedNode)
    await win.getByTestId('gallery-context-menu-place').click()
    await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
    await expect.poll(async () => {
      const row = await runQuery<{ placements: unknown[] } | null>(win, 'getNodeLocations', {
        nodeId: world.unplacedNode,
      })
      return row?.placements.length
    }).toBe(1)

    await openGallery(win)
    await openMenu(win, world.placedNode)
    await win.getByTestId('gallery-context-menu-tag').click()
    await expect(win.getByTestId('gallery-action-tag-input')).toBeVisible()
    await win.getByTestId('gallery-action-tag-input').fill('menu-tag')
    await win.keyboard.press('Enter')
    await expect(win.getByTestId('gallery-actions')).toContainText('#menu-tag added to 1 item')

    await openMenu(win, world.placedNode)
    await win.getByTestId('gallery-context-menu-trash').click()
    await expect(cell(win, world.placedNode)).toHaveCount(0)

    await openMenu(win, world.boardNode)
    await win.getByTestId('gallery-context-menu-dive').click()
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(world.boardCanvas)
  } finally {
    await app.close()
  }
})

test('fly goes direct for one place and opens a chooser for many', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-context-fly-')
  try {
    const world = await seed(win)
    await win.evaluate((id) => window.__ewNav!.navigateTo(id, 'Arena'), world.boardCanvas)
    await openGallery(win)

    await openMenu(win, world.placedNode)
    await win.getByTestId('gallery-context-menu-fly-to').click()
    await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(world.rootCanvas)

    await openGallery(win)
    await openMenu(win, world.multiNode)
    await win.getByTestId('gallery-context-menu-fly-to').click()
    await expect(win.getByTestId('gallery-placement-chooser')).toBeVisible()
    await win.getByTestId('gallery-placement-choice').filter({ hasText: 'Arena' }).click()
    await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(world.boardCanvas)
  } finally {
    await app.close()
  }
})
