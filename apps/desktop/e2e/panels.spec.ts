import { expect, test } from '@playwright/test'
import { exec, launchApp, revision, runQuery, seedPlacedNote } from './helpers'

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
  // untagged subject carries the §4.8 add-field but no chips (108).
  await win.mouse.dblclick(box.x + 700, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Keep/)
  await expect(win.locator('.note-panel')).toHaveCount(1)
  await expect(win.getByTestId('tag-add-field')).toBeVisible()
  await expect(win.locator('[data-testid^="panel-tag-chip-"]')).toHaveCount(0)

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

test('tethered panels world-track down to a floor then HOLD (no postage stamp); pinned stay screen-fixed; deep overview fades (§8.5 rev 0.47, AI-IMP-116/200)', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-scale-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const paneWidth = async (): Promise<number> =>
    Math.round((await win.getByTestId('note-pane').boundingBox())!.width)
  const paneOpacity = async (): Promise<number> =>
    win.getByTestId('note-pane').evaluate((el) => Number(getComputedStyle(el).opacity))

  // Open tethered at 100%: the full-size default card (scale 1).
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  expect(await paneWidth()).toBe(320)

  // Zoom the world to 50%: still world-tracking, glued right of its node,
  // at the floor boundary (MIN_PANEL_SCREEN_SCALE 0.5 → 160), fully opaque.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.5 }))
  await expect.poll(paneWidth).toBe(160)
  expect(await paneOpacity()).toBeCloseTo(1, 1)
  const nodeScreenX = await win.evaluate(() => {
    const cam = window.__ewDebug!.camera()
    return (400 - cam.x) * cam.zoom
  })
  const at50 = (await pane.boundingBox())!
  expect(at50.x - box.x).toBeGreaterThan(nodeScreenX) // panel is right of the node

  // AI-IMP-200 HOLD-AT-FLOOR: zoom further to the zoom boards actually
  // live at — the panel does NOT keep shrinking into a stamp. It HOLDS at
  // the floor (160), still opaque and interactable, position world-tracked.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.25 }))
  await expect.poll(paneWidth).toBe(160)
  expect(await paneOpacity()).toBeCloseTo(1, 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.12 }))
  await expect.poll(paneWidth).toBe(160)
  expect(await paneOpacity()).toBeCloseTo(1, 1)

  // Only in DEEP overview (worldScale below the fade floor) does the held
  // panel dissolve — where it would otherwise loom over a thumbnail board.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.03 }))
  await expect.poll(paneOpacity).toBeLessThan(0.05)

  // Back to 100% and PIN: a pinned panel is a sticky note on the glass —
  // full default size and opacity, unaffected by the camera.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await expect.poll(paneWidth).toBe(320)
  await win.getByTestId('panel-pin').click()
  const pinned = win.locator('.note-panel.pinned')
  await expect(pinned).toHaveCount(1)
  expect(Math.round((await pinned.boundingBox())!.width)).toBe(320)

  // Zoom out hard: the pinned panel does NOT scale and does NOT fade.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.25 }))
  expect(Math.round((await pinned.boundingBox())!.width)).toBe(320)
  expect(await pinned.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(1, 1)

  await app.close()
})

/**
 * AI-IMP-200: undocking (tether → pin) used to jump the size 4–6× at
 * board zoom because the tethered panel had shrunk to a stamp. With
 * hold-at-floor the tethered panel holds at the legibility floor, so the
 * jump to the full-size pinned card shrinks to ~2×. This measures the
 * ratio at a representative board zoom and records the win.
 */
