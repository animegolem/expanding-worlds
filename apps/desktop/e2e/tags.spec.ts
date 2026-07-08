import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

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

/**
 * AI-IMP-108: "assign at the moment of arranging" (§4.8 rev 0.45). The
 * `#` charm popover and the note panel's chip row both carry the shared
 * completing add-field — novel text creates-and-assigns in one gesture,
 * a prefix completes an existing tag and assigns it by name_key (no
 * duplicate row), and a data-level undo (UnassignTagFromNode, the
 * inverse of AssignTagToNode) removes the assignment.
 */
test('board `#` popover: create-and-assign novel, complete existing, reopen after undo (§4.8 rev 0.45)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-add-board-')
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
  // An existing tag in the vocabulary to complete against.
  await exec(win, 'CreateTag', { tagId: crypto.randomUUID(), name: 'ruins' })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Select the node, open the `#` popover — the add-field is there.
  await win.mouse.click(box.x + 200, box.y + 200)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
  await win.getByTestId('charm-tags').click()
  await expect(win.getByTestId('charm-tag-chips')).toBeVisible()
  const addInput = win.getByTestId('charm-tag-add-input')
  await expect(addInput).toBeVisible()

  // Novel name → created and assigned in one gesture; the chip appears
  // WITHOUT reselecting the node.
  await addInput.fill('harbor')
  await addInput.press('Enter')
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#harbor')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])

  // Prefix of the existing tag completes; picking it assigns by
  // name_key — no duplicate tag row is created.
  await addInput.fill('ru')
  await expect(win.getByTestId('charm-tag-add-option')).toHaveText('ruins')
  await win.getByTestId('charm-tag-add-option').click()
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#ruins')

  const tags = await runQuery<Array<{ id: string; name: string }>>(win, 'listNodeTags', { nodeId })
  expect(tags.map((t) => t.name).sort()).toEqual(['harbor', 'ruins'])
  // "ruins" existed; "harbor" is the only new tag — the completion did
  // not mint a second "ruins".
  expect(await runQuery<unknown[]>(win, 'listTags')).toHaveLength(2)

  // One undo removes the assignment; reopening the popover re-queries
  // and the harbor chip is gone while ruins remains.
  const harbor = tags.find((t) => t.name === 'harbor')!
  await exec(win, 'UnassignTagFromNode', { tagId: harbor.id, nodeId })
  await win.getByTestId('charm-tags').click() // close
  await win.getByTestId('charm-tags').click() // reopen → re-query
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#ruins')
  await expect(win.getByTestId('charm-tag-chip-row')).not.toContainText('#harbor')

  await app.close()
})

test('note panel add-field: complete existing, create-and-assign novel, one undo removes it (§4.8 rev 0.45)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-add-note-')
  const world = await seedTagWorld(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Open carrier A's note; chips PLUS the add-field show (ruins is on).
  await win.mouse.dblclick(box.x + 150, box.y + 150)
  await expect(win.getByTestId('panel-tag-chips')).toBeVisible()
  await expect(win.getByTestId('tag-add-field')).toBeVisible()
  await expect(win.getByTestId(`panel-tag-chip-${world.ruinsTagId}`)).toBeVisible()

  const addInput = win.getByTestId('tag-add-input')

  // Complete an existing tag by prefix → assigned by name_key, no dupe.
  await addInput.fill('ca')
  await expect(win.getByTestId('tag-add-option')).toHaveText('camp')
  await win.getByTestId('tag-add-option').click()
  await expect(win.getByTestId(`panel-tag-chip-${world.campTagId}`)).toBeVisible()

  // Novel name → create-and-assign in one gesture; the chip appears.
  await addInput.fill('harbor')
  await addInput.press('Enter')
  await expect(win.getByTestId('panel-tag-chips')).toContainText('#harbor')

  const tags = await runQuery<Array<{ id: string; name: string }>>(win, 'listNodeTags', {
    nodeId: world.carrierANodeId,
  })
  expect(tags.map((t) => t.name).sort()).toEqual(['camp', 'harbor', 'ruins'])

  // One undo (the inverse of AssignTagToNode): the panel refreshes on
  // the project change and the harbor chip vanishes; ruins remains.
  const harbor = tags.find((t) => t.name === 'harbor')!
  await exec(win, 'UnassignTagFromNode', { tagId: harbor.id, nodeId: world.carrierANodeId })
  await expect(win.getByTestId('panel-tag-chips')).not.toContainText('#harbor')
  await expect(win.getByTestId(`panel-tag-chip-${world.ruinsTagId}`)).toBeVisible()

  await app.close()
})

