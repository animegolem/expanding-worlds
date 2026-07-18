import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-020 acceptance: §6.1 import surfaces (multi-file drop with
 * cascade, browser-drag attribution, unsupported rejection, URL-only
 * failure, clipboard paste at view center) and the §6.2 CreatePin
 * transaction incl. its DeleteDraftPin inverse round-trip. Drops and
 * pastes are synthesized in-page (DataTransfer + DragEvent), which
 * exercises the real listeners without OS-level drag simulation.
 */

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
  'h6FO1AAAAABJRU5ErkJggg=='

interface DropSpec {
  /** base64 file payloads added as image/png Files. */
  files?: Array<{ name: string; base64: string; type: string }>
  uriList?: string
  offsetX: number
  offsetY: number
}

async function launch(
  prefix: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; win: Page }> {
  const projectDir = mkdtempSync(join(tmpdir(), prefix))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir, ...extraEnv },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  return { app, win }
}

function dropOnCanvas(win: Page, spec: DropSpec): Promise<void> {
  return win.evaluate((s: DropSpec) => {
    const dt = new DataTransfer()
    for (const file of s.files ?? []) {
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
      dt.items.add(new File([bytes], file.name, { type: file.type }))
    }
    if (s.uriList !== undefined) dt.setData('text/uri-list', s.uriList)
    const host = document.querySelector('[data-testid="canvas-host"]')!
    const rect = host.getBoundingClientRect()
    host.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: rect.left + s.offsetX,
        clientY: rect.top + s.offsetY,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, spec)
}

function placements(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}

async function query<T>(win: Page, name: string, args?: unknown): Promise<T> {
  return win.evaluate(
    async (q: { name: string; args?: unknown }) => {
      const response = await window.ew.project.query(q.name, q.args)
      if (!response.ok) throw new Error(`${q.name} failed: ${response.message}`)
      return response.result
    },
    { name, args },
  ) as Promise<T>
}

test('import surfaces: drop, attribution, rejection, URL failure, paste', async () => {
  // The success-path fixture serves from 127.0.0.1, which the SSRF
  // guard refuses; the guard itself is tested separately below.
  const { app, win } = await launch('ew-e2e-import-', { EW_TEST_ALLOW_PRIVATE_FETCH: '1' })
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // -- multi-file drop: two files, one drop point, cascading offsets.
  await dropOnCanvas(win, {
    files: [
      { name: 'first.png', base64: PNG_1X1_BASE64, type: 'image/png' },
      { name: 'second.png', base64: PNG_1X1_BASE64, type: 'image/png' },
    ],
    offsetX: 100,
    offsetY: 80,
  })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)

  // Identical bytes → dedupe keeps one blob but never merges records:
  // two Asset rows, natural 1×1 dimensions on both placements.
  let assets = await query<Array<{ id: string; sourceUrl: string | null }>>(win, 'listAssets')
  expect(assets).toHaveLength(2)
  const scene = await query<{
    items: Array<{ itemKind: string; x: number; y: number; width: number | null; height: number | null }>
  }>(win, 'getCanvasScene', { canvasId })
  const dropped = scene.items
    .filter((item) => item.itemKind === 'placement')
    .sort((a, b) => a.x - b.x)
  // DragEvent clientX/Y coerce to integers, so allow subpixel skew
  // from the host element's fractional bounding rect.
  expect(Math.abs(dropped[0]!.x - 100)).toBeLessThan(1.5)
  expect(Math.abs(dropped[0]!.y - 80)).toBeLessThan(1.5)
  expect(dropped[0]).toMatchObject({ width: 1, height: 1 })
  expect(Math.abs(dropped[1]!.x - 124)).toBeLessThan(1.5)
  expect(Math.abs(dropped[1]!.y - 104)).toBeLessThan(1.5)
  expect(dropped[1]).toMatchObject({ width: 1, height: 1 })

  // -- browser drag: bytes + uri-list → source_url recorded (§6.1).
  await dropOnCanvas(win, {
    files: [{ name: 'from-web.png', base64: PNG_1X1_BASE64, type: 'image/png' }],
    uriList: 'https://example.com/gallery/from-web.png',
    offsetX: 300,
    offsetY: 80,
  })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(3)
  assets = await query(win, 'listAssets')
  expect(assets.map((a) => a.sourceUrl)).toContain('https://example.com/gallery/from-web.png')

  // -- unsupported bytes: clear notice, zero records (§6.1).
  await dropOnCanvas(win, {
    files: [{ name: 'notes.txt', base64: btoa('not an image'), type: 'text/plain' }],
    offsetX: 150,
    offsetY: 150,
  })
  await expect(win.getByTestId('import-error')).toBeVisible()
  await expect(win.getByTestId('import-error')).toContainText('not a supported raster image')
  expect(await placements(win)).toBe(3)
  expect(await query<unknown[]>(win, 'listAssets')).toHaveLength(3)
  await win.getByTestId('import-error-dismiss').click()

  // -- URL-only drop that cannot be fetched: error, zero records.
  await dropOnCanvas(win, {
    uriList: 'http://127.0.0.1:1/unreachable.png',
    offsetX: 150,
    offsetY: 150,
  })
  await expect(win.getByTestId('import-error')).toBeVisible({ timeout: 35_000 })
  expect(await placements(win)).toBe(3)
  expect(await query<unknown[]>(win, 'listAssets')).toHaveLength(3)
  await win.getByTestId('import-error-dismiss').click()

  // -- URL-only drop that succeeds: main fetches as a user-initiated
  // act and the asset records the source URL (§6.1).
  const png = Buffer.from(PNG_1X1_BASE64, 'base64')
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'image/png')
    res.end(png)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const fetchedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fetched.png`
  await dropOnCanvas(win, { uriList: fetchedUrl, offsetX: 320, offsetY: 220 })
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(4)
  assets = await query(win, 'listAssets')
  expect(assets.map((a) => a.sourceUrl)).toContain(fetchedUrl)
  server.close()

  // -- clipboard paste with the cursor over the canvas → cursor point.
  const paste = (name: string): Promise<void> =>
    win.evaluate(
      ({ png, filename }) => {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], filename, { type: 'image/png' }))
        const event = new Event('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', { value: dt })
        window.dispatchEvent(event)
      },
      { png: PNG_1X1_BASE64, filename: name },
    )
  const findNear = (
    items: Array<{ itemKind: string; x: number; y: number }>,
    at: { x: number; y: number },
  ) =>
    items.filter(
      (item) =>
        item.itemKind === 'placement' &&
        Math.abs(item.x - at.x) < 2 &&
        Math.abs(item.y - at.y) < 2,
    )
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.move(box.x + 220, box.y + 170)
  await paste('cursor-shot.png')
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(5)
  let pasted = await query<{ items: Array<{ itemKind: string; x: number; y: number }> }>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  // Camera is identity in a fresh project: world = canvas-local screen.
  expect(findNear(pasted.items, { x: 220, y: 170 })).toHaveLength(1)

  // -- paste with the cursor OFF the canvas → view center (§6.1).
  // The window IS the board (AI-IMP-064): no docked chrome remains
  // to park the pointer on, so "off the canvas" now means out of the
  // window — synthesize the pointerleave that exit fires.
  await win.evaluate(() =>
    document
      .querySelector('[data-testid="canvas-host"]')!
      .dispatchEvent(new PointerEvent('pointerleave')),
  )
  await paste('center-shot.png')
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(6)
  pasted = await query<{ items: Array<{ itemKind: string; x: number; y: number }> }>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  expect(findNear(pasted.items, { x: box.width / 2, y: box.height / 2 })).toHaveLength(1)

  await app.close()
})

test('the pin tool commits one command; inverse cleans up (§6.2 rev 0.20)', async () => {
  const { app, win } = await launch('ew-e2e-createpin-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  const revisionOf = () =>
    win.evaluate(async () => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      return (project.result as { revision: number }).revision
    })

  // -- pin tool (◉, N): click places a provisional dot + the focused
  // phantom; the FIRST COMMITTED EDIT is exactly one CreatePin.
  const before = await revisionOf()
  await win.keyboard.press('n')
  await win.mouse.click(box.x + 400, box.y + 300)
  await expect(win.getByTestId('pin-provisional-ghost')).toBeVisible()
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCSS('opacity', '0.45')
  await expect(win.getByTestId('pin-phantom')).toBeVisible()
  // Re-click replaces the provisional pair whole; switching tools clears it.
  await win.mouse.click(box.x + 440, box.y + 330)
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCount(1)
  await expect(win.getByTestId('pin-phantom')).toHaveCount(1)
  await win.keyboard.press('v')
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCount(0)
  await expect(win.getByTestId('pin-phantom')).toHaveCount(0)
  await win.keyboard.press('n')
  await win.mouse.click(box.x + 400, box.y + 300)
  // Nothing persists yet (§6.2): revision untouched while drafting.
  expect(await revisionOf()).toBe(before)
  await win.getByTestId('pin-phantom-draft').fill('Harbor Watch')
  await win.getByTestId('pin-phantom-draft').blur()
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  // Exactly ONE user-level command committed (§6.2).
  expect(await revisionOf()).toBe(before + 1)
  // The provisional dot yielded to the real placement, and the panel
  // re-tethered into the ordinary note editor.
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCount(0)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor Watch/)

  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await query<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  const pin = scene.items.find((item) => item['itemKind'] === 'placement')!
  // §4.5: labels default visible, so the placed dot shows the title.
  expect(pin).toMatchObject({
    labelVisible: 1,
    noteTitle: 'Harbor Watch',
    appearanceKind: 'dot',
  })

  // -- Escape before typing: nothing ever existed, dot included.
  // (Click left of the open panel — DOM panels sit above the canvas.)
  const beforeEscape = await revisionOf()
  await win.mouse.click(box.x + 200, box.y + 550)
  await expect(win.getByTestId('pin-provisional-ghost')).toBeVisible()
  await win.getByTestId('pin-phantom-draft').press('Escape')
  await expect(win.getByTestId('pin-phantom')).toHaveCount(0)
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCount(0)
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)
  expect(await revisionOf()).toBe(beforeEscape)
  expect(await placements(win)).toBe(1)

  // -- image pin with a non-destructive crop + note: the §6.2
  // one-transaction backbone, driven directly now that appearance
  // richness flows through ordinary node operations, not a dialog.
  const beforeImage = await revisionOf()
  await win.evaluate(
    async ({ base64, targetCanvasId }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const imported = await window.ew.project.importAsset({
        bytes,
        originalFilename: 'map.png',
      })
      if (!imported.ok) throw new Error('import failed')
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
          canvasId: targetCanvasId,
          placementId: crypto.randomUUID(),
          x: 600,
          y: 300,
          appearance: {
            kind: 'image',
            assetId: imported.assetId,
            crop: { x: 0, y: 0, width: 1, height: 1 },
          },
          note: { kind: 'create', noteId: crypto.randomUUID(), title: 'Cropped Map' },
        },
      })
      if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome))
    },
    { base64: PNG_1X1_BASE64, targetCanvasId: canvasId },
  )
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  // Import commits as infrastructure ahead of the ONE CreatePin:
  // exactly two commands (CommitAssetImport + CreatePin).
  expect(await revisionOf()).toBe(beforeImage + 2)
  const imageScene = await query<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  const imagePin = imageScene.items.find((item) => item['noteTitle'] === 'Cropped Map')!
  expect(imagePin).toMatchObject({
    appearanceKind: 'image',
    appearanceCrop: JSON.stringify({ x: 0, y: 0, width: 1, height: 1 }),
    labelVisible: 1,
    width: 1,
    height: 1,
  })

  // -- duplicate title through the pin tool: the §7.7 conflict dialog
  // appears, nothing is created, and Choose Different keeps drafting.
  await win.keyboard.press('n')
  await win.mouse.click(box.x + 500, box.y + 500)
  await win.getByTestId('pin-phantom-draft').fill('Harbor Watch')
  await win.getByTestId('pin-phantom-draft').blur()
  await expect(win.getByTestId('title-conflict-dialog')).toBeVisible()
  expect(await placements(win)).toBe(2)
  await win.getByTestId('conflict-choose-different').click()
  await win.getByTestId('pin-phantom-draft').press('Escape')
  await expect(win.getByTestId('pin-provisional-ghost')).toHaveCount(0)
  await win.keyboard.press('v')

  // -- direct CreatePin + inverse round-trip (revision +1 each).
  const result = await win.evaluate(async (targetCanvasId) => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const run = async (commandType: string, payload: unknown) => {
      const outcome = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (outcome.status !== 'committed') {
        throw new Error(`${commandType}: ${JSON.stringify(outcome)}`)
      }
      return outcome
    }
    const noteId = crypto.randomUUID()
    const created = await run('CreatePin', {
      nodeId: crypto.randomUUID(),
      canvasId: targetCanvasId,
      placementId: crypto.randomUUID(),
      x: 400,
      y: 300,
      appearance: { kind: 'dot', color: '#22aa66' },
      note: { kind: 'create', noteId, title: 'Ephemeral Pin' },
    })
    const undone = await run(created.inverse!.commandType, created.inverse!.payload)
    return { noteId, createRevision: created.revision, undoRevision: undone.revision }
  }, canvasId)
  expect(result.undoRevision).toBe(result.createRevision + 1)
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  const note = await query<{ lifecycleState: string }>(win, 'getNote', { noteId: result.noteId })
  expect(note.lifecycleState).toBe('trashed')

  await app.close()
})

test('pin ghost materializes at its placement zoom and resizes as one circle (AI-IMP-310)', async () => {
  const { app, win } = await launch('ew-e2e-pin-diameter-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const point = { x: box.x + 300, y: box.y + 300 }

  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.25 }))
  await win.keyboard.press('n')
  await win.mouse.click(point.x, point.y)

  const ghost = win.getByTestId('pin-provisional-ghost')
  await expect(ghost).toBeVisible()
  const ghostBox = (await ghost.boundingBox())!
  expect(ghostBox.width).toBeCloseTo(26, 1)
  expect(ghostBox.height).toBeCloseTo(26, 1)

  await win.getByTestId('pin-phantom-draft').fill('Zoom Pin')
  await win.getByTestId('pin-phantom-draft').blur()
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  await expect(ghost).toHaveCount(0)

  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const placement = async () => {
    const scene = await query<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
      canvasId,
    })
    return scene.items.find((item) => item['noteTitle'] === 'Zoom Pin')!
  }
  await expect.poll(async () => (await placement())['width']).toBe(104)
  expect(await placement()).toMatchObject({ width: 104, height: 104, appearanceKind: 'dot' })

  // Close the tethered editor, select the dot, then sweep both feel
  // bounds through the real cursor-zone resize path. At 25% zoom the
  // 13–104px bounds persist as 52–416 world units, always square.
  await win.keyboard.press('Escape')
  await win.keyboard.press('v')
  await win.mouse.click(point.x, point.y)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(1)

  const selectionBounds = () => win.evaluate(() => window.__ewDebug!.selectionBounds())
  const expectSquareChrome = async (minimum: number, maximum: number) => {
    const bounds = await selectionBounds()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeCloseTo(bounds!.height, 1)
    expect(bounds!.width).toBeGreaterThan(minimum)
    expect(bounds!.width).toBeLessThan(maximum)
  }
  await expectSquareChrome(25, 30)

  await win.mouse.move(point.x + 13, point.y)
  await win.mouse.down()
  await win.mouse.move(point.x + 300, point.y)
  await win.mouse.up()
  await expect.poll(async () => (await placement())['width']).toBe(416)
  expect(await placement()).toMatchObject({ width: 416, height: 416 })
  await expectSquareChrome(103, 108)

  // The west edge stayed anchored at point.x−13, so the 104px
  // maximum's east edge is point.x+91.
  await win.mouse.move(point.x + 91, point.y)
  await win.mouse.down()
  await win.mouse.move(point.x - 300, point.y)
  await win.mouse.up()
  await expect.poll(async () => (await placement())['width']).toBe(52)
  expect(await placement()).toMatchObject({ width: 52, height: 52 })
  await expectSquareChrome(12, 17)

  const pin = await placement()
  await win.evaluate(
    ({ x, y }) => window.__ewDebug!.setCamera({ x: x - 150, y: y - 150, zoom: 2 }),
    { x: pin['x'] as number, y: pin['y'] as number },
  )
  await expectSquareChrome(103, 108)

  await app.close()
})

test('node drag payload on the drop surface (§6.3) and node context menu (§6.6)', async () => {
  const { app, win } = await launch('ew-e2e-sources-')
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())

  // Seed a bare node, plus a labeled dot pin at the view center for
  // the context-menu half. The §6.10 place/drag UI flows live in
  // outline.spec and slice.spec since AI-IMP-070 retired the interim
  // sources panel; this test keeps the board's drop-surface branch
  // and the §6.6 menu honest.
  const seeded = await win.evaluate(async (targetCanvasId) => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const { id: projectId } = project.result as { id: string }
    const run = async (commandType: string, payload: unknown) => {
      const outcome = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId,
        commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload,
      })
      if (outcome.status !== 'committed') {
        throw new Error(`${commandType}: ${JSON.stringify(outcome)}`)
      }
    }
    const noteId = crypto.randomUUID()
    const nodeId = crypto.randomUUID()
    await run('CreateNote', { noteId, title: 'Wandering Isle' })
    await run('CreateNode', { nodeId })
    const cam = window.__ewDebug!.camera()
    const rect = document.querySelector('[data-testid="canvas-host"]')!.getBoundingClientRect()
    await run('CreatePin', {
      nodeId: crypto.randomUUID(),
      canvasId: targetCanvasId,
      placementId: crypto.randomUUID(),
      x: rect.width / 2 / cam.zoom + cam.x,
      y: rect.height / 2 / cam.zoom + cam.y,
      appearance: { kind: 'dot', color: '#8a94a0' },
      note: { kind: 'attach', noteId },
    })
    return { noteId, nodeId }
  }, canvasId)
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(1)
  let scene = await query<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  const dot = scene.items.find((item) => item['itemKind'] === 'placement')!
  expect(dot).toMatchObject({ noteTitle: 'Wandering Isle', labelVisible: 1 })

  // §6.3: the internal node mime dropped on the canvas → one
  // CreatePlacement at the drop point (synthesized drop, custom mime).
  await win.evaluate(({ nodeId }) => {
    const dt = new DataTransfer()
    dt.setData('application/x-ew-node', nodeId)
    const host = document.querySelector('[data-testid="canvas-host"]')!
    const rect = host.getBoundingClientRect()
    host.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        clientX: rect.left + 240,
        clientY: rect.top + 200,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, seeded)
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  scene = await query<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  expect(scene.items.filter((item) => item['nodeId'] === seeded.nodeId)).toHaveLength(1)

  // §6.6 context menu on the labeled dot at the view center.
  const dotNodeId = dot['nodeId'] as string
  const noteIdOfNode = () =>
    win.evaluate(async (nodeId) => {
      const node = await window.ew.project.query('getNode', { nodeId })
      if (!node.ok) throw new Error(node.message)
      return (node.result as { noteId: string | null }).noteId
    }, dotNodeId)
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  // Detach Note: only the node→note reference clears (§6.6).
  await win.mouse.click(center.x, center.y, { button: 'right' })
  await win.getByTestId('node-menu-detach').click()
  await expect.poll(() => noteIdOfNode()).toBe(null)
  const detachedNote = await query<{ lifecycleState: string }>(win, 'getNote', {
    noteId: seeded.noteId,
  })
  expect(detachedNote.lifecycleState).toBe('active')

  // Attach New Note via the inline title prompt.
  await win.mouse.click(center.x, center.y, { button: 'right' })
  await win.getByTestId('node-menu-attach-new').click()
  await win.getByTestId('node-menu-title-input').fill('Newly Attached')
  await win.getByTestId('node-menu-title-confirm').click()
  await expect.poll(() => noteIdOfNode()).not.toBe(null)

  // Make Note Independent: copy under a fresh project-unique title.
  await win.mouse.click(center.x, center.y, { button: 'right' })
  await win.getByTestId('node-menu-make-independent').click()
  await win.getByTestId('node-menu-title-input').fill('Solo Copy')
  await win.getByTestId('node-menu-title-confirm').click()
  await expect
    .poll(() =>
      win.evaluate(async (nodeId) => {
        const node = await window.ew.project.query('getNode', { nodeId })
        if (!node.ok) return 'node-error'
        const noteId = (node.result as { noteId: string | null }).noteId
        if (noteId === null) return null
        const note = await window.ew.project.query('getNote', { noteId })
        return note.ok ? (note.result as { title: string }).title : 'note-error'
      }, dotNodeId),
    )
    .toBe('Solo Copy')

  await app.close()
})

test('URL import refuses private and loopback targets (AI-IMP-057)', async () => {
  const { app, win } = await launch('ew-e2e-ssrf-')
  await dropOnCanvas(win, {
    uriList: 'http://127.0.0.1:5173/steal.png',
    offsetX: 200,
    offsetY: 200,
  })
  await expect(win.getByTestId('import-error')).toBeVisible({ timeout: 15_000 })
  await expect(win.getByTestId('import-error')).toContainText('private or local')
  expect(await placements(win)).toBe(0)
  expect(await query<unknown[]>(win, 'listAssets')).toHaveLength(0)
  await app.close()
})
