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
        commandId: crypto.randomUUID(),
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
async function pngBytes(win: Page, color: string): Promise<Buffer> {
  const bytes = await win.evaluate(async (fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 8, 8)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, color)
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
  expect(await revision(win)).toBe(beforeAlign + 1)

  // Distribute horizontally: gaps equalize (75 each), one command.
  const beforeDistribute = await revision(win)
  await win.getByTestId('distribute-horizontal').click()
  await expect
    .poll(async () => (await scenePlacements(win)).map((p) => p.x))
    .toEqual([150, 265, 380])
  expect(await revision(win)).toBe(beforeDistribute + 1)

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
  expect(await revision(win)).toBe(beforeSnap + 1)
  // Guides never outlive the gesture.
  expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)

  // Alt-drag repeats a near-edge drop without snapping.
  const beforeAlt = await revision(win)
  await win.keyboard.down('Alt')
  await win.mouse.move(box.x + 190, box.y + 150)
  await win.mouse.down()
  await win.mouse.move(box.x + 192, box.y + 154, { steps: 2 })
  expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)
  await win.mouse.up()
  await win.keyboard.up('Alt')
  await expect
    .poll(async () => (await scenePlacements(win))[1])
    .toMatchObject({ x: 192, y: 154 }) // exact pointer delta, no snap
  expect(await revision(win)).toBe(beforeAlt + 1)

  // Zoom to fit / to selection: camera-only, no durable command (the
  // revision is read before the debounced camera persist can land).
  const cameraBefore = await win.evaluate(() => window.__ewDebug!.camera())
  const beforeZoom = await revision(win)
  await win.getByTestId('zoom-fit').click()
  expect(await revision(win)).toBe(beforeZoom)
  const fitted = await win.evaluate(() => window.__ewDebug!.camera())
  expect(fitted).not.toEqual(cameraBefore)
  await win.getByTestId('zoom-selection').click()
  expect(await revision(win)).toBe(beforeZoom)
  const toSelection = await win.evaluate(() => window.__ewDebug!.camera())
  expect(toSelection).not.toEqual(fitted)

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
  expect(await revision(win)).toBe(beforeSet + 1)
  expect((await sceneBackground(win)).settings).toEqual({ x: 0, y: 0, scale: 1, opacity: 1 })
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
    .not.toBeNull()

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
    .toMatchObject({ x: 40, y: 20 })
  // Still ephemeral: nothing durable happened while dragging.
  expect(await revision(win)).toBe(beforeEdit)
  expect((await sceneBackground(win)).settings).toMatchObject({ x: 0, y: 0 })
  await win.getByTestId('bg-edit-done').click()
  await expect
    .poll(async () => (await sceneBackground(win)).settings)
    .toEqual({ x: 40, y: 20, scale: 1, opacity: 1 })
  expect(await revision(win)).toBe(beforeEdit + 1)
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
    .toMatchObject({ x: 0, y: 0 })
  await win.keyboard.press('Escape')
  await expect
    .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
    .toBe(false)
  expect(await win.evaluate(() => window.__ewBoardDebug!.backgroundSprite())).toMatchObject({
    x: 40,
    y: 20,
  })
  expect(await revision(win)).toBe(beforeCancel)

  // Reset Background Transform: one command back to identity.
  const beforeReset = await revision(win)
  await win.getByTestId('bg-reset').click()
  await expect
    .poll(async () => (await sceneBackground(win)).settings)
    .toEqual({ x: 0, y: 0, scale: 1, opacity: 1 })
  expect(await revision(win)).toBe(beforeReset + 1)

  // Background color sits beneath the image: both fields coexist.
  const beforeColor = await revision(win)
  await win.getByTestId('bg-color').fill('#336699')
  await expect.poll(async () => (await sceneBackground(win)).color).toBe('#336699')
  expect(await revision(win)).toBe(beforeColor + 1)
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
  expect(replaced.settings).toEqual({ x: 0, y: 0, scale: 1, opacity: 1 })
  expect(await revision(win)).toBe(beforeReplace + 2)

  // Remove Background: one command; the color layer stays.
  const beforeRemove = await revision(win)
  await win.getByTestId('bg-remove').click()
  await expect.poll(async () => (await sceneBackground(win)).assetId).toBeNull()
  expect(await revision(win)).toBe(beforeRemove + 1)
  expect((await sceneBackground(win)).color).toBe('#336699')

  // Clear the color: one command.
  const beforeClear = await revision(win)
  await win.getByTestId('bg-color-clear').click()
  await expect.poll(async () => (await sceneBackground(win)).color).toBeNull()
  expect(await revision(win)).toBe(beforeClear + 1)

  await app.close()
})