/**
 * AI-IMP-169 (§17 item 8 "rename a tag"): RenameTag has no UI verb yet
 * (AI-IMP-171) — this proves the command's rename flows into every live
 * surface that re-queries: the charm chip row, the completion
 * vocabulary, and the tag panel reached through the renamed chip. Tag
 * identity is independent of name (§4.8), so the same tagId carries
 * the assignment across the rename.
 */
test('RenameTag propagates: chip row, completion vocabulary, panel reopen (§17 item 8)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-rename-')
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId, nodeId })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Before: the carrier's chip row reads #ruins.
  await win.mouse.click(box.x + 200, box.y + 200)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
  await win.getByTestId('charm-tags').click()
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#ruins')

  await exec(win, 'RenameTag', { tagId, name: 'wrecks' })

  // The chip row re-queries on reopen: new name only, same chip id.
  await win.getByTestId('charm-tags').click() // close
  await win.getByTestId('charm-tags').click() // reopen → re-query
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#wrecks')
  await expect(win.getByTestId('charm-tag-chip-row')).not.toContainText('#ruins')

  // The completion vocabulary followed: the new name completes, the
  // old name is nobody's prefix anymore.
  const addInput = win.getByTestId('charm-tag-add-input')
  await addInput.fill('wr')
  await expect(win.getByTestId('charm-tag-add-option')).toHaveText('wrecks')
  await addInput.fill('ru')
  await expect(win.getByTestId('charm-tag-add-option')).toHaveCount(0)
  await addInput.fill('')

  // The panel reached through the SAME tag id opens under the new
  // name with the assignment intact.
  await win.getByTestId(`tag-chip-${tagId}`).click()
  await expect(win.getByTestId('tag-panel')).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('wrecks')
  await expect(win.getByTestId('tag-panel').getByTestId('tag-panel-row')).toHaveCount(1)

  await app.close()
})

/**
 * AI-IMP-171 (§17 item 8 "rename a tag"): the UI verb. The tag panel's
 * pencil swaps the completion switcher into an editor for THIS tag's
 * name — Enter commits RenameTag through the command gateway; the same
 * propagation 169 proved (chip row, completion vocabulary, panel) now
 * flows from a user gesture. Renaming onto an existing name is refused
 * with a toast naming the collision and the editor stays open; Escape
 * cancels the edit without leaking to the canvas.
 */
