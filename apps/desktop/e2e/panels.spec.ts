import { expect, test } from '@playwright/test'
import { exec, launchApp, seedPlacedNote } from './helpers'

/**
 * AI-IMP-064 acceptance (RFC §8.5): tethered panels track their node
 * and get replaced; pinning accumulates and NOTHING auto-unpins; the
 * indicator escalates with how broken the spatial link is (tail →
 * halo → edge chip → origin label); the canvas corner charm is the
 * board's own page charm, ghost until the first committed edit.
 */

test('pin accumulation and the escalation ladder (§8.5)', async () => {
  const { app, win } = await launchApp('ew-e2e-panels-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await seedPlacedNote(win, 'Keep', 'high walls', { x: 700, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // No docked pane: nothing exists until a note opens.
  await expect(win.getByTestId('note-pane')).toHaveCount(0)

  // The subject node's tags surface as panel chips (§8.5).
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: 'ink' })
  const harborNode = await win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    const items = (scene as { result: { items: Array<Record<string, unknown>> } }).result.items
    return items.find((i) => i['itemKind'] === 'placement' && i['noteTitle'] === 'Harbor')![
      'nodeId'
    ] as string
  })
  await exec(win, 'AssignTagToNode', { tagId, nodeId: harborNode })

  // Open tethered; the panel tracks its node with a tail.
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await expect(win.getByTestId('panel-tag-chips')).toContainText('#ink')

  // Tethered replacement: opening another note reuses THE panel; the
  // untagged subject shows no chips at all.
  await win.mouse.dblclick(box.x + 700, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Keep/)
  await expect(win.locator('.note-panel')).toHaveCount(1)
  await expect(win.getByTestId('panel-tag-chips')).toHaveCount(0)

  // Pin: screen-fixed, and the node (on-screen) wears the halo.
  await win.getByTestId('panel-pin').click()
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1)
  await expect(win.getByTestId('note-pane')).toHaveCount(0) // no tethered panel now
  await expect(win.locator('[data-testid^="panel-halo-"]')).toHaveCount(1)

  // Pan the node off-screen: the halo yields to an edge chip.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 5000, y: 5000, zoom: 1 }))
  await expect(win.locator('[data-testid^="panel-edge-chip-"]')).toHaveCount(1)
  await expect(win.locator('[data-testid^="panel-halo-"]')).toHaveCount(0)

  // The chip flies home; the halo returns when the node is back.
  await win.locator('[data-testid^="panel-edge-chip-"]').click()
  await expect(win.locator('[data-testid^="panel-halo-"]')).toHaveCount(1, { timeout: 10_000 })

  // Cross-canvas: the pinned panel survives navigation and grows the
  // header origin label; clicking it is a navigation event home.
  const nodeB = crypto.randomUUID()
  const canvasB = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: nodeB })
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Elsewhere'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1) // never auto-unpinned
  await expect(win.getByTestId('panel-origin')).toBeVisible()
  await win.getByTestId('panel-origin').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  await expect(win.getByTestId('panel-origin')).toHaveCount(0) // condition gone, surface gone

  // A pinned panel plus a fresh tethered one accumulate. (Scoped
  // locator: the pinned panel keeps its inner testids too. Camera
  // reset: the flight and round-trip left it centered elsewhere.)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const tetheredTitle = win.getByTestId('note-pane').getByTestId('note-pane-title')
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(tetheredTitle).toHaveText(/Harbor/)
  await expect(win.locator('.note-panel')).toHaveCount(2)

  // One buffer per note: re-opening the pinned note adds nothing.
  await win.mouse.dblclick(box.x + 700, box.y + 300)
  await expect(win.locator('.note-panel')).toHaveCount(2)
  await expect(tetheredTitle).toHaveText(/Harbor/) // tethered unchanged

  await app.close()
})

test('cross-canvas activation re-tethers at the destination; uses rows fly as history (§7.3–7.4, §17-16)', async () => {
  const { app, win } = await launchApp('ew-e2e-xcanvas-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())

  // "Far" lives ONLY on canvas B; a source note on root links to it.
  const farNote = crypto.randomUUID()
  const farNode = crypto.randomUUID()
  const canvasB = crypto.randomUUID()
  const bOwner = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: bOwner })
  await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: bOwner })
  await exec(win, 'CreateNote', { noteId: farNote, title: 'Far', body: 'distant shore' })
  await exec(win, 'CreatePin', {
    nodeId: farNode,
    canvasId: canvasB,
    placementId: crypto.randomUUID(),
    x: 400,
    y: 300,
    appearance: { kind: 'dot', color: '#77aaff' },
    note: { kind: 'attach', noteId: farNote },
  })
  await seedPlacedNote(win, 'Source', 'go [[Far]]', { x: 300, y: 240 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // One placement, on ANOTHER canvas: activation flies there as a
  // §8.1 history event AND the note opens tethered at the arrival.
  await win.mouse.dblclick(box.x + 300, box.y + 240)
  await expect(win.getByTestId('note-editor')).toContainText('Far')
  await win.locator('.cm-content [data-link-title="Far"]').click({
    modifiers: ['ControlOrMeta'],
  })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Far/)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBe(1)
  // Back returns to the source board: the flight entered history.
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // The in-panel uses list: "⌖ 1", the here marker after arrival,
  // and a cross-canvas row that flies as a navigation event.
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, farNote)
  await expect(win.getByTestId('uses-toggle')).toContainText('⌖ 1')
  await win.getByTestId('uses-toggle').click()
  await expect(win.getByTestId('uses-sidebar')).toBeVisible()
  await win.getByTestId('uses-node').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBe(1)
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  await app.close()
})

test('corner charm: ghost, first committed edit materializes, Escape never persists (§8.5)', async () => {
  const { app, win } = await launchApp('ew-e2e-corner-')

  // Ghost while the board has no note.
  await expect(win.getByTestId('corner-charm')).toHaveAttribute('data-state', 'ghost')

  // Escape before typing: nothing ever existed.
  await win.getByTestId('corner-charm').click()
  await expect(win.getByTestId('canvas-phantom')).toBeVisible()
  await win.getByTestId('canvas-phantom-draft').press('Escape')
  await expect(win.getByTestId('canvas-phantom')).toHaveCount(0)
  const noNotes = await win.evaluate(async () => {
    const response = await window.ew.project.query('listNoteTitles')
    return response.ok ? (response.result as unknown[]).length : -1
  })
  expect(noNotes).toBe(0)

  // First committed edit: the first line becomes the title, the rest
  // the body; the charm turns solid at that moment.
  await win.getByTestId('corner-charm').click()
  await win.getByTestId('canvas-phantom-draft').fill('Harbor Board\nwhere every voyage starts')
  await win.getByTestId('canvas-phantom-draft').blur()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor Board/, { timeout: 10_000 })
  await expect(win.getByTestId('note-editor')).toContainText('where every voyage starts')
  await expect(win.getByTestId('corner-charm')).toHaveAttribute('data-state', 'solid')

  // The solid charm opens straight to the note.
  await win.getByTestId('panel-close').click()
  await expect(win.getByTestId('note-pane')).toHaveCount(0)
  await win.getByTestId('corner-charm').click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor Board/)

  await app.close()
})
