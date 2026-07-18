import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * AI-IMP-239 acceptance (RFC §8.4): "New board…" is one gesture. A
 * right-click on empty board offers the verb; it opens the command
 * palette (AI-IMP-211) as a create-only naming prompt; typing a name and
 * pressing Enter runs ONE undo group — CreateNode + CreateNoteAndAttach
 * (the pin wizard's naming path) + CreateCanvas + CreatePlacement — then
 * dives into the new board. The origin board keeps the named board-object
 * (which wears the dive hint the moment its node owns a canvas), and a
 * single Mod+Z FROM THE ORIGIN board reverses node + canvas + placement.
 */

interface SceneItem {
  id: string
  itemKind: string
  nodeId: string
  noteTitle: string | null
  childCanvasId: string | null
}

const canvasId = (win: Page): Promise<string> =>
  win.evaluate(() => window.__ewDebug!.canvasId())

const readyUndo = (win: Page): Promise<void> =>
  win.waitForFunction(() => window.__ewUndo !== undefined).then(() => undefined)

async function placements(win: Page, id: string): Promise<SceneItem[]> {
  const scene = await runQuery<{ items: SceneItem[] }>(win, 'getCanvasScene', { canvasId: id })
  return scene.items.filter((i) => i.itemKind === 'placement')
}

async function enterBoardMenu(win: Page): Promise<void> {
  await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'ground')
  await win.getByTestId('ctx-board').click()
  await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'board')
}

async function beginBoardBirth(
  win: Page,
  box: { x: number; y: number },
  title: string,
): Promise<void> {
  await win.mouse.click(box.x + 700, box.y + 460, { button: 'right' })
  await enterBoardMenu(win)
  await win.getByTestId('ctx-new-board').click()
  await win.getByTestId('new-board-query').fill(title)
  await win.getByTestId('new-board-query').press('Enter')
  await expect(win.getByTestId('board-birth-ghost')).toBeVisible()
  await win.mouse.click(box.x + 620, box.y + 380)
}

/** True when the canvas no longer exists (its scene is absent). */
async function canvasAbsent(win: Page, id: string): Promise<boolean> {
  return win.evaluate(async (canvas) => {
    const r = await window.ew.project.query('getCanvasScene', { canvasId: canvas })
    return !r.ok || r.result === null
  }, id)
}

test('New board…: verb → palette → name+Enter → dive, one Mod+Z reverses it (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-new-board-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const origin = await canvasId(win)

    // Right-click empty board → HERE → Board…; the canonical board
    // inventory leads with New board….
    await win.mouse.click(box.x + 700, box.y + 460, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    await enterBoardMenu(win)
    await expect(win.getByTestId('ctx-new-board')).toBeVisible()

    // The verb opens the command palette as a create-only naming prompt.
    await win.getByTestId('ctx-new-board').click()
    await expect(win.getByTestId('new-board')).toBeVisible()
    await win.getByTestId('new-board-query').fill('Harbor District')
    await expect(win.getByTestId('new-board-create')).toBeVisible()
    await win.getByTestId('new-board-query').press('Enter')
    await expect(win.getByTestId('board-birth-ghost')).toBeVisible()
    await win.mouse.click(box.x + 620, box.y + 380)

    // We dive into the new board — the path bar shows it and the live
    // canvas has swapped away from the origin.
    await expect.poll(() => canvasId(win)).not.toBe(origin)
    const newCanvas = await canvasId(win)
    await expect(win.getByTestId('nav-crumb-1')).toHaveText('Harbor District')

    // The whole act is ONE undo entry, and the sole navigating-undo
    // exception flies out before deleting the board under our feet.
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(1)
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => canvasId(win)).toBe(origin)
    await expect.poll(() => placements(win, origin).then((p) => p.length)).toBe(0)
    expect(await canvasAbsent(win, newCanvas)).toBe(true)

    // Redo is intentionally non-navigating and reconstructs the birth.
    await win.evaluate(() => window.__ewUndo!.redo())
    await expect.poll(() => placements(win, origin).then((p) => p.length)).toBe(1)
    const seeded = await placements(win, origin)
    expect(seeded).toHaveLength(1)
    expect(seeded[0]!.noteTitle).toBe('Harbor District')
    expect(seeded[0]!.childCanvasId).toBe(newCanvas)
    const nodeId = seeded[0]!.nodeId

    // ONE Mod+Z from the origin removes the redone birth without a flight.
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => placements(win, origin).then((p) => p.length)).toBe(0)
    expect(await canvasAbsent(win, newCanvas)).toBe(true)
    const node = await win.evaluate(async (id) => {
      const r = await window.ew.project.query('getNode', { nodeId: id })
      return !r.ok || r.result === null
    }, nodeId)
    expect(node).toBe(true)
  } finally {
    await app.close()
  }
})

