import { expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import { exec, launchApp, revealTitleStrip, revision, runQuery } from './helpers'
import type { Page } from '@playwright/test'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-069 acceptance: the ▤ outline (RFC §14.1) — canvas ▸
 * children with page/frame glyphs, alias rows where containment
 * cycles back onto the expansion path, the root-level loose bin,
 * and the three filter chips.
 */

async function seedWorld(win: Page): Promise<{
  boardACanvasId: string
  rootCanvasId: string
}> {
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // A bare tagged image-less node placed on the root board.
  const bare = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: bare })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: bare,
  })
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId, nodeId: bare })

  // Board A (titled) on the root; board B on A; A placed back on B —
  // a legal containment cycle (§4.4) the outline must alias.
  const nodeA = crypto.randomUUID()
  const noteA = crypto.randomUUID()
  const boardACanvasId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: noteA, title: 'Ruins Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: nodeA })
  await exec(win, 'AttachNoteToNode', { nodeId: nodeA, noteId: noteA })
  await exec(win, 'CreateCanvas', { canvasId: boardACanvasId, nodeId: nodeA })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: nodeA,
  })
  const nodeB = crypto.randomUUID()
  const boardBCanvasId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: boardBCanvasId, nodeId: nodeB })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: boardACanvasId,
    nodeId: nodeB,
  })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: boardBCanvasId,
    nodeId: nodeA,
  })

  // Unplaced material: a stashed node and an unattached note.
  await exec(win, 'CreateNode', { nodeId: crypto.randomUUID() })
  await exec(win, 'CreateNote', {
    noteId: crypto.randomUUID(),
    title: 'Adrift Thought',
    body: '',
  })

  return { boardACanvasId, rootCanvasId }
}

test('outline: tree with alias rows, loose bin, and filter chips (§14.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-')
  const { rootCanvasId } = await seedWorld(win)

  await win.getByTestId('charm-outline').click()
  const outline = win.getByTestId('outline-view')
  await expect(outline).toBeVisible()

  // Root section renders expanded with both children: the bare node
  // (short-code title, no glyphs) and Ruins Board (¶ + ⊡).
  const rootSection = win.getByTestId(`outline-canvas-${rootCanvasId}`)
  await expect(rootSection).toBeVisible()
  await expect(rootSection.getByTestId('outline-child-row')).toHaveCount(2)
  const boardRow = rootSection
    .getByTestId('outline-child-row')
    .filter({ hasText: 'Ruins Board' })
  await expect(boardRow).toHaveCount(1)

  // Unfold A, then B: B's child A is already on the expansion path
  // and renders as an alias row, not another unfold.
  await boardRow.getByTestId('outline-expand').click()
  const bRow = rootSection.getByTestId('outline-child-row').nth(2)
  await bRow.getByTestId('outline-expand').click()
  const alias = win.getByTestId('outline-alias-row')
  await expect(alias).toHaveCount(1)
  await expect(alias).toContainText('Ruins Board')
  await alias.click() // flies to the real entry, never unfolds

  // The loose bin holds the stashed node (loose + orphan) and the
  // unattached note (loose).
  const bin = win.getByTestId('outline-loose-bin')
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(1)
  await expect(bin.getByTestId('loose-node-row').getByTestId('badge-orphan')).toBeVisible()
  await expect(bin.getByTestId('loose-note-row')).toHaveCount(1)
  await expect(bin.getByTestId('loose-note-row')).toContainText('Adrift Thought')

  // hide content-less drops the bare image row, keeps Ruins Board.
  await win.getByTestId('outline-filter-contentless').click()
  await expect(rootSection.getByTestId('outline-child-row').first()).toContainText('Ruins Board')
  await win.getByTestId('outline-filter-contentless').click()

  // disconnected: in the tree only orphans remain (loose lives in
  // the bin, which stays).
  await win.getByTestId('outline-filter-disconnected').click()
  for (const row of await rootSection.getByTestId('outline-child-row').all()) {
    await expect(row).not.toContainText('Ruins Board')
  }
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(1)
  await win.getByTestId('outline-filter-disconnected').click()

  // one tag: type into the filter (completion offers the tag), pick
  // it — only the tagged bare node survives, in tree and bin.
  await win.getByTestId('outline-filter-tag').click()
  await win.keyboard.type('ru')
  await expect(win.getByTestId('outline-tag-option')).toHaveText('ruins')
  await win.getByTestId('outline-tag-option').click()
  await expect(win.getByTestId('outline-filter-tag')).toHaveValue('ruins')
  await expect(rootSection.getByTestId('outline-child-row')).toHaveCount(1)
  await expect(rootSection.getByTestId('outline-child-row')).not.toContainText('Ruins Board')
  await expect(bin.getByTestId('loose-node-row')).toHaveCount(0)

  await app.close()
})

/** Placements of one canvas, via the scene read model. */
async function canvasPlacements(
  win: Page,
  canvasId: string,
): Promise<Array<Record<string, unknown>>> {
  const scene = await runQuery<{ items: Array<Record<string, unknown>> } | null>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  return (scene?.items ?? []).filter((item) => item['itemKind'] === 'placement')
}

/** Content commands since a revision — camera persistence commits at
 * machine-dependent times and is not content (see slice.spec). */
async function contentCommandsSince(win: Page, sinceRevision: number): Promise<string[]> {
  const log = await runQuery<Array<{ commandType: string }>>(win, 'listCommandLog', {
    sinceRevision,
  })
  return log.map((row) => row.commandType).filter((type) => type !== 'SetCanvasCamera')
}

