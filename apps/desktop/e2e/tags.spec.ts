import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * AI-IMP-071 acceptance: the §4.8 tag panel. Two doors land on one
 * surface (the charm bar's # chips and a note panel's tag chips); the
 * panel lists every carrier — unplaced included, with a loose badge —
 * with locations; fly-to on another canvas is a §8.1 navigation event
 * that centers the placement and leaves a Back entry; the header lens
 * toggle drives the 072 lens for the tag's carriers on the active
 * canvas and unsets when Escape peels the lens engine-side.
 */

const DIM = 0.25 // LENS_DIM_ALPHA

interface TagWorld {
  rootCanvasId: string
  boardBCanvasId: string
  ruinsTagId: string
  placementA: string
  placementB: string
  otherPlacement: string
  carrierANodeId: string
  carrierBNodeId: string
  unplacedNodeId: string
  untaggedNodeId: string
}

/** Root board: carrier A ("Watcher", noted) + an untagged node.
 * Board B ("Ruins Board"): carrier B. Carrier C stays unplaced.
 * Tag "ruins" on A, B, C; tag "camp" on the untagged node. */
async function seedTagWorld(win: Page): Promise<TagWorld & { campTagId: string }> {
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  const ownerNodeId = crypto.randomUUID()
  const ownerNoteId = crypto.randomUUID()
  const boardBCanvasId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: ownerNoteId, title: 'Ruins Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: ownerNodeId })
  await exec(win, 'AttachNoteToNode', { nodeId: ownerNodeId, noteId: ownerNoteId })
  await exec(win, 'CreateCanvas', { canvasId: boardBCanvasId, nodeId: ownerNodeId })

  const carrierANodeId = crypto.randomUUID()
  const noteAId = crypto.randomUUID()
  const placementA = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: noteAId, title: 'Watcher', body: '' })
  await exec(win, 'CreateNode', { nodeId: carrierANodeId })
  await exec(win, 'AttachNoteToNode', { nodeId: carrierANodeId, noteId: noteAId })
  await exec(win, 'CreatePlacement', {
    placementId: placementA,
    canvasId: rootCanvasId,
    nodeId: carrierANodeId,
    x: 150,
    y: 150,
    width: 40,
    height: 40,
  })

  const carrierBNodeId = crypto.randomUUID()
  const placementB = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: carrierBNodeId })
  await exec(win, 'CreatePlacement', {
    placementId: placementB,
    canvasId: boardBCanvasId,
    nodeId: carrierBNodeId,
    x: 300,
    y: 200,
    width: 40,
    height: 40,
  })

  const unplacedNodeId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: unplacedNodeId })

  const untaggedNodeId = crypto.randomUUID()
  const otherPlacement = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: untaggedNodeId })
  await exec(win, 'CreatePlacement', {
    placementId: otherPlacement,
    canvasId: rootCanvasId,
    nodeId: untaggedNodeId,
    x: 400,
    y: 300,
    width: 40,
    height: 40,
  })

  const ruinsTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: ruinsTagId, name: 'ruins' })
  for (const nodeId of [carrierANodeId, carrierBNodeId, unplacedNodeId])
    await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId })
  const campTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: campTagId, name: 'camp' })
  await exec(win, 'AssignTagToNode', { tagId: campTagId, nodeId: untaggedNodeId })

  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(2)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  return {
    rootCanvasId,
    boardBCanvasId,
    ruinsTagId,
    placementA,
    placementB,
    otherPlacement,
    carrierANodeId,
    carrierBNodeId,
    unplacedNodeId,
    untaggedNodeId,
    campTagId,
  }
}

