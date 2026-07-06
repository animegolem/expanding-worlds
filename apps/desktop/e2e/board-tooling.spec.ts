import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
    /** e2e hooks for AI-IMP-022; separate from host's __ewDebug. */
    __ewBoardDebug?: {
      backgroundMode: () => boolean
      backgroundSprite: () => { x: number; y: number; scale: number; alpha: number } | null
    }
  }
}

/**
 * AI-IMP-022 acceptance (§17 items 2 and 4): align/distribute commit
 * one TransformContent each, snapping shows guides and still commits
 * one command (Alt bypasses), zoom-to-fit/selection are camera-only,
 * and the full §6.7 background lifecycle is one durable command per
 * operation with the color rendered independently beneath the image.
 */

async function launch(prefix: string) {
  const projectDir = mkdtempSync(join(tmpdir(), prefix))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(
    () => window.__ewDebug !== undefined && window.__ewBoardDebug !== undefined,
  )
  return { app, win }
}

async function runCommand(win: Page, commandType: string, payload: unknown): Promise<void> {
  await win.evaluate(
    async ({ commandType, payload }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const { id: projectId } = project.result as { id: string }
      const result = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (result.status !== 'committed') throw new Error(`${commandType}: ${result.status}`)
    },
    { commandType, payload },
  )
}

/**
 * Content commands committed after `sinceRevision`, camera persists
 * excluded. Exact revision arithmetic is unwinnable on slow runners:
 * flights schedule a debounced SetCanvasCamera whose landing time is
 * machine-dependent, so delta assertions go through the §10.2
 * command log instead (AI-IMP-050).
 */
async function contentCommandsSince(win: Page, sinceRevision: number): Promise<string[]> {
  return win.evaluate(async (since) => {
    const log = await window.ew.project.query('listCommandLog', { sinceRevision: since })
    if (!log.ok) throw new Error(log.message)
    return (log.result as Array<{ commandType: string }>)
      .map((row) => row.commandType)
      .filter((type) => type !== 'SetCanvasCamera')
  }, sinceRevision)
}

async function revision(win: Page): Promise<number> {
  return win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    return (project.result as { revision: number }).revision
  })
}

async function scenePlacements(win: Page): Promise<Array<{ id: string; x: number; y: number }>> {
  return win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    if (!scene.ok) throw new Error(scene.message)
    const { items } = scene.result as {
      items: Array<{ itemKind: string; id: string; x: number; y: number }>
    }
    return items
      .filter((item) => item.itemKind === 'placement')
      .map(({ id, x, y }) => ({ id, x, y }))
  })
}

interface BackgroundLite {
  color: string | null
  assetId: string | null
  settings: Record<string, number> | null
}

async function sceneBackground(win: Page): Promise<BackgroundLite> {
  return win.evaluate(async () => {
    const scene = await window.ew.project.query('getCanvasScene', {
      canvasId: window.__ewDebug!.canvasId(),
    })
    if (!scene.ok) throw new Error(scene.message)
    return (scene.result as { background: BackgroundLite }).background
  })
}

/** Renders a solid PNG in-page so each color yields distinct bytes. */
async function pngBytes(win: Page, color: string, size = 8): Promise<Buffer> {
  const bytes = await win.evaluate(async ({ fill, size }) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, size, size)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { fill: color, size })
  return Buffer.from(bytes)
}

/** In-page import through the staged pipeline; returns the assetId. */
async function importPng(win: Page, color: string): Promise<string> {
  return win.evaluate(async (fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 8, 8)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const imported = await window.ew.project.importAsset({
      bytes,
      originalFilename: `bg-${fill.replace('#', '')}.png`,
    })
    if (!imported.ok) throw new Error(imported.message)
    return imported.assetId
  }, color)
}