test('undock (tether → pin) no longer multiplies the size 4–6× (§8.5, AI-IMP-200)', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-undock-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)

  // A representative board zoom (0.3): the tethered panel holds at 160.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.3 }))
  await expect
    .poll(async () => Math.round((await win.getByTestId('note-pane').boundingBox())!.width))
    .toBe(160)
  const tetheredWidth = Math.round((await win.getByTestId('note-pane').boundingBox())!.width)

  // Pin it: the sticky is the full-size card (320), screen-fixed and
  // relaid-out immediately (undock resize lands now, not on next pan).
  await win.getByTestId('panel-pin').click()
  const pinned = win.locator('.note-panel.pinned')
  await expect(pinned).toHaveCount(1)
  await expect.poll(async () => Math.round((await pinned.boundingBox())!.width)).toBe(320)
  const pinnedWidth = Math.round((await pinned.boundingBox())!.width)
  expect(pinnedWidth).toBe(320)

  // Undock ratio at board zoom: was 320/96 ≈ 3.3× (0.3) and up to 5× at
  // 0.2; hold-at-floor makes it a flat 320/160 = 2.0×.
  const ratio = pinnedWidth / tetheredWidth
  expect(ratio).toBeLessThanOrEqual(2.1)

  await app.close()
})

/**
 * AI-IMP-200: the big editor is floating paper (The Two Materials) and
 * must wear a shadow that READS — a token value, not the old diffuse
 * wash. Assert it resolves to a non-empty, layered box-shadow.
 */
test('the big editor carries a reading paper shadow (§8.5 Two Materials, AI-IMP-200)', async () => {
  const { app, win } = await launchApp('ew-e2e-big-shadow-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()
  const shadow = await win
    .getByTestId('big-editor')
    .evaluate((el) => getComputedStyle(el).boxShadow)
  // A real, layered cast: non-empty, more than one shadow layer.
  expect(shadow).not.toBe('none')
  expect(shadow.split('rgba').length).toBeGreaterThan(2) // ≥ 2 layers

  await app.close()
})

test('closing a dirty panel inside the debounce window still commits (§7.1, AI-IMP-085)', async () => {
  const { app, win } = await launchApp('ew-e2e-panelflush-')
  const { noteId } = await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await win.locator('.note-panel [data-testid="note-editor-content"]').click()
  await win.keyboard.press('End')
  await win.keyboard.type(' and gull cries')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible()
  // Close IMMEDIATELY — well inside NOTE_AUTOSAVE_IDLE_MS. The close
  // is a guaranteed save point: the burst must land anyway.
  await win.getByTestId('panel-close').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await runQuery<{ body: string } | null>(win, 'getNote', { noteId }))?.body ?? '',
      { timeout: 10_000 },
    )
    .toContain('gull cries')

  await app.close()
})

