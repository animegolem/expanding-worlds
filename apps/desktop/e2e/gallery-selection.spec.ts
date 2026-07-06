import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * §14.4 gallery bulk selection + action bar (AI-IMP-079, rev 0.25
 * mouse model): click selects one cell and sets the anchor,
 * Shift+click extends the LINEAR document-order range from the
 * anchor, Mod+click toggles membership without disturbing the
 * anchor. A non-empty selection summons the floating action bar
 * (count + tag · place · trash); Escape peels selection BEFORE the
 * takeover closes. Place reuses the §6.10 seam (070) — the takeover
 * closes first, then every selected node lands on the current
 * canvas with a cascade offset; single-cell drag-out mirrors the
 * outline rows. Trash runs §9.6 TrashNode over the selection.
 */

/** N bare nodes; returns ids in DOCUMENT order (the gallery index's
 * date sort), which is what the selection model ranges over. */
async function seedNodes(win: Page, count: number): Promise<string[]> {
  for (let i = 0; i < count; i += 1) {
    await exec(win, 'CreateNode', { nodeId: crypto.randomUUID() })
  }
  const index = await runQuery<Array<{ nodeId: string }>>(win, 'getGalleryIndex')
  return index.map((entry) => entry.nodeId)
}

async function openGallery(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
}

function cell(win: Page, nodeId: string) {
  return win.locator(`[data-testid="gallery-cell"][data-node-id="${nodeId}"]`)
}

function selectedCells(win: Page) {
  return win.locator('[data-testid="gallery-cell"][data-selected="true"]')
}

test('click / Shift linear range / Mod toggle; bar count; Escape peels before the takeover', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-sel-')
  const ids = await seedNodes(win, 8)
  await openGallery(win)

  // Plain click: exactly this cell, and the bar appears with count 1.
  await cell(win, ids[1]!).click()
  await expect(selectedCells(win)).toHaveCount(1)
  await expect(cell(win, ids[1]!)).toHaveAttribute('aria-selected', 'true')
  await expect(win.getByTestId('gallery-action-bar')).toBeVisible()
  await expect(win.getByTestId('gallery-action-count')).toHaveText('1')

  // Shift+click: the linear document-order range from the anchor.
  await cell(win, ids[4]!).click({ modifiers: ['Shift'] })
  await expect(selectedCells(win)).toHaveCount(4)
  for (const id of ids.slice(1, 5)) {
    await expect(cell(win, id)).toHaveAttribute('data-selected', 'true')
  }
  await expect(win.getByTestId('gallery-action-count')).toHaveText('4')

  // Mod+click toggles membership — off, then on elsewhere.
  await cell(win, ids[2]!).click({ modifiers: ['ControlOrMeta'] })
  await expect(cell(win, ids[2]!)).toHaveAttribute('data-selected', 'false')
  await expect(win.getByTestId('gallery-action-count')).toHaveText('3')
  await cell(win, ids[6]!).click({ modifiers: ['ControlOrMeta'] })
  await expect(win.getByTestId('gallery-action-count')).toHaveText('4')

  // ...without disturbing the anchor: the next Shift range still
  // extends from ids[1], replacing the toggled-in stragglers.
  await cell(win, ids[2]!).click({ modifiers: ['Shift'] })
  await expect(selectedCells(win)).toHaveCount(2)
  await expect(cell(win, ids[1]!)).toHaveAttribute('data-selected', 'true')
  await expect(cell(win, ids[2]!)).toHaveAttribute('data-selected', 'true')

  // The clear control empties the selection and dismisses the bar.
  await win.getByTestId('gallery-action-clear').click()
  await expect(selectedCells(win)).toHaveCount(0)
  await expect(win.getByTestId('gallery-action-bar')).toHaveCount(0)

  // Escape peels: selection first (takeover stays), takeover second.
  await cell(win, ids[0]!).click()
  await expect(win.getByTestId('gallery-action-bar')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(selectedCells(win)).toHaveCount(0)
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)

  await app.close()
})