test('align, distribute, snap with guides, Alt bypass, and camera-only zoom', async () => {
  const { app, win } = await launch('ew-e2e-board-')

  // Buttons gate on selection size before anything is selected.
  await expect(win.getByTestId('align-left')).toBeDisabled()
  await expect(win.getByTestId('distribute-horizontal')).toBeDisabled()

  // Seed three 40×40 dot placements.
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  for (const [x, y] of [
    [150, 150],
    [260, 200],
    [380, 260],
  ] as const) {
    const nodeId = crypto.randomUUID()
    await runCommand(win, 'CreateNode', { nodeId })
    await runCommand(win, 'CreatePlacement', {
      placementId: crypto.randomUUID(),
      canvasId,
      nodeId,
      x,
      y,
      width: 40,
      height: 40,
    })
  }
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Marquee-select all three (camera is identity: world = screen).
  await win.mouse.move(box.x + 100, box.y + 100)
  await win.mouse.down()
  await win.mouse.move(box.x + 430, box.y + 300, { steps: 4 })
  await win.mouse.up()
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 3)

  // Align Top: exactly one TransformContent; every center lands on 150.
  const beforeAlign = await revision(win)
  await win.getByTestId('align-top').click()
  await expect
    .poll(async () => (await scenePlacements(win)).map((p) => p.y))
    .toEqual([150, 150, 150])
  expect(await contentCommandsSince(win, beforeAlign)).toHaveLength(1)

  // Distribute horizontally: gaps equalize (75 each), one command.
  const beforeDistribute = await revision(win)
  await win.getByTestId('distribute-horizontal').click()
  await expect
    .poll(async () => (await scenePlacements(win)).map((p) => p.x))
    .toEqual([150, 265, 380])
  expect(await contentCommandsSince(win, beforeDistribute)).toHaveLength(1)

  // Drag the middle placement toward the first one's right edge
  // (world 170): at proposed left 173 the snap pulls it flush, a
  // vertical smart guide shows the matched edge, and the drop is
  // still exactly one TransformContent.
  await win.mouse.click(box.x + 600, box.y + 500) // clear selection
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 0)
  await win.mouse.click(box.x + 265, box.y + 150)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  const beforeSnap = await revision(win)
  await win.mouse.move(box.x + 265, box.y + 150)
  await win.mouse.down()
  await win.mouse.move(box.x + 193, box.y + 150, { steps: 6 })
  await expect
    .poll(() =>
      win.evaluate(() =>
        window.__ewDebug!.guides().some((g) => g.axis === 'x' && g.position === 170),
      ),
    )
    .toBe(true)
  await win.mouse.up()
  await expect
    .poll(async () => (await scenePlacements(win)).map((p) => [p.x, p.y]))
    .toEqual([
      [150, 150],
      [190, 150], // left edge 170 = first placement's right edge
      [380, 150],
    ])
  expect(await contentCommandsSince(win, beforeSnap)).toHaveLength(1)
  // Guides never outlive the gesture.
  expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)

  // Alt held MID-drag repeats a near-edge drop without snapping.
  // (⌥ at drag START duplicates since §6.9 rev 0.17 / AI-IMP-062;
  // the snap bypass reads the modifier per pointermove, so pressing
  // it after the press keeps the escape hatch.)
  const beforeAlt = await revision(win)
  await win.mouse.move(box.x + 190, box.y + 150)
  await win.mouse.down()
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 192, box.y + 154, { steps: 2 })
  expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)
  await win.mouse.up()
  await win.keyboard.up('Alt')
  await expect
    .poll(async () => (await scenePlacements(win))[1])
    .toMatchObject({ x: 192, y: 154 }) // exact pointer delta, no snap
  expect(await contentCommandsSince(win, beforeAlt)).toHaveLength(1)

  // Zoom to fit / to selection: camera-only, no durable command (the
  // revision is read before the debounced camera persist can land).
  const cameraBefore = await win.evaluate(() => window.__ewDebug!.camera())
  const beforeZoom = await revision(win)
  await win.getByTestId('zoom-fit').click()
  expect(await contentCommandsSince(win, beforeZoom)).toHaveLength(0)
  // §6.9 rev 0.11: fits EASE — poll past the flight.
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera()))
    .not.toEqual(cameraBefore)
  const fitted = await win.evaluate(() => window.__ewDebug!.camera())
  await win.getByTestId('zoom-selection').click()
  expect(await contentCommandsSince(win, beforeZoom)).toHaveLength(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera()))
    .not.toEqual(fitted)

  await app.close()
})