test('panel sizing, pinned resize, and the big editor (§8.5 rev 0.31, AI-IMP-083)', async () => {
  const { app, win } = await launchApp('ew-e2e-panelsize-')
  const { noteId } = await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Tethered spawns at THE default size (feel constant) with the
  // depth-cue shadow, and offers no resize grip.
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  const spawn = (await pane.boundingBox())!
  expect(Math.round(spawn.width)).toBe(320) // DEFAULT_PANEL_SIZE
  expect(Math.round(spawn.height)).toBe(300)
  const shadow = await pane.evaluate((el) => getComputedStyle(el).boxShadow)
  expect(shadow).not.toBe('none')
  await expect(win.getByTestId('panel-resize-grip')).toHaveCount(0)

  // Expand from the TETHERED panel: the buffer MOVES to the overlay
  // (the panel holds no editor meanwhile); Escape maps to Done.
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()
  await expect(win.getByTestId('big-editor-backdrop')).toBeVisible()
  await expect(win.locator('[data-testid="big-editor"] [data-testid="note-editor-content"]')).toContainText('stone quay')
  await expect(win.locator('.note-panel [data-testid="note-editor-content"]')).toHaveCount(0) // one buffer, moved
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('big-editor')).toHaveCount(0)
  await expect(win.getByTestId('note-editor')).toContainText('stone quay') // came home

  // Pin: the grip appears; dragging it resizes the panel.
  await win.getByTestId('panel-pin').click()
  const pinned = win.locator('.note-panel.pinned')
  await expect(pinned).toHaveCount(1)
  await expect(win.getByTestId('panel-resize-grip')).toBeVisible()
  const before = (await pinned.boundingBox())!
  await win.mouse.move(before.x + before.width - 6, before.y + before.height - 6)
  await win.mouse.down()
  await win.mouse.move(before.x + before.width + 134, before.y + before.height + 104, { steps: 5 })
  await win.mouse.up()
  const grown = (await pinned.boundingBox())!
  expect(Math.round(grown.width)).toBe(Math.round(before.width) + 140)
  expect(Math.round(grown.height)).toBe(Math.round(before.height) + 110)

  // The size holds across pan…
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 4000, y: 4000, zoom: 1 }))
  const afterPan = (await pinned.boundingBox())!
  expect(Math.round(afterPan.width)).toBe(Math.round(grown.width))
  expect(Math.round(afterPan.height)).toBe(Math.round(grown.height))

  // …and across navigation (pinned panels survive it, §8.5).
  const nodeB = crypto.randomUUID()
  const canvasB = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: nodeB })
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Elsewhere'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await expect(pinned).toHaveCount(1)
  const afterNav = (await pinned.boundingBox())!
  expect(Math.round(afterNav.width)).toBe(Math.round(grown.width))
  expect(Math.round(afterNav.height)).toBe(Math.round(grown.height))

  // Min-size clamp: a hard shrink stops where the header controls
  // still live.
  const gripNow = (await win.getByTestId('panel-resize-grip').boundingBox())!
  await win.mouse.move(gripNow.x + 7, gripNow.y + 7)
  await win.mouse.down()
  await win.mouse.move(gripNow.x - 900, gripNow.y - 900, { steps: 5 })
  await win.mouse.up()
  const clamped = (await pinned.boundingBox())!
  expect(Math.round(clamped.width)).toBe(240) // MIN_PANEL_SIZE
  expect(Math.round(clamped.height)).toBe(150)
  await expect(win.getByTestId('panel-expand')).toBeVisible()
  await expect(win.locator('[data-testid^="panel-close-"]')).toBeVisible()

  // Big editor from the pinned panel: type, Done — the text is in
  // the panel and commits per ordinary §7.1 rules; dirty state rides
  // across the move.
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()
  await win.locator('[data-testid="big-editor"] [data-testid="note-editor-content"]').click()
  await win.keyboard.press('ControlOrMeta+a')
  await win.keyboard.type('stone quay and tarred ropes')
  await expect(win.getByTestId('note-pane-dirty')).toBeVisible() // dirty intact mid-overlay
  await win.getByTestId('big-editor-done').click()
  await expect(win.getByTestId('big-editor')).toHaveCount(0)
  await expect(win.getByTestId('note-editor')).toContainText('tarred ropes')
  await expect
    .poll(
      async () =>
        (await runQuery<{ body: string } | null>(win, 'getNote', { noteId }))?.body ?? '',
      { timeout: 10_000 },
    )
    .toContain('tarred ropes')

  // Backdrop click is Done too. Raw mouse at the left-middle edge:
  // the floating chrome owns the corners (path bar, rail, dock) and
  // intercepts locator clicks there.
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()
  const scrim = (await win.getByTestId('big-editor-backdrop').boundingBox())!
  await win.mouse.click(scrim.x + 25, scrim.y + scrim.height * 0.55)
  await expect(win.getByTestId('big-editor')).toHaveCount(0)
  await expect(win.getByTestId('note-editor')).toContainText('tarred ropes')

  await app.close()
})