test('charm-bar door: carriers with locations, lens toggle, layered Escape, cross-canvas fly-to with Back (§4.8)', async () => {
  const { app, win } = await launchApp('ew-e2e-tags-')
  const world = await seedTagWorld(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Door 1: select carrier A, pop its tag chips from the charm bar,
  // click the "ruins" chip.
  await win.mouse.click(box.x + 150, box.y + 150)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([world.placementA])
  await win.getByTestId('charm-tags').click()
  await win.getByTestId(`tag-chip-${world.ruinsTagId}`).click()
  const panel = win.getByTestId('tag-panel')
  await expect(panel).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')

  // Every carrier is a row — the unplaced one wears the loose badge —
  // and locations print with canvas labels ("here" on this board).
  await expect(panel.getByTestId('tag-panel-row')).toHaveCount(3)
  const unplacedRow = panel.locator(`[data-node-id="${world.unplacedNodeId}"]`)
  await expect(unplacedRow.getByTestId('badge-loose')).toBeVisible()
  const rowA = panel.locator(`[data-node-id="${world.carrierANodeId}"]`)
  await expect(rowA).toContainText('Watcher')
  await expect(rowA.getByTestId(`tag-row-fly-${world.placementA}`)).toContainText('Home')
  await expect(rowA.getByTestId(`tag-row-fly-${world.placementA}`)).toContainText('here')
  const rowB = panel.locator(`[data-node-id="${world.carrierBNodeId}"]`)
  await expect(rowB.getByTestId(`tag-row-fly-${world.placementB}`)).toContainText('Ruins Board')

  // Lens toggle ON: only carrier placements on the ACTIVE canvas are
  // members; the untagged neighbor dims to the engine's factor.
  await win.getByTestId('tag-panel-lens').click()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.lens()))
    .toEqual([world.placementA])
  expect(
    await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), world.otherPlacement),
  ).toBe(DIM)
  await expect(win.getByTestId('tag-panel-lens')).toHaveAttribute('aria-pressed', 'true')

  // A live lens follows the carrier set: assigning the tag to the
  // dimmed neighbor retargets the lens on the project-change refresh
  // — it must not keep dimming yesterday's placements.
  await exec(win, 'AssignTagToNode', { tagId: world.ruinsTagId, nodeId: world.untaggedNodeId })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.lens()?.slice().sort() ?? null))
    .toEqual([world.placementA, world.otherPlacement].sort())
  await expect(panel.getByTestId('tag-panel-row')).toHaveCount(4)

  // Layered Escape, one layer per press: the lens peels first (the
  // toggle follows via onLensChanged; the panel stays), the panel
  // closes next — and consumes the press, so the selection survives.
  await win.keyboard.press('Escape')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.lens())).toBeNull()
  await expect(panel).toBeVisible()
  await expect(win.getByTestId('tag-panel-lens')).toHaveAttribute('aria-pressed', 'false')
  await win.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  expect(await win.evaluate(() => window.__ewDebug!.selection())).toEqual([world.placementA])

  // Reopen (replaces): the same door summons the panel again.
  await win.getByTestId('charm-tags').click()
  await win.getByTestId(`tag-chip-${world.ruinsTagId}`).click()
  await expect(panel).toBeVisible()

  // Cross-canvas fly-to: a §8.1 navigation event — Board B becomes a
  // history entry — then the placement is selected and centered once
  // the destination scene applies.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: -20, y: -10, zoom: 1 }))
  await win.getByTestId(`tag-row-fly-${world.placementB}`).click()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.boardBCanvasId)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([world.placementB])
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().map((entry) => entry.canvasId),
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav.entries).toEqual([world.rootCanvasId, world.boardBCanvasId])
  expect(nav.cursor).toBe(1)
  await expect
    .poll(async () => {
      const camera = await win.evaluate(() => window.__ewDebug!.camera())
      const centerX = camera.x + box.width / (2 * camera.zoom)
      const centerY = camera.y + box.height / (2 * camera.zoom)
      return Math.hypot(centerX - 300, centerY - 200)
    })
    .toBeLessThan(30)

  // Back returns to the root board with its viewport restored.
  await win.evaluate(() => window.__ewNav!.back())
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.rootCanvasId)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera()))
    .toEqual({ x: -20, y: -10, zoom: 1 })

  // Same-canvas fly-to selects and centers WITHOUT a new history
  // entry (§8.1: only cross-canvas jumps are navigation events).
  await win.getByTestId(`tag-row-fly-${world.placementA}`).click()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([world.placementA])
  await expect
    .poll(async () => {
      const camera = await win.evaluate(() => window.__ewDebug!.camera())
      const centerX = camera.x + box.width / (2 * camera.zoom)
      const centerY = camera.y + box.height / (2 * camera.zoom)
      return Math.hypot(centerX - 150, centerY - 150)
    })
    .toBeLessThan(30)
  const navAfter = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().length,
    cursor: window.__ewNav!.cursor(),
  }))
  expect(navAfter).toEqual({ entries: 2, cursor: 0 })

  // Per-row open-note: carrier A's ¶ opens its note in a panel.
  await win.getByTestId(`tag-row-note-${world.carrierANodeId}`).click()
  await expect(win.getByTestId('note-pane-title')).toContainText('Watcher')

  await app.close()
})

test('note-panel door opens the panel; the completion field swaps the tag (§4.8)', async () => {
  const { app, win } = await launchApp('ew-e2e-tags-note-')
  const world = await seedTagWorld(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Door 2: open carrier A's note (double-click), then click the
  // "ruins" chip in the note panel's header chips.
  await win.mouse.dblclick(box.x + 150, box.y + 150)
  await expect(win.getByTestId('panel-tag-chips')).toBeVisible()
  await win.getByTestId(`panel-tag-chip-${world.ruinsTagId}`).click()
  const panel = win.getByTestId('tag-panel')
  await expect(panel).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')
  await expect(panel.getByTestId('tag-panel-row')).toHaveCount(3)

  // Exactly one tag at a time: typing offers name completion from the
  // project vocabulary; picking one swaps the whole panel to it.
  const input = win.getByTestId('tag-panel-input')
  await input.fill('ca')
  await expect(win.getByTestId('tag-panel-option')).toHaveText('camp')
  await win.getByTestId('tag-panel-option').click()
  await expect(input).toHaveValue('camp')
  await expect(panel.getByTestId('tag-panel-row')).toHaveCount(1)
  // The camp carrier (untagged by "ruins") is placed on the root
  // board — its location line renders, and the lens toggle stays
  // enabled because it has a placement here.
  await expect(
    panel.getByTestId(`tag-row-fly-${world.otherPlacement}`),
  ).toContainText('Home')
  await expect(win.getByTestId('tag-panel-lens')).toBeEnabled()

  await app.close()
})