test('bulk tag: one field, every selected node, name_key merge, duplicate skip, one toast', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-tag-')
  const ids = await seedNodes(win, 4)

  // Pre-carry: one node already has #ref, so the bulk assign must
  // skip it (AssignTagToNode rejects duplicates) and say so.
  const refTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: refTagId, name: 'ref' })
  await exec(win, 'AssignTagToNode', { tagId: refTagId, nodeId: ids[2]! })

  await openGallery(win)
  await cell(win, ids[0]!).click()
  await cell(win, ids[3]!).click({ modifiers: ['Shift'] })
  await expect(win.getByTestId('gallery-action-count')).toHaveText('4')

  // Existing name → merges by name_key onto the SAME tag record.
  await win.getByTestId('gallery-action-tag').click()
  await win.getByTestId('gallery-action-tag-input').fill('ref')
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('gallery-actions')).toContainText(
    '#ref added to 3 items — 1 already tagged',
  )
  const counts = await runQuery<Array<{ id: string; name: string; count: number }>>(
    win,
    'galleryTagCounts',
    { order: 'count' },
  )
  expect(counts.find((tag) => tag.name === 'ref')).toMatchObject({ id: refTagId, count: 4 })

  // New name → CreateTag first, then assign to all; selection
  // survived the project push, so the same four get it.
  await win.getByTestId('gallery-action-tag').click()
  await win.getByTestId('gallery-action-tag-input').fill('fresh-tag')
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('gallery-actions')).toContainText('#fresh-tag added to 4 items')
  const after = await runQuery<Array<{ name: string; count: number }>>(win, 'galleryTagCounts', {
    order: 'count',
  })
  expect(after.find((tag) => tag.name === 'fresh-tag')?.count).toBe(4)

  await app.close()
})

test('place: takeover closes first, the selection lands cascaded on the current canvas', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-place-')
  const ids = await seedNodes(win, 3)
  await openGallery(win)

  await cell(win, ids[0]!).click()
  await cell(win, ids[2]!).click({ modifiers: ['Shift'] })
  await win.getByTestId('gallery-action-place').click()

  // 070 precedent: close FIRST so the user watches the result land.
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(3)

  // The Workspace cascade: a bulk place never stacks invisibly at
  // dead center — three placements, three distinct positions.
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await runQuery<{ items: Array<Record<string, unknown>> } | null>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  const placements = (scene?.items ?? []).filter((item) => item['itemKind'] === 'placement')
  expect(placements).toHaveLength(3)
  expect(new Set(placements.map((p) => `${p['x']},${p['y']}`)).size).toBe(3)

  await app.close()
})

test('bulk trash: §9.6 over the selection, cells vanish, one summary toast', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-trash-')
  const ids = await seedNodes(win, 5)
  await openGallery(win)

  await cell(win, ids[1]!).click()
  await cell(win, ids[3]!).click({ modifiers: ['ControlOrMeta'] })
  await expect(win.getByTestId('gallery-action-count')).toHaveText('2')

  await win.getByTestId('gallery-action-trash').click()
  await expect(win.getByTestId('gallery-actions')).toContainText('Moved 2 to Trash')
  await expect(cell(win, ids[1]!)).toHaveCount(0)
  await expect(cell(win, ids[3]!)).toHaveCount(0)
  await expect(win.locator('[data-testid="gallery-cell"]')).toHaveCount(3)
  // Selection cleared with the action — the bar goes with it.
  await expect(win.getByTestId('gallery-action-bar')).toHaveCount(0)

  await app.close()
})

test('single-cell drag-out sets NODE_DRAG_MIME, closes at the cell edge, and the board accepts the drop', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-drag-')
  const ids = await seedNodes(win, 1)
  await openGallery(win)
  await expect(cell(win, ids[0]!)).toBeVisible()

  // Same synthesized HTML5 drag as the outline row test: dragstart on
  // the cell, dragover past its bounds (the takeover must close so
  // the board is visible), drop on the canvas host.
  await win.evaluate((nodeId) => {
    const dt = new DataTransfer()
    const el = document.querySelector(
      `[data-testid="gallery-cell"][data-node-id="${nodeId}"]`,
    )!
    const rect = el.getBoundingClientRect()
    el.dispatchEvent(
      new DragEvent('dragstart', {
        dataTransfer: dt,
        clientX: rect.left + 5,
        clientY: rect.top + 5,
        bubbles: true,
        cancelable: true,
      }),
    )
    document.body.dispatchEvent(
      new DragEvent('dragover', {
        dataTransfer: dt,
        clientX: rect.left + 5,
        clientY: rect.bottom + 80,
        bubbles: true,
        cancelable: true,
      }),
    )
    const host = document.querySelector('[data-testid="canvas-host"]')!
    const hostRect = host.getBoundingClientRect()
    host.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: hostRect.left + 200,
        clientY: hostRect.top + 160,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, ids[0]!)

  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)

  await app.close()
})
