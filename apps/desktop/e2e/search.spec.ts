import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * AI-IMP-073 acceptance: the ⌕ panel (RFC §8.3). Search mode groups
 * the four corpora and every kind activates — note → note panel,
 * tag → tag panel (the §4.8 third door), asset filename → expanded
 * using-node locations that navigate and center, canvas text →
 * navigate to the containing canvas centered on the decoration (a
 * §8.1 history entry; Back returns). Leading # flips the field to
 * tag-name completion. Mod+P summons the same panel in quick-open
 * mode — title matches over notes and canvas-owning nodes — and is
 * suppressed under a takeover but alive inside the note editor.
 */

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
  'h6FO1AAAAABJRU5ErkJggg=='

interface SearchWorld {
  rootCanvasId: string
  boardBCanvasId: string
  ruinsTagId: string
  watcherNoteId: string
  assetPlacementId: string
  decorationId: string
}

/** Root board: "Watcher" note-node (tagged "ruins"). Board B ("Ruins
 * Board", owned by a titled node): an image node using asset
 * "gate-map.png" and a text decoration reading "sunken gate". */
async function seedSearchWorld(win: Page): Promise<SearchWorld> {
  const rootCanvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  const ownerNodeId = crypto.randomUUID()
  const ownerNoteId = crypto.randomUUID()
  const boardBCanvasId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId: ownerNoteId, title: 'Ruins Board', body: '' })
  await exec(win, 'CreateNode', { nodeId: ownerNodeId })
  await exec(win, 'AttachNoteToNode', { nodeId: ownerNodeId, noteId: ownerNoteId })
  await exec(win, 'CreateCanvas', { canvasId: boardBCanvasId, nodeId: ownerNodeId })

  const watcherNodeId = crypto.randomUUID()
  const watcherNoteId = crypto.randomUUID()
  await exec(win, 'CreateNote', {
    noteId: watcherNoteId,
    title: 'Watcher',
    body: 'it studies the old walls',
  })
  await exec(win, 'CreateNode', { nodeId: watcherNodeId })
  await exec(win, 'AttachNoteToNode', { nodeId: watcherNodeId, noteId: watcherNoteId })
  await exec(win, 'CreatePlacement', {
    placementId: crypto.randomUUID(),
    canvasId: rootCanvasId,
    nodeId: watcherNodeId,
    x: 150,
    y: 150,
    width: 40,
    height: 40,
  })

  const ruinsTagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId: ruinsTagId, name: 'ruins' })
  await exec(win, 'AssignTagToNode', { tagId: ruinsTagId, nodeId: watcherNodeId })

  // Asset with a searchable filename, worn by a node placed on B.
  const assetPlacementId = crypto.randomUUID()
  await win.evaluate(
    async ({ base64, canvasId, placementId }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const imported = await window.ew.project.importAsset({
        bytes,
        originalFilename: 'gate-map.png',
      })
      if (!imported.ok) throw new Error('importAsset failed')
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const outcome = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId: (project.result as { id: string }).id,
        commandType: 'CreatePin',
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: {
          nodeId: crypto.randomUUID(),
          canvasId,
          placementId,
          x: 600,
          y: 300,
          appearance: { kind: 'image', assetId: imported.assetId, crop: null },
        },
      })
      if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome))
    },
    { base64: PNG_1X1_BASE64, canvasId: boardBCanvasId, placementId: assetPlacementId },
  )

  const decorationId = crypto.randomUUID()
  await exec(win, 'CreateDecoration', {
    decorationId,
    canvasId: boardBCanvasId,
    kind: 'text',
    data: { x: 500, y: 400, text: 'sunken gate', fontSize: 16, color: '#dde3ea' },
  })

  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  return { rootCanvasId, boardBCanvasId, ruinsTagId, watcherNoteId, assetPlacementId, decorationId }
}

