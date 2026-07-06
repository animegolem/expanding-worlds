import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * §14.4 gallery keyboard model (AI-IMP-080, rev 0.25): the grid
 * keeps a cursor (focus ring, roving tabindex) distinct from the
 * selection highlight. Plain arrows move it and collapse selection
 * — Left/Right walk document order wrapping across rows, Up/Down
 * move by visual column with nearest-column mapping; Shift+arrows
 * extend the SAME linear range Shift+click computes; Mod+Space
 * toggles membership without disturbing the anchor while bare Space
 * stays RESERVED for preview; Mod+A selects the current filter
 * scope; Enter is the kind-appropriate primary action; Delete runs
 * the action bar's trash; PageUp/Down page the viewport.
 *
 * Bucket math (cross-bucket hops, Mod+Up/Down jumps) needs entries
 * in different date buckets, and commands cannot backdate
 * created_at — every seed lands in "today". Those paths are covered
 * by the gallery-keys.ts vitest unit over the same row structure;
 * here Mod+Down is asserted as a same-bucket no-op.
 */

async function seedNodes(win: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await exec(win, 'CreateNode', { nodeId: crypto.randomUUID() })
  }
}

/** Current document order (the gallery index's date sort). */
async function indexIds(win: Page): Promise<string[]> {
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

/** Visual column count, measured off the rendered first row. */
async function columnCount(win: Page): Promise<number> {
  return win.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-testid="gallery-cell"]')] as HTMLElement[]
    const top = cells[0]!.getBoundingClientRect().top
    return cells.filter((c) => c.getBoundingClientRect().top === top).length
  })
}

async function scrollTop(win: Page): Promise<number> {
  return win.evaluate(
    () => document.querySelector('[data-testid="gallery-scroller"]')!.scrollTop,
  )
}

test('cursor arrows: document-order walk with row wrap, nearest-column Up/Down, column memory', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-key-nav-')
  await seedNodes(win, 16)
  await openGallery(win)
  await expect
    .poll(() => win.locator('[data-testid="gallery-cell"]').count())
    .toBeGreaterThan(10)

  // Force a RAGGED grid: measure the column count, then top up the
  // seed until the last row holds exactly one cell (total ≡ 1 mod
  // columns; 16 guarantees at least two full rows above it).
  const columns = await columnCount(win)
  const topUp = (1 - (16 % columns) + columns) % columns
  if (topUp > 0) await seedNodes(win, topUp)
  const ids = await indexIds(win)
  const total = ids.length
  expect(total % columns).toBe(1)
  expect(total).toBeGreaterThanOrEqual(2 * columns + 1)
  await expect(win.locator('[data-testid="gallery-cell"]')).toHaveCount(total)

  // Plain click parks the cursor; the ring is the cursor's, not the
  // selection's (data attributes drive both assertions).
  await cell(win, ids[0]!).click()
  await expect(cell(win, ids[0]!)).toHaveAttribute('data-cursor', 'true')
  await expect(cell(win, ids[0]!)).toHaveAttribute('tabindex', '0')

  // ArrowRight walks document order and WRAPS the row boundary:
  // `columns` presses from ids[0] land on row 2's first cell.
  for (let i = 0; i < columns; i += 1) await win.keyboard.press('ArrowRight')
  await expect(cell(win, ids[columns]!)).toHaveAttribute('data-cursor', 'true')
  // ...and each plain move collapsed the selection to the cursor.
  await expect(selectedCells(win)).toHaveCount(1)
  await expect(cell(win, ids[columns]!)).toHaveAttribute('data-selected', 'true')

  // ArrowUp moves by visual column (col 0, row 2 → col 0, row 1).
  await win.keyboard.press('ArrowUp')
  await expect(cell(win, ids[0]!)).toHaveAttribute('data-cursor', 'true')

  // Nearest-column mapping into the short last row, and the
  // remembered column on the way back out. Last full row's last
  // cell sits at index lastRowStart-1; the short row holds only
  // ids[total-1] (column 0).
  const lastRowStart = total - 1
  await cell(win, ids[lastRowStart - 1]!).click() // last column of the full row above
  await win.keyboard.press('ArrowDown')
  await expect(cell(win, ids[total - 1]!)).toHaveAttribute('data-cursor', 'true')
  await win.keyboard.press('ArrowUp')
  await expect(cell(win, ids[lastRowStart - 1]!)).toHaveAttribute('data-cursor', 'true')

  // Edges clamp: Left at the very first cell stays put.
  await cell(win, ids[0]!).click()
  await win.keyboard.press('ArrowLeft')
  await expect(cell(win, ids[0]!)).toHaveAttribute('data-cursor', 'true')

  await app.close()
})

