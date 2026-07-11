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

test('outliner grammar: tree, flattened cleanup, calm badges, lens, and fold survival', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-')
  const { rootCanvasId } = await seedWorld(win)

  await win.getByTestId('charm-outline').click()
  const outline = win.getByTestId('outline-view')
  await expect(outline).toBeVisible()

  const tree = win.getByTestId('outline-tree')
  const rootRow = tree.locator(`[data-canvas="${rootCanvasId}"]`).first()
  await expect(rootRow).toContainText('Home')
  const bareRow = tree.getByTestId('outline-child-row').filter({ hasText: 'untitled node' }).first()
  await expect(bareRow).toContainText('·orphan')
  await expect(bareRow).not.toContainText(/[0-9a-f]{8}-[0-9a-f-]{27}/i)
  const boardRow = tree.getByTestId('outline-child-row').filter({ hasText: 'Ruins Board' })
  await expect(boardRow).toHaveCount(1)
  await boardRow.getByTestId('outline-row-activate').click()
  await expect(win.getByTestId('outline-filmstrip-glyph')).toBeVisible()

  // Unfold A, then B: B's child A is already on the expansion path
  // and renders as an alias row, not another unfold.
  await boardRow.getByTestId('outline-expand').click()
  const bRow = tree.getByTestId('outline-child-row').filter({ hasText: 'unnamed · 1 items' })
  await bRow.getByTestId('outline-expand').click()
  const alias = win.getByTestId('outline-alias-row')
  await expect(alias).toHaveCount(1)
  await expect(alias).toContainText('Ruins Board')
  await alias.click() // flies to the real entry, never unfolds

  // The loose bin holds the stashed node (loose + orphan) and the
  // unattached note (loose).
  await expect(win.getByTestId('outline-loose-bin')).toContainText('loose')
  await expect(tree.getByTestId('loose-node-row')).toHaveCount(1)
  await expect(tree.getByTestId('loose-node-row').getByTestId('badge-orphan')).toBeVisible()
  await expect(tree.getByTestId('loose-note-row')).toContainText('Adrift Thought')
  await tree.getByTestId('loose-note-row').getByTestId('outline-row-activate').click()
  const disabledFly = win.locator('[data-testid="outline-preview-verbs"] [data-verb-id="fly-to"]')
  await expect(disabledFly).toBeDisabled()
  await expect(win.getByTestId('outline-preview-verbs')).toContainText('no placements to fly to')

  // Collapse the root, then enter a cleanup facet. Filtering flattens through
  // the fold and prints paths; returning to all restores the fold unchanged.
  await rootRow.getByTestId('outline-expand').click()
  await expect(rootRow.getByTestId('outline-expand')).toHaveAttribute('aria-expanded', 'false')
  await win.getByTestId('outline-filter-disconnected').click()
  await expect(tree.getByTestId('outline-row-meta').first()).not.toHaveText('')
  await expect(tree.locator('.row-title').filter({ hasText: 'Ruins Board' })).toHaveCount(0)
  await win.getByTestId('outline-filter-all').click()
  await expect(rootRow.getByTestId('outline-expand')).toHaveAttribute('aria-expanded', 'false')

  // Untagged is independent, flattened, and only then shows its badge.
  await win.getByTestId('outline-filter-untagged').click()
  await expect(tree.getByTestId('badge-untagged')).toHaveCount(1)
  await win.getByTestId('outline-filter-all').click()
  await expect(tree.getByTestId('badge-untagged')).toHaveCount(0)

  // The tag chip engages an outline-local lens; Escape peels it without
  // closing the takeover or disturbing folds.
  await rootRow.getByTestId('outline-expand').click()
  await bareRow.getByRole('button', { name: '#ruins' }).click()
  await expect(win.getByTestId('outline-lens-chip')).toContainText('#ruins')
  await expect(boardRow).toHaveClass(/lens-miss/)
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('outline-lens-chip')).toHaveCount(0)
  await expect(win.getByTestId('takeover-outline')).toBeVisible()

  await app.close()
})

