import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * §4.9 rev 0.38 drop behavior + frame sort (AI-IMP-129). The epic's
 * payoff: a multi-image drop asks once how to land, group-and-sort
 * tiles them inside a fresh frame, and ONE undo returns the board to
 * pre-drop. A remembered choice skips the modal. A composite NEVER
 * enters the library — every image stays its own node/asset. And a
 * frame with sort-on-drop ON arranges a multi-item drop inside it,
 * while the toggle OFF leaves the drop where it lands.
 */

// --- Minimal WxH RGB PNG so imports carry real dimensions to tile.
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
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
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
  appearanceKind: string | null
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
    .map((i) => ({
      id: i['id'] as string,
      x: i['x'] as number,
      y: i['y'] as number,
      appearanceKind: (i['appearanceKind'] as string | null) ?? null,
    }))
}
function placementCount(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}

/** True when some pair of members shares a row (same y, different x) —
 *  the packer's shelves, which a diagonal cascade never produces. */
function hasSharedRow(members: PlacementLite[]): boolean {
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      if (Math.abs(members[i]!.y - members[j]!.y) < 1 && Math.abs(members[i]!.x - members[j]!.x) > 1) {
        return true
      }
    }
  }
  return false
}

test('multi-drop → ask → group-and-sort tiles in a frame; one undo to pre-drop (§4.9)', async () => {
  const { app, win } = await launchApp('ew-e2e-drop-behavior-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // Five distinct images dropped at once → the ask modal (no remembered
    // choice) offers keep-separate / sort / group / group-and-sort.
    await dropFiles(win, distinctImages(5), 200, 160)
    await expect(win.getByTestId('drop-ask')).toBeVisible()
    await expect(win.getByTestId('drop-ask-group-sort')).toBeVisible()

    // Group-and-sort: one frame lands containing all five, tiled.
    await win.getByTestId('drop-ask-group-sort').click()
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    await expect.poll(() => transitiveMembers(win, frameId).then((m) => m.length)).toBe(5)

    // Six placements: five images + the frame; the five images tiled
    // (a shelf row exists, not a diagonal cascade).
    await expect.poll(() => placementCount(win)).toBe(6)
    const imageMembers = (await placements(win)).filter((p) => p.appearanceKind === 'image')
    expect(imageMembers).toHaveLength(5)
    expect(hasSharedRow(imageMembers)).toBe(true)

    // Composite NEVER enters the library: five distinct image assets
    // (per-image, dedupe intact) and the frame node carries no asset.
    const assets = await runQuery<Array<{ id: string }>>(win, 'listAssets')
    expect(assets).toHaveLength(5)
    const frameKinds = (await placements(win)).filter((p) => p.appearanceKind === 'frame')
    expect(frameKinds).toHaveLength(1)

    // ONE undo removes frame, membership, and every import together.
    await win.evaluate(() => window.__ewUndo!.undo())
    await expect.poll(() => placementCount(win)).toBe(0)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(0)
  } finally {
    await app.close()
  }
})

test('remembered choice skips the modal on the next drop (§4.9)', async () => {
  const { app, win } = await launchApp('ew-e2e-drop-remember-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // First drop: tick remember, choose group-and-sort.
    await dropFiles(win, distinctImages(4), 200, 160)
    await expect(win.getByTestId('drop-ask')).toBeVisible()
    await win.getByTestId('drop-ask-remember').check()
    await win.getByTestId('drop-ask-group-sort').click()
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)

    // Second drop: the remembered choice applies silently — no modal,
    // a second frame lands.
    await dropFiles(win, distinctImages(3), 600, 500)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(2)
    await expect(win.getByTestId('drop-ask')).toHaveCount(0)

    // Settings shows the stored behavior.
    const settings = await runQuery<Record<string, unknown>>(win, 'getSettings')
    expect(settings['drop_behavior']).toBe('group-and-sort')
  } finally {
    await app.close()
  }
})

test('sort-on-drop: a multi-item drop into a frame arranges; the toggle OFF stops it (§4.9)', async () => {
  const { app, win } = await launchApp('ew-e2e-sort-on-drop-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // A frame spanning world 100..400.
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    await win.getByTestId('tool-select').click()

    // Three items clustered in a row outside the frame.
    const a = await seedItem(win, { x: 620, y: 150 })
    const b = await seedItem(win, { x: 700, y: 150 })
    const c = await seedItem(win, { x: 780, y: 150 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 4)

    // Marquee-select the three, then drag them together into the frame.
    await marquee(win, { x: 580, y: 100 }, { x: 820, y: 210 })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(3)
    await dragWorld(win, { x: 620, y: 150 }, { x: 200, y: 220 })
    await expect.poll(() => transitiveMembers(win, frameId).then((m) => m.length)).toBe(3)

    // Sort-on-drop (default ON) tiled them: a shelf row exists.
    const membersOn = (await placements(win)).filter((p) => [a, b, c].includes(p.id))
    expect(hasSharedRow(membersOn)).toBe(true)

    // Turn sort-on-drop OFF on this frame, then drop three more in.
    await win.getByTestId('canvas-host').click({ position: { x: 5, y: 5 } })
    await selectItem(win, frameId)
    await expect(win.getByTestId('frame-sort-on-drop')).toBeVisible()
    await win.getByTestId('frame-sort-on-drop').click() // On → Off
    await win.getByTestId('canvas-host').click({ position: { x: 5, y: 5 } })
    await win.keyboard.press('Escape')

    const d = await seedItem(win, { x: 620, y: 620 })
    const e = await seedItem(win, { x: 700, y: 620 })
    const f = await seedItem(win, { x: 780, y: 620 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 7)
    await marquee(win, { x: 580, y: 570 }, { x: 820, y: 680 })
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(3)
    const before = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))
    await dragWorld(win, { x: 620, y: 620 }, { x: 200, y: 320 })
    await expect.poll(() => transitiveMembers(win, frameId).then((m) => m.length)).toBe(6)

    // OFF → the three carried by exactly the drag delta (-420,-300); no
    // arrange rewrote their positions.
    await expect
      .poll(async () => {
        const now = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))
        return [d, e, f].map((id) => [
          Math.round(now.get(id)!.x - before.get(id)!.x),
          Math.round(now.get(id)!.y - before.get(id)!.y),
        ])
      })
      .toEqual([
        [-420, -300],
        [-420, -300],
        [-420, -300],
      ])

    // Auto-sort-in-frame on demand: select the frame, hit Sort in frame,
    // and all six members compact-pack (a shelf row spans the frame).
    await win.getByTestId('canvas-host').click({ position: { x: 5, y: 5 } })
    await selectItem(win, frameId)
    await win.getByTestId('frame-sort').click()
    await expect
      .poll(async () => {
        const members = (await placements(win)).filter((p) => [a, b, c, d, e, f].includes(p.id))
        return members.length === 6 && hasSharedRow(members)
      })
      .toBe(true)
  } finally {
    await app.close()
  }
})

// ---- shared board-drive helpers (frames.spec pattern; specs cannot
// import from one another, so the geometry helpers are re-declared) ----

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
  await exec(win, 'CreatePlacement', { placementId, canvasId, nodeId, x: at.x, y: at.y, width: 40, height: 40 })
  return placementId
}
async function selectItem(win: Page, placementId: string): Promise<void> {
  const p = await placements(win)
  const target = p.find((it) => it.id === placementId)!
  const at = await screenOf(win, target.x, target.y)
  await win.mouse.click(at.x, at.y)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toContain(placementId)
}