test('background lifecycle: set, edit in explicit mode, reset, replace, remove, color beneath', async () => {
  const { app, win } = await launch('ew-e2e-background-')
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Set from a selected image placement's asset (§6.7 path a).
  const asset1 = await importPng(win, '#ff0000')
  await runCommand(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId,
    placementId: crypto.randomUUID(),
    x: 400,
    y: 300,
    appearance: { kind: 'image', assetId: asset1, crop: null },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.mouse.click(box.x + 400, box.y + 300)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expect(win.getByTestId('bg-set-from-selection')).toBeEnabled()
  const beforeSet = await revision(win)
  await win.getByTestId('bg-set-from-selection').click()
  await expect.poll(async () => (await sceneBackground(win)).assetId).toBe(asset1)
  expect(await contentCommandsSince(win, beforeSet)).toHaveLength(1)
  // §6.7 rev 0.11: from-selection preserves the placed world rect —
  // the 8×8 image at natural size centered on (400, 300).
  expect((await sceneBackground(win)).settings).toEqual({ x: 396, y: 296, scale: 1, opacity: 1 })
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
    .not.toBeNull()
  // Neutralize the framing flight so the drag math below stays in
  // identity screen space.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  // Edit Background Position: explicit mode, ephemeral drag, ONE
  // SetCanvasBackground on Done.
  await win.getByTestId('bg-edit').click()
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
    .toBe(true)
  const beforeEdit = await revision(win)
  await win.mouse.move(box.x + 600, box.y + 400)
  await win.mouse.down()
  await win.mouse.move(box.x + 640, box.y + 420, { steps: 4 })
  await win.mouse.up()
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
    .toMatchObject({ x: 436, y: 316 })
  // Still ephemeral: nothing durable happened while dragging.
  expect(await contentCommandsSince(win, beforeEdit)).toHaveLength(0)
  expect((await sceneBackground(win)).settings).toMatchObject({ x: 396, y: 296 })
  await win.getByTestId('bg-edit-done').click()
  await expect
    .poll(async () => (await sceneBackground(win)).settings)
    .toEqual({ x: 436, y: 316, scale: 1, opacity: 1 })
  expect(await contentCommandsSince(win, beforeEdit)).toHaveLength(1)
  expect(await win.evaluate(() => window.__ewBoardDebug!.backgroundMode())).toBe(false)

  // Escape reverts the sprite and commits nothing.
  await win.getByTestId('bg-edit').click()
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
    .toBe(true)
  const beforeCancel = await revision(win)
  await win.mouse.move(box.x + 600, box.y + 400)
  await win.mouse.down()
  await win.mouse.move(box.x + 560, box.y + 380, { steps: 4 })
  await win.mouse.up()
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
    .toMatchObject({ x: 396, y: 296 })
  await win.keyboard.press('Escape')
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
    .toBe(false)
  expect(await win.evaluate(() => window.__ewBoardDebug!.backgroundSprite())).toMatchObject({
    x: 436,
    y: 316,
  })
  expect(await contentCommandsSince(win, beforeCancel)).toHaveLength(0)

  // Reset Background Transform: one command back to the normalized
  // stage default (§6.7 rev 0.11): 2048 / 8 native px = scale 256.
  const beforeReset = await revision(win)
  await win.getByTestId('bg-reset').click()
  await expect
    .poll(async () => (await sceneBackground(win)).settings)
    .toEqual({ x: 0, y: 0, scale: 256, opacity: 1 })
  expect(await contentCommandsSince(win, beforeReset)).toHaveLength(1)

  // Background color sits beneath the image: both fields coexist.
  const beforeColor = await revision(win)
  await win.getByTestId('bg-color').fill('#336699')
  await expect.poll(async () => (await sceneBackground(win)).color).toBe('#336699')
  expect(await contentCommandsSince(win, beforeColor)).toHaveLength(1)
  expect((await sceneBackground(win)).assetId).toBe(asset1)

  // Replace from a file pick: the hidden input feeds importAsset then
  // one SetCanvasBackground (revision +2: CommitAssetImport + set).
  const beforeReplace = await revision(win)
  await win.getByTestId('bg-file-input').setInputFiles({
    name: 'bg-green.png',
    mimeType: 'image/png',
    buffer: await pngBytes(win, '#00ff00'),
  })
  await expect
    .poll(async () => (await sceneBackground(win)).assetId)
    .not.toBe(asset1)
  const replaced = await sceneBackground(win)
  expect(replaced.assetId).not.toBeNull()
  // Replace fits the new 8×8 image into the prior 2048-unit extent.
  expect(replaced.settings).toEqual({ x: 0, y: 0, scale: 256, opacity: 1 })
  expect(await contentCommandsSince(win, beforeReplace)).toHaveLength(2)

  // Remove Background: one command; the color layer stays. (The
  // replace above flew the camera — settle its debounced persist.)
  const beforeRemove = await revision(win)
  await win.getByTestId('bg-remove').click()
  await expect.poll(async () => (await sceneBackground(win)).assetId).toBeNull()
  expect(await contentCommandsSince(win, beforeRemove)).toHaveLength(1)
  expect((await sceneBackground(win)).color).toBe('#336699')

  // Clear the color: one command.
  const beforeClear = await revision(win)
  await win.getByTestId('bg-color-clear').click()
  await expect.poll(async () => (await sceneBackground(win)).color).toBeNull()
  expect(await contentCommandsSince(win, beforeClear)).toHaveLength(1)

  await app.close()
})

test('delete selection with §9.2 notice, z-order recovery, select-all (AI-IMP-028)', async () => {
  const { app, win } = await launch('ew-e2e-delete-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // Two bare pins and a rect decoration.
  for (const [x, y] of [
    [150, 150],
    [260, 200],
  ]) {
    await runCommand(win, 'CreatePin', {
      nodeId: crypto.randomUUID(),
      canvasId,
      placementId: crypto.randomUUID(),
      x,
      y,
      appearance: { kind: 'dot', color: '#4a90d9' },
    })
  }
  await runCommand(win, 'CreateDecoration', {
    decorationId: crypto.randomUUID(),
    canvasId,
    kind: 'shape',
    data: { shape: 'rect', x: 330, y: 130, width: 60, height: 60, stroke: '#dde3ea', strokeWidth: 2 },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().total === 3)

  // Marquee everything, Delete: one durable command empties the board
  // and the bare-node auto-trash surfaces the Keep in Project notice.
  await win.mouse.move(box.x + 80, box.y + 80)
  await win.mouse.down()
  await win.mouse.move(box.x + 450, box.y + 300, { steps: 5 })
  await win.mouse.up()
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 3)
  const beforeDelete = await revision(win)
  await win.keyboard.press('Backspace')
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().total === 0)
  expect(await contentCommandsSince(win, beforeDelete)).toHaveLength(1)
  await expect(win.getByTestId('board-notice')).toBeVisible()
  await expect(win.getByTestId('board-notice')).toContainText('moved to Trash')
  await win.getByTestId('board-notice-keep').click()
  await expect(win.getByTestId('board-notice')).toBeHidden()

  // Z-order recovery: a small rect fully covered by a later big rect
  // becomes clickable after Send to Back on the big one.
  const smallId = crypto.randomUUID()
  const bigId = crypto.randomUUID()
  await runCommand(win, 'CreateDecoration', {
    decorationId: smallId,
    canvasId,
    kind: 'shape',
    data: { shape: 'rect', x: 280, y: 280, width: 40, height: 40, stroke: '#dde3ea', strokeWidth: 2 },
  })
  await runCommand(win, 'CreateDecoration', {
    decorationId: bigId,
    canvasId,
    kind: 'shape',
    data: {
      shape: 'rect',
      x: 200,
      y: 200,
      width: 200,
      height: 200,
      stroke: '#8a94a0',
      strokeWidth: 2,
      fill: '#2b2f36',
    },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 2)
  await win.mouse.click(box.x + 300, box.y + 300)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  expect(await win.evaluate(() => window.__ewDebug!.selection()[0])).toBe(bigId)
  await win.keyboard.press('Control+Shift+BracketLeft') // send to back
  await expect
    .poll(async () => {
      await win.mouse.click(box.x + 300, box.y + 300)
      return win.evaluate(() => window.__ewDebug!.selection()[0] ?? null)
    })
    .toBe(smallId)

  // Select all, then the toolbar's To front on the small rect.
  await win.keyboard.press('Control+KeyA')
  expect(await win.evaluate(() => window.__ewDebug!.selection().length)).toBe(2)
  // Clear first: clicking an already-selected item keeps the multi
  // selection (it may be a drag start), so it can't collapse to one.
  await win.mouse.click(box.x + 550, box.y + 450)
  await win.mouse.click(box.x + 300, box.y + 300)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.getByTestId('order-front').click()
  await expect
    .poll(async () => {
      await win.mouse.click(box.x + 300, box.y + 300)
      return win.evaluate(() => window.__ewDebug!.selection()[0] ?? null)
    })
    .toBe(smallId)

  await app.close()
})

test('background stage: grid, normalize, replace preserves extent, from-selection preserves rect (AI-IMP-032)', async () => {
  const { app, win } = await launch('ew-e2e-stage-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Backgroundless: adaptive grid is on, no extent.
  const initial = await win.evaluate(() => window.__ewDebug!.stage())
  expect(initial.gridVisible).toBe(true)
  expect(initial.extent).toBeNull()

  // Set an 8×8 image from file → the STAGE normalizes to 2048 world
  // units, the grid hides, and the camera eases to frame the extent.
  await win.getByTestId('bg-file-input').setInputFiles({
    name: 'tiny-map.png',
    mimeType: 'image/png',
    buffer: await pngBytes(win, '#446688'),
  })
  await expect
    .poll(async () => (await win.evaluate(() => window.__ewDebug!.stage())).extent?.width ?? 0)
    .toBe(2048)
  // §6.7 rev 0.12: an 8px source raises the non-blocking softness
  // notice — message only, no Keep in Project action.
  await expect(win.getByTestId('board-notice')).toBeVisible()
  await expect(win.getByTestId('board-notice')).toContainText('soft')
  await expect(win.getByTestId('board-notice-keep')).toHaveCount(0)
  await win.getByTestId('board-notice-dismiss').click()
  const staged = await win.evaluate(() => window.__ewDebug!.stage())
  expect(staged.gridVisible).toBe(false)
  const settings = (await sceneBackground(win)).settings as { scale: number; x: number; y: number }
  expect(settings.scale).toBe(2048 / 8)
  // Flight settles centered on the extent.
  await expect
    .poll(async () => (await win.evaluate(() => window.__ewDebug!.stage())).flightActive)
    .toBe(false)
  const centered = await win.evaluate(() => {
    const cam = window.__ewDebug!.camera()
    const stage = window.__ewDebug!.stage().extent!
    return {
      cx: (stage.x + stage.width / 2 - cam.x) * cam.zoom,
      cy: (stage.y + stage.height / 2 - cam.y) * cam.zoom,
    }
  })
  expect(centered.cx).toBeCloseTo(box.width / 2, 0)
  expect(centered.cy).toBeCloseTo(box.height / 2, 0)

  // Shrink the stage deliberately, then REPLACE with a 16×16 image:
  // the new image fits the edited extent (800 wide → scale 50), not
  // the canonical width.
  await runCommand(win, 'SetCanvasBackground', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    assetId: (await sceneBackground(win)).assetId,
    settings: { x: 40, y: 60, scale: 100, opacity: 1 },
  })
  await expect
    .poll(async () => ((await sceneBackground(win)).settings as { scale: number }).scale)
    .toBe(100)
  await win.getByTestId('bg-file-input').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: await pngBytes(win, '#886644', 16),
  })
  await expect
    .poll(async () => ((await sceneBackground(win)).settings as { scale: number }).scale)
    .toBe(50)
  const replaced = (await sceneBackground(win)).settings as { x: number; y: number }
  expect(replaced.x).toBe(40)
  expect(replaced.y).toBe(60)

  // Remove → grid returns.
  await win.getByTestId('bg-remove').click()
  await expect
    .poll(async () => (await win.evaluate(() => window.__ewDebug!.stage())).gridVisible)
    .toBe(true)

  // From-selection preserves the placed rect: an 8×8 image stretched
  // to 400×400 at center (500, 300) becomes a 400-unit stage at
  // (300, 100) with scale 50.
  const assetId = await importPng(win, '#227755')
  const placementId = crypto.randomUUID()
  await runCommand(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    placementId,
    x: 500,
    y: 300,
    appearance: { kind: 'image', assetId, crop: null },
  })
  await runCommand(win, 'TransformContent', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    items: [
      {
        kind: 'placement',
        placementId,
        x: 500,
        y: 300,
        width: 400,
        height: 400,
        scale: 1,
        rotation: 0,
      },
    ],
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  await win.mouse.click(box.x + 500, box.y + 300)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expect(win.getByTestId('bg-set-from-selection')).toBeEnabled()
  await win.getByTestId('bg-set-from-selection').click()
  await expect
    .poll(async () => ((await sceneBackground(win)).settings as { scale?: number })?.scale ?? 0)
    .toBe(400 / 8)
  const preserved = (await sceneBackground(win)).settings as { x: number; y: number }
  expect(preserved.x).toBe(300)
  expect(preserved.y).toBe(100)

  await app.close()
})