test('Shift+arrows extend the anchor range (agrees with Shift+click); Mod+Space toggles; bare Space is reserved', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-key-sel-')
  await seedNodes(win, 30)
  await openGallery(win)
  await expect
    .poll(() => win.locator('[data-testid="gallery-cell"]').count())
    .toBeGreaterThan(10)
  const columns = await columnCount(win)
  const ids = await indexIds(win)

  // Shift+Down twice: the linear document-order range from the
  // anchor through the landing cell.
  await cell(win, ids[0]!).click()
  await win.keyboard.press('Shift+ArrowDown')
  await win.keyboard.press('Shift+ArrowDown')
  await expect(selectedCells(win)).toHaveCount(2 * columns + 1)
  await expect(cell(win, ids[2 * columns]!)).toHaveAttribute('data-cursor', 'true')

  // The SAME range Shift+click computes from the same anchor.
  await cell(win, ids[0]!).click()
  await cell(win, ids[2 * columns]!).click({ modifiers: ['Shift'] })
  await expect(selectedCells(win)).toHaveCount(2 * columns + 1)

  // Mod+Space toggles the cursor cell without moving the anchor:
  // toggle ids[0] off (bar folds), then Shift+ArrowRight still
  // ranges from ids[0].
  await cell(win, ids[0]!).click()
  await win.keyboard.press('ControlOrMeta+Space')
  await expect(selectedCells(win)).toHaveCount(0)
  await expect(win.getByTestId('gallery-action-bar')).toHaveCount(0)
  await win.keyboard.press('Shift+ArrowRight')
  await expect(selectedCells(win)).toHaveCount(2)
  await expect(cell(win, ids[0]!)).toHaveAttribute('data-selected', 'true')
  await expect(cell(win, ids[1]!)).toHaveAttribute('data-selected', 'true')

  // Bare Space does NOTHING — reserved for preview: selection,
  // cursor, and viewport all hold still.
  const beforeTop = await scrollTop(win)
  await win.keyboard.press('Space')
  await expect(selectedCells(win)).toHaveCount(2)
  await expect(cell(win, ids[1]!)).toHaveAttribute('data-cursor', 'true')
  expect(await scrollTop(win)).toBe(beforeTop)

  await app.close()
})

test('Mod+A selects exactly the current filter scope', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-key-scope-')
  // One board among the bare (note-kind) nodes: the kind facet can
  // narrow the scope below the whole project.
  const boardNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateCanvas', { canvasId: crypto.randomUUID(), nodeId: boardNode })
  await seedNodes(win, 7)
  await openGallery(win)
  await expect(win.locator('[data-testid="gallery-cell"]')).toHaveCount(8)

  // Unfiltered: Mod+A = everything the grid shows.
  const ids = await indexIds(win)
  await cell(win, ids[0]!).click()
  await win.keyboard.press('ControlOrMeta+a')
  await expect(selectedCells(win)).toHaveCount(8)
  await expect(win.getByTestId('gallery-action-count')).toHaveText('8')

  // Active facet (kind = note): the scope is what the user SEES —
  // the board is outside it.
  await win.getByTestId('gallery-kind-note').click()
  await expect(win.locator('[data-testid="gallery-cell"]')).toHaveCount(7)
  const noteIds = await win
    .locator('[data-testid="gallery-cell"]')
    .evaluateAll((cells) => cells.map((c) => (c as HTMLElement).dataset['nodeId']!))
  await cell(win, noteIds[0]!).click()
  await win.keyboard.press('ControlOrMeta+a')
  await expect(selectedCells(win)).toHaveCount(7)
  await expect(win.getByTestId('gallery-action-count')).toHaveText('7')

  await app.close()
})

