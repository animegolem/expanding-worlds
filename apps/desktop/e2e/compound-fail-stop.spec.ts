import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * AI-IMP-232 (CA-007): compound user acts are FAIL-STOP. When the first
 * command of a multi-command flow is refused, nothing downstream runs
 * and nothing waits forever.
 *
 * The failure is injected deterministically through the host gateway's
 * one-shot test seam (__ewDebug.failNextCommand) — a revision conflict,
 * the cheap injector — because contextBridge freezes window.ew so the
 * executor cannot be monkeypatched from the page.
 *
 * move-and-frame: a refused move must leave membership and geometry
 * untouched (the authoritative snap-back is the user-visible refusal),
 * then the same gesture must succeed once un-armed (the gateway is not
 * wedged). import group-and-sort: a refused sort transform must finish
 * cleanly — no frame, no hang — with the deferred-import undo group
 * closed so one undo removes the imports.
 */

test('move-and-frame is fail-stop: a refused move captures/arranges nothing (§4.9, CA-007)', async () => {
  const { app, win } = await launchApp('ew-e2e-move-fail-stop-')
  try {
    await win.waitForFunction(() => window.__ewDebug !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // A frame spanning world 100..400.
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    await win.getByTestId('tool-select').click()

    // Three items clustered in a row well outside the frame.
    const a = await seedItem(win, { x: 620, y: 150 })
    const b = await seedItem(win, { x: 700, y: 150 })
    const c = await seedItem(win, { x: 780, y: 150 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 4)
    const before = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))

    // Arm a one-shot conflict for the NEXT TransformContent — the move
    // commit that opens the compound. Then marquee the three and drag
    // them into the frame.
    await win.evaluate(() => window.__ewDebug!.failNextCommand('TransformContent'))
    await marquee(win, { x: 580, y: 100 }, { x: 820, y: 210 })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(3)
    await dragWorld(win, { x: 620, y: 150 }, { x: 200, y: 220 })

    // Fail-stop: the refused move captured nobody and moved nothing. The
    // authoritative geometry is byte-identical to pre-drag (the snap-back
    // the user sees is the refusal).
    await expect.poll(() => transitiveMembers(win, frameId).then((m) => m.length)).toBe(0)
    const after = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))
    for (const id of [a, b, c]) {
      expect(after.get(id)).toEqual(before.get(id))
    }
    // No stray arrange/capture entered the scene.
    await expect.poll(() => placementCount(win)).toBe(4)

    // The gateway is not wedged: the identical gesture, un-armed, now
    // captures all three (the injected conflict was one-shot and did not
    // poison the observed revision).
    await marquee(win, { x: 580, y: 100 }, { x: 820, y: 210 })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(3)
    await dragWorld(win, { x: 620, y: 150 }, { x: 200, y: 220 })
    await expect.poll(() => transitiveMembers(win, frameId).then((m) => m.length)).toBe(3)
  } finally {
    await app.close()
  }
})

test('import group-and-sort with a failing transform finishes cleanly — no hang, group closed (CA-007)', async () => {
  const { app, win } = await launchApp('ew-e2e-import-fail-stop-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // Four distinct images dropped at once → the ask modal.
    await dropFiles(win, distinctImages(4), 200, 160)
    await expect(win.getByTestId('drop-ask')).toBeVisible()

    // Arm a one-shot conflict for the sort's TransformContent (the first
    // TransformContent the flow issues — the CreatePins precede it), then
    // choose group-and-sort. Before the fix the ignored failure fell into
    // a bare whenSceneApplied() that hung the import (and its undo group)
    // forever; now it surfaces and stops.
    await win.evaluate(() => window.__ewDebug!.failNextCommand('TransformContent'))
    await win.getByTestId('drop-ask-group-sort').click()

    // The four imports still land (the sort's refusal does not roll them
    // back), and NO frame is created (the flow stopped before framing).
    await expect.poll(() => placementCount(win)).toBe(4)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(0)

    // The deferred-import undo group closed (no hang): one undo removes
    // every import together.
    await expect.poll(() => win.evaluate(() => window.__ewUndo!.undoDepth())).toBe(1)
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => placementCount(win)).toBe(0)
  } finally {
    await app.close()
  }
})

// ---- minimal PNG synth (frames-drop.spec pattern; specs cannot import
// from one another, so the geometry/PNG helpers are re-declared) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + head.length)
  out.writeUInt32BE(data.length, 0)
  head.copy(out, 4)
  out.writeUInt32BE(crc32(head), 4 + head.length)
  return out
}
function pngBase64(width: number, height: number, colorIndex: number): string {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const r = (colorIndex * 37) & 0xff
  const g = (colorIndex * 71) & 0xff
  const b = (colorIndex * 113) & 0xff
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}
interface BatchFile {
  name: string
  base64: string
}
function distinctImages(count: number): BatchFile[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `img-${i}.png`,
    base64: pngBase64(60, 40, i + 1),
  }))
}
function dropFiles(win: Page, files: BatchFile[], offsetX: number, offsetY: number): Promise<void> {
  return win.evaluate(
    (spec: { files: BatchFile[]; offsetX: number; offsetY: number }) => {
      const dt = new DataTransfer()
      for (const file of spec.files) {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
        dt.items.add(new File([bytes], file.name, { type: 'image/png' }))
      }
      const host = document.querySelector('[data-testid="canvas-host"]')!
      const rect = host.getBoundingClientRect()
      host.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          clientX: rect.left + spec.offsetX,
          clientY: rect.top + spec.offsetY,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { files, offsetX, offsetY },
  )
}

// ---- shared board-drive helpers (frames-drop.spec pattern) ----

interface FrameTreeNode {
  placementId: string
  isFrame: boolean
  members: FrameTreeNode[]
}
async function frameRoots(win: Page): Promise<FrameTreeNode[]> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const tree = await runQuery<{ roots: FrameTreeNode[] }>(win, 'getFrameTree', { canvasId })
  return tree.roots
}
function transitiveMembers(win: Page, framePlacementId: string): Promise<string[]> {
  return win.evaluate((id) => window.__ewDebug!.frameMembers(id), framePlacementId)
}
interface PlacementLite {
  id: string
  x: number
  y: number
}
async function placements(win: Page): Promise<PlacementLite[]> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await runQuery<{ items: Array<Record<string, unknown> & { itemKind: string }> }>(
    win,
    'getCanvasScene',
    { canvasId },
  )
  return scene.items
    .filter((i) => i.itemKind === 'placement')
    .map((i) => ({ id: i['id'] as string, x: i['x'] as number, y: i['y'] as number }))
}
function placementCount(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}
async function screenOf(win: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  return win.evaluate(
    ({ x, y }) => {
      const s = window.__ewDebug!.worldToScreen(x, y)
      const rect = document
        .querySelector('[data-testid="canvas-host"] canvas')!
        .getBoundingClientRect()
      return { x: rect.left + s.x, y: rect.top + s.y }
    },
    { x: wx, y: wy },
  )
}
async function dragWorld(
  win: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  const p = await screenOf(win, from.x, from.y)
  const q = await screenOf(win, to.x, to.y)
  await win.mouse.move(p.x, p.y)
  await win.mouse.down()
  await win.mouse.move(q.x, q.y, { steps })
  await win.mouse.up()
}
async function marquee(
  win: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await dragWorld(win, from, to, 8)
}
async function seedItem(win: Page, at: { x: number; y: number }): Promise<string> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: at.x,
    y: at.y,
    width: 40,
    height: 40,
  })
  return placementId
}