test('New board… carry: Escape abandons renderer memory and creates nothing', async () => {
  const { app, win } = await launchApp('ew-e2e-new-board-carry-esc-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const origin = await canvasId(win)
    await win.mouse.click(box.x + 700, box.y + 460, { button: 'right' })
    await enterBoardMenu(win)
    await win.getByTestId('ctx-new-board').click()
    await win.getByTestId('new-board-query').fill('Never Born')
    await win.getByTestId('new-board-query').press('Enter')
    await expect(win.getByTestId('board-birth-ghost')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('board-birth-ghost')).toHaveCount(0)
    expect(await canvasId(win)).toBe(origin)
    expect(await placements(win, origin)).toHaveLength(0)
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(0)
  } finally {
    await app.close()
  }
})

test('New board… refused seat keeps the carry alive; Escape leaves nothing', async () => {
  const { app, win } = await launchApp('ew-e2e-new-board-refused-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const origin = await canvasId(win)
    await win.mouse.click(box.x + 700, box.y + 460, { button: 'right' })
    await enterBoardMenu(win)
    await win.getByTestId('ctx-new-board').click()
    await win.getByTestId('new-board-query').fill('Try Again')
    await win.getByTestId('new-board-query').press('Enter')
    await win.evaluate(() => window.__ewDebug!.failNextCommand('CreateCanvas'))
    await win.mouse.click(box.x + 620, box.y + 380)
    await expect(win.getByTestId('board-birth-ghost')).toBeVisible()
    await expect(win.getByTestId('board-birth-error')).not.toHaveText('')
    expect(await placements(win, origin)).toHaveLength(0)
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('board-birth-ghost')).toHaveCount(0)
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(0)
    expect(await win.evaluate(() => window.__ewUndo!.redoDepth())).toBe(0)
  } finally {
    await app.close()
  }
})

test('New board… palette: Escape cancels cleanly, leaving the board untouched (§8.3/183)', async () => {
  const { app, win } = await launchApp('ew-e2e-new-board-esc-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const origin = await canvasId(win)

    await win.mouse.click(box.x + 700, box.y + 460, { button: 'right' })
    await enterBoardMenu(win)
    await win.getByTestId('ctx-new-board').click()
    await expect(win.getByTestId('new-board')).toBeVisible()
    await win.getByTestId('new-board-query').fill('Discarded')

    await win.keyboard.press('Escape')
    await expect(win.getByTestId('new-board')).toBeHidden()
    // Nothing was created: same board, no placement, no undo entry.
    expect(await canvasId(win)).toBe(origin)
    expect(await placements(win, origin)).toHaveLength(0)
    expect(await win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(0)
  } finally {
    await app.close()
  }
})

test('trashed board title collision names Trash and honors Cancel, Keep both, and Restore', async () => {
  const { app, win } = await launchApp('ew-e2e-board-title-trash-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const origin = await canvasId(win)

    await beginBoardBirth(win, box, 'warren')
    await expect.poll(() => canvasId(win)).not.toBe(origin)
    const original = (await placements(win, origin))[0]!
    await exec(win, 'TrashNode', { nodeId: original.nodeId })
    await win.evaluate((id) => window.__ewNav!.navigateTo(id, 'Home'), origin)
    await expect.poll(() => canvasId(win)).toBe(origin)

    // Cancel means exactly cancel: the carry exits and no replacement is born.
    await beginBoardBirth(win, box, 'warren')
    await expect(win.getByTestId('board-title-conflict-dialog')).toContainText(
      'A board named “warren” is in the Trash.',
    )
    await win.getByTestId('board-conflict-cancel').click()
    await expect(win.getByTestId('board-birth-ghost')).toHaveCount(0)
    await expect(win.getByTestId('board-title-conflict-dialog')).toHaveCount(0)
    await expect.poll(() => placements(win, origin).then((rows) => rows.length)).toBe(0)

    // Keep both allocates the first free space-separated suffix and seats
    // the new board at the original click.
    await beginBoardBirth(win, box, 'warren')
    await expect(win.getByTestId('board-conflict-keep-both')).toContainText('warren 2')
    await win.getByTestId('board-conflict-keep-both').click()
    await expect.poll(() => canvasId(win)).not.toBe(origin)
    await expect(win.getByTestId('path-bar').locator('button.crumb.current')).toHaveText('warren 2')
    await expect.poll(() => placements(win, origin).then((rows) => rows.map((row) => row.noteTitle))).toEqual([
      'warren 2',
    ])

    // The original conflict remains independently recoverable. Restore
    // exits the ghost and navigates to the revived board aggregate.
    await win.evaluate((id) => window.__ewNav!.navigateTo(id, 'Home'), origin)
    await expect.poll(() => canvasId(win)).toBe(origin)
    await beginBoardBirth(win, box, 'warren')
    await win.evaluate(() => window.__ewDebug!.failNextCommand('RestoreRecord'))
    await win.getByTestId('board-conflict-restore').click()
    await expect(win.getByTestId('board-title-conflict-dialog').getByRole('alert')).toContainText(
      'retry restoring the board',
    )
    await expect(win.getByTestId('board-birth-ghost')).toBeVisible()
    expect(await canvasId(win)).toBe(origin)
    await win.getByTestId('board-conflict-restore').click()
    await expect.poll(() => canvasId(win)).toBe(original.childCanvasId)
    await expect(win.getByTestId('path-bar').locator('button.crumb.current')).toHaveText('warren')
    await expect(win.getByTestId('board-birth-ghost')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
