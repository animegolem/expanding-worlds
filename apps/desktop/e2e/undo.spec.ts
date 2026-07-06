import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery, seedPlacedNote } from './helpers'

/**
 * AI-IMP-114 acceptance (RFC-0001 §10.2): the in-renderer structural
 * undo/redo stack. Mod+Z reverts committed CANVAS commands one gesture
 * at a time and Shift+Mod+Z replays them; a batch delete is one entry;
 * a §7.2 materialization un-materializes in one step; note-body typing
 * never routes text history into the structural stack (CodeMirror owns
 * it); and the ☰ rows flip live with stack depth.
 */

interface PlacementLite {
  id: string
  nodeId: string
  x: number
  y: number
}

async function placements(win: Page): Promise<PlacementLite[]> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await runQuery<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  return scene.items
    .filter((item) => item['itemKind'] === 'placement')
    .map((item) => ({
      id: item['id'] as string,
      nodeId: item['nodeId'] as string,
      x: item['x'] as number,
      y: item['y'] as number,
    }))
}

async function seedPlacement(
  win: Page,
  at: { x: number; y: number },
  size = 44,
): Promise<{ nodeId: string; placementId: string }> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: at.x,
    y: at.y,
    width: size,
    height: size,
  })
  return { nodeId, placementId }
}

async function readyUndo(win: Page): Promise<void> {
  await win.waitForFunction(() => window.__ewUndo !== undefined)
}

const depth = (win: Page) => win.evaluate(() => window.__ewUndo!.undoDepth())

test('move → Mod+Z restores, Shift+Mod+Z reapplies', async () => {
  const { app, win } = await launchApp('ew-e2e-undo-move-')
  await readyUndo(win)
  await seedPlacement(win, { x: 150, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const before = (await placements(win))[0]!

  // Drag it +120 in x — one TransformContent through the host gateway.
  await win.mouse.move(box.x + before.x + 12, box.y + before.y + 12)
  await win.mouse.down()
  await win.mouse.move(box.x + before.x + 132, box.y + before.y + 12, { steps: 6 })
  await win.mouse.up()
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x + 120),
  )
  expect(await depth(win)).toBe(1)

  // Undo: back to the original position; the entry moves to redo.
  await win.keyboard.press('Meta+z')
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x),
  )
  expect(await depth(win)).toBe(0)

  // Redo: the move reapplies.
  await win.keyboard.press('Meta+Shift+z')
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x + 120),
  )
  expect(await depth(win)).toBe(1)

  await app.close()
})

