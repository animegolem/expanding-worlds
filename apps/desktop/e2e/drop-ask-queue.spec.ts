import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, runQuery } from './helpers'

/**
 * AI-IMP-178: overlapping multi-drops must QUEUE, not clobber. The old
 * single `parked` slot meant a second multi-drop arriving before the
 * first's ask was answered silently discarded batch 1's entire import.
 * Here two multi-file batches overlap (batch 2 drops while batch 1's ask
 * is still up); answering both must land EVERY file from BOTH batches —
 * no batch's import closure is ever dropped.
 */

// --- Minimal WxH RGB PNG so imports carry real dimensions (frames-drop
// pattern; specs cannot import one another's local helpers).
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
function pngBase64(colorIndex: number): string {
  const width = 60
  const height = 40
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
/** Distinct images with a per-batch color offset so no two files across
 *  batches share a content hash (a collision would dedupe and mask a
 *  discarded import). */
function distinctImages(count: number, seed: number): BatchFile[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `img-${seed}-${i}.png`,
    base64: pngBase64(seed + i),
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

function placementCount(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}

interface FrameTreeNode {
  placementId: string
}
async function frameRootCount(win: Page): Promise<number> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const tree = await runQuery<{ roots: FrameTreeNode[] }>(win, 'getFrameTree', { canvasId })
  return tree.roots.length
}

test('overlapping multi-drops queue; answering both imports every file (AI-IMP-178)', async () => {
  const { app, win } = await launchApp('ew-e2e-drop-ask-queue-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
    // Pin engagement so the §8.2 fade clock never resolves a waiting ask
    // to `separate` mid-test (the 4s idle fade would otherwise race a
    // slow cold run) — the house takeover idiom.
    await win.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
      ),
    )

    // Batch 1: three images → the multi-drop ask (no remembered choice).
    await dropFiles(win, distinctImages(3, 1), 200, 160)
    await expect(win.getByTestId('drop-ask')).toContainText('3 images dropped')
    await expect(win.getByTestId('drop-ask')).toContainText(
      'esc or walking away lands them separate',
    )

    // Batch 2: four images dropped WHILE batch 1's ask is still up. The
    // old single-slot code would overwrite batch 1's parked closure here
    // and lose those three imports. The queue parks batch 2 behind it —
    // batch 1's ask stays the one showing.
    await dropFiles(win, distinctImages(4, 100), 600, 500)
    await expect(win.getByTestId('drop-ask')).toContainText('3 images dropped')

    // Answer batch 1 (group-and-sort → one frame of its three images);
    // wait for that composite to land before answering the next.
    await win.getByTestId('drop-ask-group-sort').click()
    await expect.poll(() => frameRootCount(win), { timeout: 15_000 }).toBe(1)

    // Batch 2's ask now presents in turn — it is the PRESERVED second
    // request (count 4), proof the queue kept it rather than clobbering.
    await expect(win.getByTestId('drop-ask')).toContainText('4 images dropped')
    await win.getByTestId('drop-ask-group-sort').click()
    await expect(win.getByTestId('drop-ask')).toHaveCount(0)

    // EVERY file from BOTH batches imported: 3 + 4 = 7 distinct assets,
    // none discarded. This is the load-bearing check — the old bug lost
    // batch 1 entirely (it would show 4).
    await expect
      .poll(() => runQuery<Array<{ id: string }>>(win, 'listAssets').then((a) => a.length), {
        timeout: 15_000,
      })
      .toBe(7)

    // Both group-and-sort composites landed (one frame per batch); each
    // composition applies asynchronously, so gate on the frame tree
    // before counting placements: 2 frames + 7 images = 9 placements.
    await expect.poll(() => frameRootCount(win), { timeout: 15_000 }).toBe(2)
    await expect.poll(() => placementCount(win), { timeout: 15_000 }).toBe(9)
  } finally {
    await app.close()
  }
})