test('Enter runs the kind-appropriate primary action per kind', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-key-enter-')

  const boardNode = crypto.randomUUID()
  const boardCanvas = crypto.randomUUID()
  const boardNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateNote', { noteId: boardNote, title: 'Ruins Board' })
  await exec(win, 'AttachNoteToNode', { nodeId: boardNode, noteId: boardNote })
  await exec(win, 'CreateCanvas', { canvasId: boardCanvas, nodeId: boardNode })

  const notedNode = crypto.randomUUID()
  const clipNote = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: notedNode })
  await exec(win, 'CreateNote', { noteId: clipNote, title: 'Clipping', body: 'saved text' })
  await exec(win, 'AttachNoteToNode', { nodeId: notedNode, noteId: clipNote })

  const bareNode = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: bareNode })

  // Note-carrying entry: panels mount UNDER the takeover, so the
  // takeover closes to reveal the opened note (outline precedent).
  await openGallery(win)
  await cell(win, notedNode).click()
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toContainText('Clipping')

  // Note-less entry: §8.4 create-on-demand — the §8.5 phantom
  // panel, an empty editor that persists nothing until the first
  // committed edit.
  await openGallery(win)
  await cell(win, bareNode).click()
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect(win.getByTestId('canvas-phantom')).toBeVisible()
  const node = await runQuery<{ noteId: string | null }>(win, 'getNode', { nodeId: bareNode })
  expect(node.noteId).toBeNull() // nothing persisted yet

  // Board-kind entry: close the takeover and DIVE.
  await openGallery(win)
  await cell(win, boardNode).click()
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(boardCanvas)

  await app.close()
})

test('Delete trashes via the action bar path; PageUp/Down page; fields keep their keys; Mod+Down no-ops in one bucket', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-key-del-')
  await seedNodes(win, 60)
  await openGallery(win)
  await expect
    .poll(() => win.locator('[data-testid="gallery-cell"]').count())
    .toBeGreaterThan(10)
  const ids = await indexIds(win)

  // The action bar's completion field keeps its own keys: Delete
  // and arrows inside the tag input never reach the grid.
  await cell(win, ids[0]!).click()
  await win.getByTestId('gallery-action-tag').click()
  await win.getByTestId('gallery-action-tag-input').fill('draft')
  await win.keyboard.press('Delete')
  await win.keyboard.press('ArrowLeft')
  await expect(win.getByTestId('gallery-action-count')).toHaveText('1')
  await expect(cell(win, ids[0]!)).toHaveAttribute('data-cursor', 'true')
  await expect(cell(win, ids[0]!)).toHaveCount(1) // nothing trashed
  await win.keyboard.press('Escape') // peel the field, keep the selection

  // Delete on the grid = the action bar's trash, same toast.
  await cell(win, ids[0]!).click()
  await win.keyboard.press('Shift+ArrowRight')
  await expect(win.getByTestId('gallery-action-count')).toHaveText('2')
  await win.keyboard.press('Delete')
  await expect(win.getByTestId('gallery-actions')).toContainText('Moved 2 to Trash')
  await expect(cell(win, ids[0]!)).toHaveCount(0)
  await expect(cell(win, ids[1]!)).toHaveCount(0)
  await expect(win.getByTestId('gallery-action-bar')).toHaveCount(0)

  // PageDown/PageUp page the viewport by its own height.
  await cell(win, ids[2]!).click()
  expect(await scrollTop(win)).toBe(0)
  await win.keyboard.press('PageDown')
  await expect.poll(() => scrollTop(win)).toBeGreaterThan(0)
  await win.keyboard.press('PageUp')
  await expect.poll(() => scrollTop(win)).toBe(0)

  // Everything seeded today = one bucket: Mod+Down has no next
  // header to jump to and holds still (multi-bucket jumps are
  // unit-covered in gallery-keys.test.ts).
  await cell(win, ids[2]!).click()
  await win.keyboard.press('ControlOrMeta+ArrowDown')
  await expect(cell(win, ids[2]!)).toHaveAttribute('data-cursor', 'true')
  expect(await scrollTop(win)).toBe(0)

  await app.close()
})