test('delete-batch is one entry: one Mod+Z restores every item', async () => {
  const { app, win } = await launchApp('ew-e2e-undo-delete-')
  await readyUndo(win)
  await seedPlacement(win, { x: 150, y: 150 })
  await seedPlacement(win, { x: 320, y: 160 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Marquee both, then Delete → one DeleteContent (AI-IMP-028 batch).
  await win.mouse.move(box.x + 80, box.y + 80)
  await win.mouse.down()
  await win.mouse.move(box.x + 420, box.y + 260, { steps: 6 })
  await win.mouse.up()
  await win.keyboard.press('Delete')
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(0)
  expect(await depth(win)).toBe(1)

  // One undo brings all of them back.
  await win.keyboard.press('Meta+z')
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(2)
  expect(await depth(win)).toBe(0)

  await app.close()
})

test('materialization: one Mod+Z un-materializes note + node + placement (§7.2)', async () => {
  const { app, win } = await launchApp('ew-e2e-undo-materialize-')
  await readyUndo(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // §6.2 pin tool → phantom draft → first committed edit is one CreatePin.
  await win.keyboard.press('n')
  await win.mouse.click(box.x + 400, box.y + 300)
  await expect(win.getByTestId('pin-phantom')).toBeVisible()
  await win.getByTestId('pin-phantom-draft').fill('Undo Phantom')
  await win.getByTestId('pin-phantom-draft').blur()
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(1)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Undo Phantom/)
  await expect.poll(() => depth(win)).toBe(1)

  // Blur the editor so Mod+Z is structural, not CodeMirror's history.
  await win.mouse.click(box.x + 80, box.y + 80)
  await win.keyboard.press('Meta+z')

  // The record un-exists in one step: node + placement gone.
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(0)
  expect(await depth(win)).toBe(0)

  await app.close()
})

test('note-body typing never enters the structural stack; Mod+Z defers to the editor', async () => {
  const { app, win } = await launchApp('ew-e2e-undo-defer-')
  await readyUndo(win)
  await seedPlacedNote(win, 'Kestrel', 'a small hawk', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const before = (await placements(win))[0]!

  // A structural entry: nudge the placement.
  await win.mouse.move(box.x + before.x, box.y + before.y)
  await win.mouse.down()
  await win.mouse.move(box.x + before.x + 90, box.y + before.y, { steps: 6 })
  await win.mouse.up()
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x + 90),
  )
  expect(await depth(win)).toBe(1)

  // Open the note and type — UpdateNote autosave must NOT be captured.
  await win.mouse.dblclick(box.x + before.x + 90, box.y + before.y)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Kestrel/)
  await win.locator('.cm-content').click()
  await win.keyboard.type(' that hovers')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible()
  expect(await depth(win)).toBe(1)

  // Mod+Z while the editor holds focus is CodeMirror's — the structural
  // stack is untouched and the placement does not move.
  await win.keyboard.press('Meta+z')
  await expect(win.getByTestId('note-editor')).toBeVisible()
  expect(await depth(win)).toBe(1)
  expect(Math.round((await placements(win))[0]!.x)).toBe(Math.round(before.x + 90))

  // Focus the board; now Mod+Z reverts the move.
  await win.mouse.click(box.x + 60, box.y + 60)
  await win.keyboard.press('Meta+z')
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x),
  )
  expect(await depth(win)).toBe(0)

  await app.close()
})

test('place-on-board (§8.5) is captured across gateways and Mod+Z reverts it', async () => {
  // PlaceAsCard commits through the note pane's OWN gateway, not the
  // canvas host's — the capture must span gateways for one undo to work.
  const { app, win } = await launchApp('ew-e2e-undo-placecard-')
  await readyUndo(win)
  await seedPlacedNote(win, 'Quayside', 'stone and salt', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Quayside/)
  await win.getByTestId('panel-pin').click()
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1)
  await win.getByTestId('panel-place-on-board').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(2)
  await expect.poll(() => depth(win)).toBe(1)

  // One structural undo removes the card placement.
  await win.mouse.click(box.x + 60, box.y + 60)
  await win.keyboard.press('Meta+z')
  await expect.poll(() => placements(win).then((p) => p.length)).toBe(1)
  expect(await depth(win)).toBe(0)

  await app.close()
})

test('the ☰ Undo/Redo rows flip live with stack depth', async () => {
  const { app, win } = await launchApp('ew-e2e-undo-menu-')
  await readyUndo(win)
  await seedPlacement(win, { x: 150, y: 150 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const before = (await placements(win))[0]!

  // Empty stack: both rows disabled.
  await win.getByTestId('charm-menu').click()
  await expect(win.getByTestId('menu-undo')).toHaveAttribute('aria-disabled', 'true')
  await expect(win.getByTestId('menu-redo')).toHaveAttribute('aria-disabled', 'true')
  await win.keyboard.press('Escape')

  // A move enables Undo.
  await win.mouse.move(box.x + before.x + 12, box.y + before.y + 12)
  await win.mouse.down()
  await win.mouse.move(box.x + before.x + 112, box.y + before.y + 12, { steps: 6 })
  await win.mouse.up()
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x + 100),
  )

  await win.getByTestId('charm-menu').click()
  await expect(win.getByTestId('menu-undo')).toHaveAttribute('aria-disabled', 'false')
  await expect(win.getByTestId('menu-redo')).toHaveAttribute('aria-disabled', 'true')
  // Clicking the row performs the undo and closes the menu.
  await win.getByTestId('menu-undo').click()
  await expect.poll(async () => Math.round((await placements(win))[0]!.x)).toBe(
    Math.round(before.x),
  )

  await app.close()
})