test('outline deliberate cursor: hover inert, three dialects move it, org fold keys, dialog gate (AI-IMP-277)', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-cursor-')
  const { rootCanvasId } = await seedWorld(win)

  await win.getByTestId('charm-outline').click()
  const tree = win.getByTestId('outline-tree')
  const rootRow = tree.locator(`[data-canvas="${rootCanvasId}"]`).first()
  const boardRow = tree.getByTestId('outline-child-row').filter({ hasText: 'Ruins Board' })

  // Selection is deliberate: click selects; hovering another row
  // afterwards changes NOTHING (alph's field report — the preview
  // must not churn under pointer travel).
  await boardRow.getByTestId('outline-row-activate').click()
  await expect(boardRow).toHaveClass(/selected/)
  await expect(win.getByTestId('outline-filmstrip-glyph')).toBeVisible()
  await tree.getByTestId('loose-note-row').hover()
  await expect(boardRow).toHaveClass(/selected/)
  await expect(win.getByTestId('outline-filmstrip-glyph')).toBeVisible()

  // All three vertical dialects walk the cursor and return it.
  for (const [down, up] of [['ArrowDown', 'ArrowUp'], ['j', 'k'], ['s', 'w']] as const) {
    await win.keyboard.press(down)
    await expect(boardRow).not.toHaveClass(/selected/)
    await win.keyboard.press(up)
    await expect(boardRow).toHaveClass(/selected/)
  }

  // Org horizontal keys: → unfolds, ← folds, ← again jumps to parent.
  await win.keyboard.press('ArrowRight')
  await expect(boardRow.getByTestId('outline-expand')).toHaveAttribute('aria-expanded', 'true')
  await win.keyboard.press('h')
  await expect(boardRow.getByTestId('outline-expand')).toHaveAttribute('aria-expanded', 'false')
  await expect(boardRow).toHaveClass(/selected/)
  await win.keyboard.press('a')
  await expect(rootRow).toHaveClass(/selected/)

  // Dialog gate: with the trash confirm open, cursor keys and bare
  // Enter never reach the outline map (the pre-277 Enter-under-dialog
  // leak); Escape still closes.
  await boardRow.getByTestId('outline-row-activate').click()
  await win.keyboard.press('Delete')
  await expect(win.getByTestId('outline-trash-confirm')).toBeVisible()
  await win.keyboard.press('j')
  await win.keyboard.press('Enter')
  await expect(win.getByTestId('outline-trash-confirm')).toBeVisible()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('outline-trash-confirm')).toHaveCount(0)
  await expect(boardRow).toHaveClass(/selected/)

  await app.close()
})

test('outliner preview capture and three doors share one shipped verb path', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-control-')
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const nodeId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId,
    nodeId,
  })

  await win.getByTestId('charm-outline').click()
  const row = win.locator(`[data-testid="outline-child-row"][data-node-id="${nodeId}"]`)
  await row.getByTestId('outline-row-activate').click()
  await expect(win.getByTestId('outline-preview')).toContainText('◯ pin')
  await expect(win.getByTestId('outline-note-capture')).toBeVisible()

  // N reaches the same add-note offer and focuses the one editable preview
  // field; Enter commits one existing CreateNoteAndAttach command.
  await win.keyboard.press('n')
  await expect(win.getByTestId('outline-note-capture')).toBeFocused()
  const before = await revision(win)
  await win.getByTestId('outline-note-capture').fill('Field observations')
  await win.getByTestId('outline-note-capture').press('Enter')
  await expect
    .poll(async () =>
      runQuery<{ noteTitle: string | null }>(win, 'getOutlinePreview', { kind: 'node', nodeId }),
    )
    .toMatchObject({ noteTitle: 'Field observations' })
  expect(await contentCommandsSince(win, before)).toEqual(['CreateNoteAndAttach'])
  await expect(row.getByTestId('badge-orphan')).toHaveCount(0)
  await expect(win.getByTestId('outline-preview-excerpt')).toHaveCount(0)

  // Preview and right-click enumerate the same inventory IDs. Trash from the
  // menu and keyboard both enter the same impact-confirm path.
  await row.click({ button: 'right' })
  const previewIds = await win
    .locator('[data-testid="outline-preview-verbs"] [data-verb-id]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-verb-id')))
  const menuIds = await win
    .locator('[data-testid="outline-context-menu"] [data-verb-id]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-verb-id')))
  expect(menuIds).toEqual(previewIds)
  await win.locator('[data-testid="outline-context-menu"] [data-verb-id="trash"]').click()
  await expect(win.getByTestId('outline-trash-confirm')).toBeVisible()
  await win.getByTestId('outline-trash-confirm').getByRole('button', { name: 'Cancel' }).click()

  await win.keyboard.press('Delete')
  await expect(win.getByTestId('outline-trash-confirm')).toBeVisible()
  await win.getByTestId('outline-trash-confirm').getByRole('button', { name: 'Cancel' }).click()

  await win.keyboard.press('#')
  await expect(win.getByTestId('outline-tag-editor')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('outline-tag-editor')).toHaveCount(0)
  await expect(win.getByTestId('takeover-outline')).toBeVisible()

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
    .dblclick()
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
    .dblclick()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Adrift Thought/)

  // ---- The title strip no longer offers Sources (panel retired).
  await revealTitleStrip(win)
  await expect(win.getByTestId('toggle-sources')).toHaveCount(0)

  await app.close()
})

