import { expect, test } from '@playwright/test'
import { exec, launchApp, runQuery, seedPlacedNote } from './helpers'

/**
 * AI-IMP-084 acceptance (RFC §4.6 rev 0.31 + §8.5): the note card is
 * the fourth appearance kind. Place-on-board on a pinned panel flips
 * a dot node to the card, lands a placement roughly under the panel,
 * and closes the panel (one-way, like phantom → note); note edits
 * repaint the card through the ordinary scene refresh; selecting a
 * card whose note has an open panel flashes that panel. Icon/image
 * nodes place as-is — their look already represents them.
 */

interface SceneItem {
  id: string
  itemKind: string
  nodeId: string
  x: number
  y: number
  appearanceKind: string | null
  noteTitle: string | null
  noteExcerpt?: string | null
  width: number | null
  height: number | null
}

async function sceneItems(win: Awaited<ReturnType<typeof launchApp>>['win']): Promise<SceneItem[]> {
  const scene = await runQuery<{ items: SceneItem[] }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  return scene.items.filter((item) => item.itemKind === 'placement')
}

test('place-on-board: dot flips to card, edits repaint, selection flashes the panel', async () => {
  const { app, win } = await launchApp('ew-e2e-card-')
  const { noteId, nodeId } = await seedPlacedNote(win, 'Harbor', 'stone quay under gulls', {
    x: 400,
    y: 300,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Open the note tethered, then pin: the place-on-board control is
  // the pinned panel's escalation step (§8.5) — absent while tethered.
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await expect(win.getByTestId('panel-place-on-board')).toHaveCount(0)
  await win.getByTestId('panel-pin').click()
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1)

  // Place on board: the panel closes and the world owns a card.
  await win.getByTestId('panel-place-on-board').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(2)

  // Appearance is node-owned (§4.6): BOTH placements now wear the
  // card — title plus the clamped body excerpt, default card rect.
  const cards = (await sceneItems(win)).filter((item) => item.appearanceKind === 'card')
  expect(cards).toHaveLength(2)
  for (const card of cards) {
    expect(card.nodeId).toBe(nodeId)
    expect(card.noteTitle).toBe('Harbor')
    expect(card.noteExcerpt).toBe('stone quay under gulls')
    expect(card.width).toBe(260)
    expect(card.height).toBe(160)
  }
  // The new placement landed roughly under the panel, not at the
  // node: somewhere else on the board than the original 400,300.
  const placed = cards.find((card) => !(card.x === 400 && card.y === 300))!
  expect(placed).toBeTruthy()

  // A later note edit flows the ordinary scene refresh: the card
  // repaints from the updated projection.
  await exec(win, 'UpdateNote', { noteId, body: 'rewritten quay under lamplight' })
  await expect
    .poll(async () =>
      (await sceneItems(win)).filter(
        (item) =>
          item.appearanceKind === 'card' &&
          item.noteExcerpt === 'rewritten quay under lamplight',
      ).length,
    )
    .toBe(2)

  // Mutual highlight: with the note open in a panel, selecting a card
  // placement of that note flashes the panel (§8.5 counterpart of the
  // source-node halo).
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await expect(win.locator('.note-panel.pulse')).toHaveCount(0) // no passive highlight
  // Click the PLACED card left of the tethered panel's column (the
  // panel hangs right of the original card's rect — stay clear).
  await win.mouse.click(box.x + placed.x - 100, box.y + placed.y + 40)
  await expect(win.locator('.note-panel.pulse')).toHaveCount(1)
  const selected = await win.evaluate(() => window.__ewDebug!.selection())
  expect(selected).toContain(placed.id)
  // The flash is a pulse, not a state: it clears on its own, and
  // nothing highlights while neither side is active.
  await expect(win.locator('.note-panel.pulse')).toHaveCount(0)

  await app.close()
})

test('image nodes place as-is: their look already represents them (§4.6)', async () => {
  const { app, win } = await launchApp('ew-e2e-cardimg-')

  // A REAL imported asset (gallery idiom) so the image appearance is
  // valid end to end.
  const { assetId } = await win.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 48)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(40, 120, 200)'
    ctx.fillRect(0, 0, 64, 48)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'blue.png' })
    if (!result.ok) throw new Error('seed import failed')
    return { assetId: result.assetId }
  })
  const nodeId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'SetNodeAppearance', {
    nodeId,
    appearance: { kind: 'image', assetId, crop: null },
  })
  await exec(win, 'CreateNote', { noteId, title: 'Reference', body: 'blue study' })
  await exec(win, 'AttachNoteToNode', { nodeId, noteId })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId,
    nodeId,
    x: 400,
    y: 300,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Reference/)
  // §8.5 rev 0.55 (AI-IMP-135): an image-anchored note opens as the
  // BOUND page, where the pin verb is the TEAR (panel-tear).
  await win.getByTestId('panel-tear').click()
  await win.getByTestId('panel-place-on-board').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(2)

  // The image node kept its appearance — no card flip, two image
  // placements.
  const items = await sceneItems(win)
  expect(items.filter((item) => item.appearanceKind === 'image')).toHaveLength(2)
  expect(items.filter((item) => item.appearanceKind === 'card')).toHaveLength(0)
  const node = await runQuery<{ appearanceKind: string | null }>(win, 'getNodeLocations', {
    nodeId,
  })
  expect(node.appearanceKind).toBe('image')

  await app.close()
})