test('UI rename: pencil → edit → Enter renames across surfaces; conflict toasts and keeps the editor open (§17 item 8, AI-IMP-171)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-rename-ui-')
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
  const ruinsTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: ruinsTagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId })
  // A second tag to collide with on rename.
  await exec(win, 'CreateTag', { tagId: crypto.randomUUID(), name: 'camp' })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Open the tag panel via the charm door.
  await win.mouse.click(box.x + 200, box.y + 200)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
  await win.getByTestId('charm-tags').click()
  await win.getByTestId(`tag-chip-${ruinsTagId}`).click()
  const panel = win.getByTestId('tag-panel')
  await expect(panel).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')

  // Pencil → edit mode: the switcher becomes a rename editor, prefilled
  // with the current name, and the pencil reads pressed.
  await win.getByTestId('tag-panel-rename').click()
  const renameInput = win.getByTestId('tag-panel-rename-input')
  await expect(renameInput).toBeVisible()
  await expect(renameInput).toHaveValue('ruins')
  await expect(win.getByTestId('tag-panel-rename')).toHaveAttribute('aria-pressed', 'true')
  // The switcher input is not present while editing (distinct modes).
  await expect(win.getByTestId('tag-panel-input')).toHaveCount(0)

  // Collision: renaming onto an existing name is REFUSED — a toast names
  // the collision and the editor stays open for a retype.
  await renameInput.fill('camp')
  await renameInput.press('Enter')
  await expect(win.getByTestId('toast')).toContainText('camp')
  await expect(renameInput).toBeVisible()
  await expect(renameInput).toHaveValue('camp')

  // A real rename: Enter commits and the editor returns to the switcher
  // under the new name.
  await renameInput.fill('wrecks')
  await renameInput.press('Enter')
  await expect(win.getByTestId('tag-panel-rename-input')).toHaveCount(0)
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('wrecks')
  // Tag identity is independent of name (§4.8): the same tag id still
  // carries the assignment, so the carrier row survives.
  await expect(panel.getByTestId('tag-panel-row')).toHaveCount(1)

  // Propagation (§17 item 8), now from a UI gesture: close the panel
  // (Escape consumes the press — selection survives), then the charm
  // chip row and completion vocabulary read the new name.
  await win.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await expect(win.evaluate(() => window.__ewDebug!.selection())).resolves.toEqual([placementId])
  // Clicking the ruins chip folded the charm popover; one click reopens
  // it, re-querying the vocabulary.
  await win.getByTestId('charm-tags').click()
  await expect(win.getByTestId('charm-tag-chips')).toBeVisible()
  await expect(win.getByTestId('charm-tag-chip-row')).toContainText('#wrecks')
  await expect(win.getByTestId('charm-tag-chip-row')).not.toContainText('#ruins')
  const addInput = win.getByTestId('charm-tag-add-input')
  await addInput.fill('wr')
  await expect(win.getByTestId('charm-tag-add-option')).toHaveText('wrecks')
  await addInput.fill('ru')
  await expect(win.getByTestId('charm-tag-add-option')).toHaveCount(0)

  await app.close()
})

/**
 * AI-IMP-171: Escape while the rename editor is open cancels the edit
 * WITHOUT leaking to the canvas or closing the panel (the Escape-leak
 * defect family, SearchPanel:328). One press peels the editor; the next
 * peels the panel.
 */
test('UI rename: Escape cancels the edit, leaving the panel open and the name unchanged (§17 item 8, AI-IMP-171)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-rename-esc-')
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: 200,
    y: 200,
    width: 60,
    height: 60,
  })
  const ruinsTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: ruinsTagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.click(box.x + 200, box.y + 200)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([placementId])
  await win.getByTestId('charm-tags').click()
  await win.getByTestId(`tag-chip-${ruinsTagId}`).click()
  const panel = win.getByTestId('tag-panel')
  await expect(panel).toBeVisible()

  await win.getByTestId('tag-panel-rename').click()
  const renameInput = win.getByTestId('tag-panel-rename-input')
  await expect(renameInput).toBeVisible()
  await renameInput.fill('wrecks')

  // Escape peels the editor only: the panel stays, the name is
  // unchanged, and the selection underneath is untouched (no leak).
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('tag-panel-rename-input')).toHaveCount(0)
  await expect(panel).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')
  await expect(win.evaluate(() => window.__ewDebug!.selection())).resolves.toEqual([placementId])
  // No RenameTag ran: the vocabulary still holds only "ruins".
  expect(await runQuery<unknown[]>(win, 'listTags')).toHaveLength(1)

  // A second Escape peels the panel.
  await win.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()

  await app.close()
})

test('a phantom note panel carries no tag add-field (§4.8, AI-IMP-108)', async () => {
  const { app, win } = await launchApp('ew-e2e-tag-add-phantom-')
  // The board's own note draft is a phantom until the first edit.
  await win.getByTestId('corner-charm').click()
  await expect(win.getByTestId('canvas-phantom')).toBeVisible()
  await expect(win.getByTestId('tag-add-field')).toHaveCount(0)
  await expect(win.getByTestId('panel-tag-chips')).toHaveCount(0)
  await app.close()
})
