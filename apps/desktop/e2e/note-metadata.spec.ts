import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery, seedPlacedNote } from './helpers'

/**
 * AI-IMP-119 acceptance (RFC §7.8): the system metadata block. A note
 * on a multi-board node shows a live Placements card whose entries fly
 * to their board; a system touch (rename re-key) persists the block
 * into the body as plain markdown; the per-note toggle governs it and
 * toggling off strips the block at the next touch; the editor never
 * shows the block.
 */

async function noteBody(win: Page, noteId: string): Promise<string> {
  const note = await runQuery<{ body: string }>(win, 'getNote', { noteId })
  return note.body
}

test('multi-board placements card flies to boards and a rename persists the block', async () => {
  const { app, win } = await launchApp('ew-e2e-note-metadata-')
  const rootCanvas = await win.evaluate(() => window.__ewDebug!.canvasId())

  // The subject note's node: placed twice on Home and once on a nested
  // board → 3 placements across 2 boards (§7.8 acceptance).
  const { noteId, nodeId } = await seedPlacedNote(win, 'Multi', 'the prose', { x: 300, y: 240 })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvas,
    nodeId,
    x: 500,
    y: 240,
  })

  // A nested board: a new node owning its own canvas, placed on Home.
  const boardNode = crypto.randomUUID()
  const childCanvas = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: boardNode })
  await exec(win, 'CreateCanvas', { canvasId: childCanvas, nodeId: boardNode })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvas,
    nodeId: boardNode,
    x: 700,
    y: 240,
  })
  // The subject node also lives on the nested board.
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: childCanvas,
    nodeId,
    x: 40,
    y: 40,
  })

  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements >= 3)

  // Open the note panel on the subject placement.
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Multi/)

  // The metadata card shows a Placements tree grouped by board.
  await expect(win.getByTestId('note-metadata-card')).toBeVisible()
  await expect(win.getByTestId('metadata-placements')).toBeVisible()
  const boards = win.getByTestId('metadata-board')
  await expect(boards).toHaveCount(2)

  // The editor holds prose only — never the block.
  await expect(win.getByTestId('note-editor')).toContainText('the prose')
  await expect(win.getByTestId('note-editor')).not.toContainText('Placements')

  // Fly-to: the nested board is labelled by its owner node's short
  // code (it has no note); clicking that entry navigates to its canvas.
  const homeRow = boards.filter({ hasText: 'Home' })
  await expect(homeRow).toHaveCount(1)
  const otherRow = boards.filter({ hasNotText: 'Home' }).first()
  await otherRow.click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(childCanvas)

  // A system touch (rename re-key) persists the block into the body.
  await exec(win, 'RenameNote', { noteId, title: 'Multi Renamed' })
  await expect
    .poll(async () => (await noteBody(win, noteId)).includes('<!-- ew:metadata -->'))
    .toBe(true)
  const body = await noteBody(win, noteId)
  expect(body).toContain('## Placements')
  expect(body).toContain('- Home (2)')
  expect(body).toMatch(/^the prose\n\n---\n/)

  await app.close()
})

test('per-note toggle off strips the block at the next system touch', async () => {
  const { app, win } = await launchApp('ew-e2e-note-metadata-toggle-')
  const { noteId } = await seedPlacedNote(win, 'Toggle Me', 'body text', { x: 300, y: 240 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-metadata-card')).toBeVisible()

  // Persist a block first via a system touch.
  await exec(win, 'RenameNote', { noteId, title: 'Toggle Me v2' })
  await expect
    .poll(async () => (await noteBody(win, noteId)).includes('<!-- ew:metadata -->'))
    .toBe(true)

  // Toggle the note off — the card body hides, but the persisted block
  // is NOT stripped yet (only at the next system touch).
  await expect(win.getByTestId('metadata-toggle')).toHaveText('On')
  await win.getByTestId('metadata-toggle').click()
  await expect(win.getByTestId('metadata-toggle')).toHaveText('Off')
  await expect(win.getByTestId('metadata-placements')).toHaveCount(0)
  expect(await noteBody(win, noteId)).toContain('<!-- ew:metadata -->')

  // The next system touch strips it.
  await exec(win, 'RenameNote', { noteId, title: 'Toggle Me v3' })
  await expect
    .poll(async () => (await noteBody(win, noteId)).includes('<!-- ew:metadata -->'))
    .toBe(false)
  expect(await noteBody(win, noteId)).toBe('body text')

  await app.close()
})