test('the big editor backdrop covers chrome — a dock click lands on the scrim, not the dock (§8.8 law 2, AI-IMP-101)', async () => {
  const { app, win } = await launchApp('ew-e2e-modal-escape-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Select is the default tool; the dock sits at the bottom edge,
  // formerly ABOVE the big editor's backdrop (the trapped-modal bug).
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/)
  await win.getByTestId('panel-expand').click()
  await expect(win.getByTestId('big-editor')).toBeVisible()

  // A raw click AT THE DOCK'S OWN COORDINATES: with the modal freed to
  // the root overlay host, the backdrop now covers the dock, so the
  // click is Done (editor closes) and the dock never sees it — the
  // active tool is unchanged and no dock button (e.g. the shapes
  // flyout) fired.
  const dock = (await win.getByTestId('dock').boundingBox())!
  await win.mouse.click(dock.x + dock.width / 2, dock.y + dock.height / 2)
  await expect(win.getByTestId('big-editor')).toHaveCount(0)
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)
  await expect(win.getByTestId('tool-rect')).toHaveCount(0) // shapes flyout never opened

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
  await win.locator('[data-testid="note-editor-content"] [data-link-title="Far"]').click({
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

/**
 * AI-IMP-086 acceptance: two user acts that used to be two commands
 * each are ONE durable command — one revision bump — and ONE inverse
 * command reverts everything. The interactive Cmd+Z stack is
 * EPIC-007's; per the gestures.spec precedent, "one undo" is proven
 * at the data level by executing the compound's inverse.
 */

interface PlacedItem {
  id: string
  itemKind: string
  nodeId: string
  x: number
  y: number
  appearanceKind: string | null
}

async function placedItems(win: Awaited<ReturnType<typeof launchApp>>['win']): Promise<PlacedItem[]> {
  const scene = await runQuery<{ items: PlacedItem[] }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  return scene.items.filter((item) => item.itemKind === 'placement')
}

test('place-on-board is ONE command; one undo removes the card and restores the dot (AI-IMP-086)', async () => {
  const { app, win } = await launchApp('ew-e2e-placecard-')
  const { nodeId } = await seedPlacedNote(win, 'Quayside', 'stone and salt', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Quayside/)
  await win.getByTestId('panel-pin').click()
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1)

  // The act: appearance flip + placement land as ONE revision bump.
  const before = await revision(win)
  await win.getByTestId('panel-place-on-board').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(2)
  expect(await revision(win)).toBe(before + 1)
  const cards = (await placedItems(win)).filter((item) => item.appearanceKind === 'card')
  expect(cards).toHaveLength(2)
  const placed = cards.find((card) => !(card.x === 400 && card.y === 300))!

  // ONE undo — the compound's single inverse — removes the placement
  // AND restores the dot (color included) together.
  await exec(win, 'UnplaceCard', {
    placementId: placed.id,
    nodeId,
    appearanceChanged: true,
    priorAppearance: { kind: 'dot', color: '#ff7700' },
  })
  expect(await revision(win)).toBe(before + 2)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  const remaining = await placedItems(win)
  expect(remaining).toHaveLength(1)
  expect(remaining[0]).toMatchObject({ nodeId, appearanceKind: 'dot' })

  await app.close()
})

test('corner-charm create-and-attach is ONE command; one undo detaches and removes (AI-IMP-086)', async () => {
  const { app, win } = await launchApp('ew-e2e-compound-attach-')

  // The act: the first committed edit materializes note + attachment
  // as ONE revision bump, visible in the note panel.
  await win.getByTestId('corner-charm').click()
  await expect(win.getByTestId('canvas-phantom')).toBeVisible()
  const before = await revision(win)
  await win.getByTestId('canvas-phantom-draft').fill('Ledger\nkept in salt-stained ink')
  await win.getByTestId('canvas-phantom-draft').blur()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Ledger/, { timeout: 10_000 })
  await expect(win.getByTestId('note-editor')).toContainText('kept in salt-stained ink')
  expect(await revision(win)).toBe(before + 1)

  const attached = (
    await runQuery<Array<{ id: string; noteId: string | null }>>(win, 'listNodeLibrary')
  ).find((row) => row.noteId !== null)!
  expect(attached).toBeTruthy()
  await win.getByTestId('panel-close').click()
  await expect(win.getByTestId('note-pane')).toHaveCount(0)

  // ONE undo — the compound's single inverse — detaches the node AND
  // removes (trashes) the note together.
  await exec(win, 'DetachAndTrashNote', { nodeId: attached.id, noteId: attached.noteId })
  expect(await revision(win)).toBe(before + 2)
  const nodes = await runQuery<Array<{ id: string; noteId: string | null }>>(
    win,
    'listNodeLibrary',
  )
  expect(nodes.find((row) => row.id === attached.id)).toMatchObject({ noteId: null })
  const titles = await runQuery<Array<{ id: string; lifecycleState: string }>>(
    win,
    'listNoteTitles',
  )
  expect(titles.find((row) => row.id === attached.noteId)).toMatchObject({
    lifecycleState: 'trashed',
  })
  // The board's charm is a ghost again: no active note anywhere.
  await expect(win.getByTestId('corner-charm')).toHaveAttribute('data-state', 'ghost')

  await app.close()
})

// AI-IMP-097: a note surface is not an embed target yet — an image
// dropped on the panel imports through the ordinary §6.1 pipeline
// onto the active board, BESIDE the note's placement, and a toast
// says where it went. The note body is never touched.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
  'h6FO1AAAAABJRU5ErkJggg=='

test('image dropped on a note panel lands on the board beside it (§6.1, AI-IMP-097)', async () => {
  const { app, win } = await launchApp('ew-e2e-note-drop-')
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const { noteId, nodeId } = await seedPlacedNote(win, 'DropTarget', 'quiet body', {
    x: 400,
    y: 300,
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Open the note tethered beside its dot.
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/DropTarget/)

  // The seeded dot's placement position — the anchor the drop places
  // beside (read it rather than assume the pin's world point).
  type SceneItem = { itemKind: string; nodeId: string; x: number; y: number; appearanceKind: string }
  const scene = () => runQuery<{ items: SceneItem[] }>(win, 'getCanvasScene', { canvasId })
  const notePlacement = (await scene()).items.find(
    (item) => item.itemKind === 'placement' && item.nodeId === nodeId,
  )!
  expect(notePlacement).toBeTruthy()

  // Drop a real PNG File onto the tethered panel (dispatchEvent with a
  // DataTransfer — HTML5 DnD is not synthesizable from raw mouse moves
  // under Playwright+Electron).
  await win.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
    const panel = document.querySelector('[data-testid="note-pane"]')!
    const rect = panel.getBoundingClientRect()
    panel.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, PNG_1X1_BASE64)

  // The image imports onto the board as a second placement (the note's
  // node is untouched; a brand-new image node carries it).
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  const imagePlacement = (await scene()).items.find(
    (item) => item.itemKind === 'placement' && item.appearanceKind === 'image',
  )!
  expect(imagePlacement).toBeTruthy()

  // Placed BESIDE the note: to its right, and near it.
  expect(imagePlacement.x).toBeGreaterThan(notePlacement.x)
  expect(
    Math.hypot(imagePlacement.x - notePlacement.x, imagePlacement.y - notePlacement.y),
  ).toBeLessThan(300)

  // A word about where it went.
  await expect(win.getByTestId('board-notice')).toContainText('Images live on the board')

  // The note body is exactly as seeded — the drop never reached the editor.
  const note = await runQuery<{ body: string }>(win, 'getNote', { noteId })
  expect(note.body).toBe('quiet body')

  await app.close()
})

/**
 * AI-IMP-199: the note-open lifecycle must be idempotent and
 * self-healing — no sequence of fast open/close clicks may leave a
 * node's note permanently unopenable for the session (owner review
 * FAIL, 2026-07-08). The audit found the store's open/close is
 * already race-guarded (AI-IMP-171/184/185); the one terminal state
 * with no reset path was the big-editor input blocker leaking on host
 * detach (fixed in panels.ts). These drive the wedging sequences and
 * assert the panel always ends OPENABLE: present, opaque, and
 * pointer-interactable.
 */
async function openablePaneState(win: import('@playwright/test').Page) {
  return win.evaluate(() => {
    const el = document.querySelector('[data-testid="note-pane"]') as HTMLElement | null
    if (!el) return { present: false, opacity: 0, pointerEvents: 'none', title: '' }
    const cs = getComputedStyle(el)
    return {
      present: true,
      opacity: Number(cs.opacity),
      pointerEvents: cs.pointerEvents,
      title: el.querySelector('[data-testid="note-pane-title"]')?.textContent ?? '',
    }
  })
}

test('spam open/close a note 10× fast always ends openable (§8.5, AI-IMP-199)', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-wedge-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Rapid open-then-instant-close, ten times — the exact wedging shape
  // (open + immediate click-away on the close control).
  for (let i = 0; i < 10; i += 1) {
    await win.mouse.dblclick(box.x + 400, box.y + 300)
    try {
      await win.getByTestId('panel-close').click({ timeout: 1500 })
    } catch {
      // Not painted yet on this iteration; the next open still must work.
    }
  }

  // The final open MUST succeed and be interactable.
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/, { timeout: 5000 })
  // AI-IMP-209: poll — the positioning gate legitimately holds the pane
  // hidden/inert for its first frame(s); see the burst test below.
  await expect
    .poll(async () => {
      const st = await openablePaneState(win)
      return st.present && st.opacity > 0.5 && st.pointerEvents !== 'none'
    })
    .toBe(true)

  await app.close()
})