/**
 * AI-IMP-169 (§17 item 24): the outline takeover excludes trashed
 * records by default and drawn connectors appear nowhere as edges —
 * connectors are §4.9 visual-layer items, and with the graph takeover
 * deferred (rev 0.62) the outline is invariant 19's only Phase 1 view
 * checkpoint. Query-level exclusion is unit-tested
 * (queries-structure.test.ts); this walks the REAL Trash/Restore
 * commands through the takeover view.
 */
test('outline: trashed excluded by default, connectors never rows, restore returns the row (§17 item 24)', async () => {
  const { app, win } = await launchApp('ew-e2e-outline-trash-')
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // Two titled carriers on the root and a connector anchored between
  // their placements.
  const seed = async (title: string, x: number) => {
    const nodeId = crypto.randomUUID()
    const noteId = crypto.randomUUID()
    const placementId = crypto.randomUUID()
    await exec(win, 'CreateNote', { noteId, title, body: '' })
    await exec(win, 'CreateNode', { nodeId })
    await exec(win, 'AttachNoteToNode', { nodeId, noteId })
    await exec(win, 'CreatePlacement', {
      placementId,
      canvasId: rootCanvasId,
      nodeId,
      x,
      y: 200,
      width: 44,
      height: 44,
    })
    return { nodeId, placementId }
  }
  const keeper = await seed('Keeper', 150)
  const doomed = await seed('Doomed', 400)
  const connectorId = crypto.randomUUID()
  await exec(win, 'CreateDecoration', {
    decorationId: connectorId,
    canvasId: rootCanvasId,
    kind: 'connector',
    data: { x1: 194, y1: 222, x2: 400, y2: 222, stroke: '#dde3ea', strokeWidth: 2 },
    anchorStartPlacementId: keeper.placementId,
    anchorEndPlacementId: doomed.placementId,
  })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().decorations))
    .toBe(1)

  // Both rows before the trash.
  await win.getByTestId('charm-outline').click()
  const tree = win.getByTestId('outline-tree')
  await expect(tree.locator(`[data-node-id="${keeper.nodeId}"]`)).toHaveCount(1)
  await expect(tree.locator(`[data-node-id="${doomed.nodeId}"]`)).toHaveCount(1)

  // The connector is a decoration, not a child: it has no row and its
  // id appears nowhere in the takeover's DOM.
  const outlineHtml = await win.getByTestId('outline-view').innerHTML()
  expect(outlineHtml).not.toContain(connectorId)

  // Trash one carrier through the REAL command: its row is gone on
  // reopen; the survivor and the connector-free shape remain.
  await win.keyboard.press('Escape')
  await exec(win, 'TrashNode', { nodeId: doomed.nodeId })
  await win.getByTestId('charm-outline').click()
  await expect(tree.locator(`[data-node-id="${keeper.nodeId}"]`)).toHaveCount(1)
  await expect(tree.locator(`[data-node-id="${doomed.nodeId}"]`)).toHaveCount(0)

  // Restore brings the row back.
  await win.keyboard.press('Escape')
  await exec(win, 'RestoreRecord', { kind: 'node', id: doomed.nodeId })
  await win.getByTestId('charm-outline').click()
  await expect(tree.locator(`[data-node-id="${keeper.nodeId}"]`)).toHaveCount(1)
  await expect(tree.locator(`[data-node-id="${doomed.nodeId}"]`)).toContainText('Doomed')

  await app.close()
})