function cameraCenterDistance(win: Page, box: { width: number; height: number }, x: number, y: number) {
  return async (): Promise<number> => {
    const camera = await win.evaluate(() => window.__ewDebug!.camera())
    const centerX = camera.x + box.width / (2 * camera.zoom)
    const centerY = camera.y + box.height / (2 * camera.zoom)
    return Math.hypot(centerX - x, centerY - y)
  }
}

test('search mode: grouped kinds; note, tag, and asset-location activation (§8.3)', async () => {
  const { app, win } = await launchApp('ew-e2e-search-')
  const world = await seedSearchWorld(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // ⌕ charm opens the panel (active state); Escape closes it.
  await win.getByTestId('charm-search').click()
  const panel = win.getByTestId('search-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-mode', 'search')
  await expect(win.getByTestId('charm-search')).toHaveAttribute('aria-pressed', 'true')
  await win.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await expect(win.getByTestId('charm-search')).toHaveAttribute('aria-pressed', 'false')

  // Note result (flat cursor starts on it): Enter opens the note panel.
  await win.getByTestId('charm-search').click()
  await win.getByTestId('search-input').fill('watcher')
  await expect(panel.getByTestId('search-group-Notes')).toBeVisible()
  await expect(panel.locator('[data-testid="search-hit"][data-kind="note"]')).toContainText(
    'Watcher',
  )
  await win.keyboard.press('Enter')
  await expect(panel).not.toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toContainText('Watcher')

  // Tag result: the §4.8 third door lands on the tag panel.
  await win.getByTestId('charm-search').click()
  await win.getByTestId('search-input').fill('ruins')
  await panel.locator('[data-testid="search-hit"][data-kind="tag"]').click()
  await expect(panel).not.toBeVisible()
  await expect(win.getByTestId('tag-panel')).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('tag-panel')).not.toBeVisible()

  // Asset filename: 'gate' hits the asset AND the canvas text — both
  // groups label themselves. The asset row expands into using-node
  // locations; a location navigates (§8.1 entry), selects, centers.
  await win.getByTestId('charm-search').click()
  await win.getByTestId('search-input').fill('gate')
  await expect(panel.getByTestId('search-group-Assets')).toBeVisible()
  await expect(panel.getByTestId('search-group-Canvas text')).toBeVisible()
  const assetRow = panel.locator('[data-testid="search-hit"][data-kind="asset"]')
  await expect(assetRow).toContainText('gate-map.png')
  // One flat cursor walks ACROSS groups: ArrowDown steps from the
  // asset row into the canvas-text group.
  await expect(assetRow).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('ArrowDown')
  await expect(
    panel.locator('[data-testid="search-hit"][data-kind="canvas-text"]'),
  ).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('ArrowUp')
  await expect(assetRow).toHaveAttribute('aria-selected', 'true')
  await assetRow.click()
  const locRow = panel.locator('[data-testid="search-hit"][data-kind="asset-loc"]')
  await expect(locRow).toContainText('Ruins Board')
  await locRow.click()
  await expect(panel).not.toBeVisible()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.boardBCanvasId)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([world.assetPlacementId])
  await expect.poll(cameraCenterDistance(win, box, 600, 300)).toBeLessThan(30)
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().map((entry) => entry.canvasId),
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav.entries).toEqual([world.rootCanvasId, world.boardBCanvasId])
  expect(nav.cursor).toBe(1)

  await app.close()
})