test('open-while-closing bursts through the store never wedge the tethered slot (AI-IMP-199)', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-wedge2-')
  const { noteId } = await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  // Interleave open + close with no awaits: the store must not strand a
  // ghost tethered record that eats the re-open (the AI-IMP-171 lesson).
  await win.evaluate((id: string) => {
    for (let i = 0; i < 14; i += 1) {
      window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
      ;(document.querySelector('[data-testid="panel-close"]') as HTMLElement | null)?.click()
    }
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, noteId)

  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/, { timeout: 5000 })
  // AI-IMP-209 (CI catch): the pane holds visibility:hidden +
  // pointer-events:none until its first positioning frame lands
  // (AI-IMP-193's no-paint-before-position gate), and on the Linux
  // runner's slow software frames a one-shot sample landed inside that
  // window. The invariant is EVENTUALLY interactable — poll for it.
  await expect
    .poll(async () => {
      const st = await openablePaneState(win)
      return st.opacity > 0.5 && st.pointerEvents !== 'none'
    })
    .toBe(true)

  await app.close()
})

/**
 * AI-IMP-193: the tethered panel must NEVER paint at the placeholder
 * 0,0 (the window's upper-left) before its real position lands. A
 * per-frame sampler records the pane's inline position and computed
 * visibility across the open; the invariant is that no VISIBLE frame
 * ever sits at the upper-left — the first placed paint is already
 * beside the node.
 */
