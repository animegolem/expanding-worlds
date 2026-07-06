import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, runQuery } from './helpers'

/**
 * AI-IMP-081 acceptance: §14.4 large drops run as an interruptible
 * progress strip with a live hash-dedupe count, never a modal. Drops
 * are synthesized in-page (the import.spec pattern); pacing is
 * deterministic via the ew-test-import-allow gate — the pump only
 * starts as many files as the test has allowed, so mid-run
 * assertions and cancel clicks never race real import speed.
 */

// --- Minimal valid PNG encoder: 1×1 RGB, color varies the bytes so
// each index is a distinct blob and repeats are true hash-dupes.

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
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
  const pixel = Buffer.from([0, colorIndex & 0xff, (colorIndex >> 8) & 0xff, 0x40])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixel)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

interface BatchFile {
  name: string
  base64: string
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

/** How many files the batch pump may still start (test-only gate). */
function allowImports(win: Page, count: number | 'all'): Promise<void> {
  return win.evaluate((allowed) => {
    window.dispatchEvent(new CustomEvent('ew-test-import-allow', { detail: { count: allowed } }))
  }, count)
}

function placements(win: Page): Promise<number> {
  return win.evaluate(() => window.__ewDebug!.sceneStats().placements)
}

function stripAttr(win: Page, name: string): Promise<string | null> {
  return win.evaluate(
    (attr) =>
      document.querySelector('[data-testid="import-progress-strip"]')?.getAttribute(attr) ?? null,
    name,
  )
}

function uniqueFiles(from: number, count: number): BatchFile[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `unique-${from + i}.png`,
    base64: pngBase64(from + i),
  }))
}

test('batch strip: threshold, live dedupe count, second drop queues (§14.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-import-batch-')

  // -- ≤ threshold: the quiet small-drop path is unchanged — no
  // strip, no summary toast, just the placed pins.
  await dropFiles(win, uniqueFiles(1, 3), 100, 80)
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(3)
  await expect(win.getByTestId('import-progress-strip')).toHaveCount(0)
  await expect(win.getByTestId('import-summary')).toHaveCount(0)

  // -- > threshold: 8 files, 3 of them byte-duplicates of the first
  // three uniques in the SAME drop. Gate closed: the strip must show
  // the full total with nothing started.
  await allowImports(win, 0)
  const uniques = uniqueFiles(10, 5)
  const dupes = uniques.slice(0, 3).map((f, i) => ({ ...f, name: `dupe-${i}.png` }))
  await dropFiles(win, [...uniques, ...dupes], 140, 120)
  await expect(win.getByTestId('import-progress-strip')).toBeVisible()
  await expect.poll(() => stripAttr(win, 'data-total')).toBe('8')
  expect(await stripAttr(win, 'data-done')).toBe('0')

  // Six files in: the live dedupe count shows the sixth (first dupe)
  // rode the content-hash short-circuit.
  await allowImports(win, 6)
  await expect.poll(() => stripAttr(win, 'data-done'), { timeout: 10_000 }).toBe('6')
  expect(await stripAttr(win, 'data-deduped')).toBe('1')
  await expect(win.getByTestId('import-progress-counts')).toContainText('1 deduplicated')

  // -- a drop DURING the running batch queues into the same strip:
  // one strip element, total grows, nothing restarts.
  await dropFiles(win, uniqueFiles(30, 4), 300, 200)
  await expect.poll(() => stripAttr(win, 'data-total'), { timeout: 10_000 }).toBe('12')
  await expect(win.getByTestId('import-progress-strip')).toHaveCount(1)

  // -- run to completion: strip collapses to ONE summary toast with
  // the dedupe count; every file (including dupes) placed a pin —
  // dedupe shares blobs, never merges records (§4.7).
  await allowImports(win, 'all')
  await expect(win.getByTestId('import-progress-strip')).toHaveCount(0, { timeout: 15_000 })
  await expect(win.getByTestId('import-summary')).toBeVisible()
  await expect(win.getByTestId('import-summary')).toContainText(
    'Import finished: 9 imported · 3 deduplicated',
  )
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(15)

  await app.close()
})

test('cancel mid-run keeps committed imports and reports skipped (§14.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-import-cancel-')

  // Two files may start; the pump then waits at the gate — a stable
  // mid-run point for the ✕ click.
  await allowImports(win, 2)
  await dropFiles(win, uniqueFiles(1, 8), 120, 100)
  await expect(win.getByTestId('import-progress-strip')).toBeVisible()
  await expect.poll(() => stripAttr(win, 'data-done'), { timeout: 10_000 }).toBe('2')

  await win.getByTestId('import-progress-cancel').click()
  await expect(win.getByTestId('import-progress-strip')).toHaveCount(0, { timeout: 10_000 })
  await expect(win.getByTestId('import-summary')).toBeVisible()
  await expect(win.getByTestId('import-summary')).toContainText(
    'Import cancelled: 2 imported · 6 skipped',
  )

  // Finished files stay committed records — nothing rolled back —
  // and the skipped six created nothing.
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(2)
  expect(await runQuery<unknown[]>(win, 'listAssets')).toHaveLength(2)

  // The batch machinery reset cleanly: a later small drop keeps the
  // quiet path (no strip), even after a cancelled batch.
  await dropFiles(win, uniqueFiles(50, 2), 260, 220)
  await expect.poll(() => placements(win), { timeout: 10_000 }).toBe(4)
  await expect(win.getByTestId('import-progress-strip')).toHaveCount(0)

  await app.close()
})