/**
 * AI-IMP-070 acceptance: outline rows are the §6.10 placement
 * sources. Place on Current Canvas from the loose bin (slice item
 * 21's recovered material), drag a note row onto the board at a
 * specific point (one CreatePin, cleanly undoable), dive on canvas
 * rows through navigateTo, open notes from note rows — and the
 * interim Sources panel is gone from the title strip.
 */
test('outline placement flows: place, drag to board, dive, open note (§6.10)', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-place-')
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // Board A on the root (the dive target), one unplaced node in the
  // loose bin, one zero-node note.
  const nodeA = crypto.randomUUID()
  const noteA = crypto.randomUUID()
  const boardACanvasId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: noteA, title: 'Ruins Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: nodeA })
  await exec(win, 'AttachNoteToNode', { nodeId: nodeA, noteId: noteA })
  const looseNodeId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: looseNodeId })
  const looseNoteId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: looseNoteId, title: 'Adrift Thought', body: '' })
  await exec(win, 'CreateCanvas', { canvasId: boardACanvasId, nodeId: nodeA })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: nodeA,
  })

  // ---- Place on Current Canvas from the loose bin: the takeover
  // closes and exactly ONE CreatePlacement lands at the view center.
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  const revBeforePlace = await revision(win)
  const expectedCenter = await win.evaluate(() => {
    const cam = window.__ewDebug!.camera()
    const rect = document.querySelector('[data-testid="canvas-host"]')!.getBoundingClientRect()
    return { x: rect.width / 2 / cam.zoom + cam.x, y: rect.height / 2 / cam.zoom + cam.y }
  })
  await win
    .locator(`[data-testid="loose-node-row"][data-node-id="${looseNodeId}"]`)
    .getByTestId('outline-place-node')
    .click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect
    .poll(async () =>
      (await canvasPlacements(win, rootCanvasId)).filter((p) => p['nodeId'] === looseNodeId),
    )
    .toHaveLength(1)
  expect(await contentCommandsSince(win, revBeforePlace)).toEqual(['CreatePlacement'])
  const recovered = (await canvasPlacements(win, rootCanvasId)).find(
    (p) => p['nodeId'] === looseNodeId,
  )!
  expect(recovered['x'] as number).toBeCloseTo(expectedCenter.x, 0)
  expect(recovered['y'] as number).toBeCloseTo(expectedCenter.y, 0)

  // ---- Canvas rows dive via navigateTo: a history entry, not a
  // camera trick.
  await win.getByTestId('charm-outline').click()
  await win
    .locator(`[data-testid="outline-child-row"][data-node-id="${nodeA}"]`)
    .getByTestId('outline-row-activate')
    .click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(boardACanvasId)
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries(),
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav.cursor).toBe(1)
  expect(nav.entries[1]!.canvasId).toBe(boardACanvasId)

  // ---- Drag the loose note row onto the board: dragging past the
  // row closes the takeover, and the drop lands ONE CreatePin at the
  // drop's world point.
  await win.getByTestId('charm-outline').click()
  const revBeforeDrop = await revision(win)
  const dropPoint = await win.evaluate((noteId) => {
    const dt = new DataTransfer()
    const row = document.querySelector(
      `[data-testid="loose-note-row"][data-note-id="${noteId}"]`,
    )!
    const rowRect = row.getBoundingClientRect()
    row.dispatchEvent(
      new DragEvent('dragstart', {
        dataTransfer: dt,
        clientX: rowRect.left + 5,
        clientY: rowRect.top + 5,
        bubbles: true,
        cancelable: true,
      }),
    )
    // Past the row's edge: the board must become visible for the drop.
    document.body.dispatchEvent(
      new DragEvent('dragover', {
        dataTransfer: dt,
        clientX: rowRect.left + 5,
        clientY: rowRect.bottom + 80,
        bubbles: true,
        cancelable: true,
      }),
    )
    const host = document.querySelector('[data-testid="canvas-host"]')!
    const rect = host.getBoundingClientRect()
    const cam = window.__ewDebug!.camera()
    host.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: rect.left + 240,
        clientY: rect.top + 200,
        bubbles: true,
        cancelable: true,
      }),
    )
    return { x: 240 / cam.zoom + cam.x, y: 200 / cam.zoom + cam.y }
  }, looseNoteId)
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect.poll(async () => (await canvasPlacements(win, boardACanvasId)).length).toBe(1)
  const pin = (await canvasPlacements(win, boardACanvasId))[0]!
  expect(pin).toMatchObject({
    appearanceKind: 'dot',
    appearanceColor: '#8a94a0',
    noteTitle: 'Adrift Thought',
    labelVisible: 1,
  })
  expect(pin['x'] as number).toBeCloseTo(dropPoint.x, 0)
  expect(pin['y'] as number).toBeCloseTo(dropPoint.y, 0)
  expect(await contentCommandsSince(win, revBeforeDrop)).toEqual(['CreatePin'])

  // One command per drop → its single inverse removes pin AND
  // placement together; the ATTACHED note survives, loose again.
  await exec(win, 'DeleteDraftPin', { nodeId: pin['nodeId'], placementId: pin['id'] })
  await expect.poll(async () => (await canvasPlacements(win, boardACanvasId)).length).toBe(0)
  const looseAgain = await runQuery<Array<{ id: string }>>(win, 'listLooseNotes')
  expect(looseAgain.some((note) => note.id === looseNoteId)).toBe(true)

  // ---- Note rows open the note panel.
  await win.getByTestId('charm-outline').click()
  await win
    .locator(`[data-testid="loose-note-row"][data-note-id="${looseNoteId}"]`)
    .getByTestId('outline-row-activate')
    .click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Adrift Thought/)

  // ---- The title strip no longer offers Sources (panel retired).
  await revealTitleStrip(win)
  await expect(win.getByTestId('toggle-sources')).toHaveCount(0)

  await app.close()
})