test('note panel never flashes at the window corner before positioning (§8.5, AI-IMP-193)', async () => {
  const { app, win } = await launchApp('ew-e2e-panel-flash-')
  await seedPlacedNote(win, 'Harbor', 'stone quay', { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Sample every frame, capturing whether the pane is visible and where
  // its inline position sits. AI-IMP-209 (CI catch): no fixed tick
  // budget — the Linux runner's software frames stretched the pane's
  // first positioning frame past the old 90-tick/400ms window and the
  // sampler stopped before ever seeing it visible. The sampler runs
  // until it has recorded a handful of VISIBLE frames (or a generous
  // cap), and the test polls for visibility instead of sleeping.
  await win.evaluate(() => {
    ;(window as unknown as { __paneSamples: unknown[] }).__paneSamples = []
    let n = 0
    let seenVisible = 0
    const tick = (): void => {
      const el = document.querySelector('[data-testid="note-pane"]') as HTMLElement | null
      if (el) {
        const cs = getComputedStyle(el)
        const visible = cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01
        if (visible) seenVisible += 1
        ;(window as unknown as { __paneSamples: unknown[] }).__paneSamples.push({
          visible,
          left: parseFloat(el.style.left || '0'),
          top: parseFloat(el.style.top || '0'),
        })
      }
      if (n++ < 1800 && seenVisible < 6) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor/, { timeout: 5000 })
  // Poll the SAMPLER's own record (not the live DOM) so the visible
  // frame is guaranteed to be in the array we assert over.
  await expect
    .poll(() =>
      win.evaluate(
        () =>
          (window as unknown as { __paneSamples: Array<{ visible: boolean }> }).__paneSamples.some(
            (s) => s.visible,
          ),
      ),
    )
    .toBe(true)

  const samples = await win.evaluate(
    () =>
      (window as unknown as { __paneSamples: Array<{ visible: boolean; left: number; top: number }> })
        .__paneSamples,
  )
  const visible = samples.filter((s) => s.visible)
  // The panel did appear at least once, visible…
  expect(visible.length).toBeGreaterThan(0)
  // …and NO visible frame sat in the upper-left corner (the flash).
  const corner = visible.filter((s) => s.left < 40 && s.top < 40)
  expect(corner, JSON.stringify(corner)).toEqual([])
  // Its placed position is beside the node (to its right), not the corner.
  expect(visible[visible.length - 1]!.left).toBeGreaterThan(200)

  await app.close()
})