test('canvas-text match navigates cross-canvas centered on the decoration; # flips to tag mode (§8.3/§4.8)', async () => {
  const { app, win } = await launchApp('ew-e2e-search-text-')
  const world = await seedSearchWorld(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Keyboard-only: type the phrase, Enter on the canvas-text hit.
  await win.getByTestId('charm-search').click()
  await win.getByTestId('search-input').fill('sunken')
  const panel = win.getByTestId('search-panel')
  await expect(
    panel.locator('[data-testid="search-hit"][data-kind="canvas-text"]'),
  ).toContainText('sunken')
  await win.keyboard.press('Enter')
  await expect(panel).not.toBeVisible()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.boardBCanvasId)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toEqual([world.decorationId])
  // Text AABB anchors top-left at (500,400); the estimated extent for
  // "sunken gate" at fontSize 16 is ~97x19 — the flight centers on
  // the box center, not the anchor.
  await expect.poll(cameraCenterDistance(win, box, 500 + 48, 400 + 10)).toBeLessThan(40)

  // A §8.1 navigation event: Back returns to the root board.
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().map((entry) => entry.canvasId),
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav.entries).toEqual([world.rootCanvasId, world.boardBCanvasId])
  await win.evaluate(() => window.__ewNav!.back())
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.rootCanvasId)

  // Leading # flips to tag mode: a CUSTOM completion list (never
  // <datalist>), Enter lands on the tag panel.
  await win.getByTestId('charm-search').click()
  await win.getByTestId('search-input').fill('#ru')
  await expect(
    panel.locator('[data-testid="search-hit"][data-kind="tag-completion"]'),
  ).toHaveText(/ruins/)
  await win.keyboard.press('Enter')
  await expect(panel).not.toBeVisible()
  await expect(win.getByTestId('tag-panel')).toBeVisible()
  await expect(win.getByTestId('tag-panel-input')).toHaveValue('ruins')

  await app.close()
})

test('Mod+P quick-open: keyboard round trip to a note and to a canvas; takeover guard; editor focus (§8.3)', async () => {
  const { app, win } = await launchApp('ew-e2e-search-quick-')
  const world = await seedSearchWorld(win)

  // Suppressed while a takeover owns the window (068 guard).
  await win.getByTestId('charm-outline').click()
  await win.keyboard.press('ControlOrMeta+p')
  await expect(win.getByTestId('search-panel')).not.toBeVisible()
  // The ⌕ CHARM is a mode switch instead: it returns to the board
  // and opens the panel — never a panel beneath the cover (§8.2).
  await win.getByTestId('charm-search').click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect(win.getByTestId('search-panel')).toBeVisible()
  // And the reverse: a takeover OPENING retires an open panel — the
  // two share a z-plane, and the takeover owns the window (§8.2).
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  await expect(win.getByTestId('search-panel')).not.toBeVisible()
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)

  // Round trip 1: board focus → Mod+P → title → Enter → note panel.
  await win.keyboard.press('ControlOrMeta+p')
  const panel = win.getByTestId('search-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-mode', 'quick')
  await win.getByTestId('search-input').fill('watcher')
  await expect(panel.locator('[data-testid="search-hit"]')).toContainText('Watcher')
  await win.keyboard.press('Enter')
  await expect(panel).not.toBeVisible()
  await expect(win.getByTestId('note-pane-title')).toContainText('Watcher')

  // Round trip 2: from INSIDE the note editor (capture beats
  // the editor) → both "Ruins Board" entries (note first, canvas
  // second by the stable sort) → ArrowDown → Enter navigates, a
  // history entry.
  await win.locator('[data-testid="note-editor-content"]').click()
  await win.keyboard.press('ControlOrMeta+p')
  await expect(panel).toBeVisible()
  await win.getByTestId('search-input').fill('ruins board')
  await expect(panel.locator('[data-testid="search-hit"]')).toHaveCount(2)
  await win.keyboard.press('ArrowDown')
  await win.keyboard.press('Enter')
  await expect(panel).not.toBeVisible()
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.canvasId()))
    .toBe(world.boardBCanvasId)
  const nav = await win.evaluate(() => ({
    entries: window.__ewNav!.entries().map((entry) => entry.canvasId),
    cursor: window.__ewNav!.cursor(),
  }))
  expect(nav.entries).toEqual([world.rootCanvasId, world.boardBCanvasId])
  expect(nav.cursor).toBe(1)

  await app.close()
})
