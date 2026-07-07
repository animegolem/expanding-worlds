import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, runQuery } from './helpers'

/**
 * §14.4 gallery thumbnail-size slider + Space Quick Look (rev 0.55,
 * AI-IMP-168): the two unbuilt clauses of §17 item 27. The slider
 * rescales the VIRTUALIZED bucketed grid live and persists app-tier
 * (`galleryThumbSize`, no migration); bare Space opens a full-size
 * preview over the CURSOR cell — original bytes (ew-asset://<hash>,
 * not /thumb), arrows walk neighbours swapping the image, Esc closes
 * the preview WITHOUT closing the gallery takeover, selection never
 * changes. Quick Look is image-only: a note/board cursor is a no-op.
 */

async function openGallery(win: Page): Promise<void> {
  await win.getByTestId('charm-gallery').click()
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
}

function cell(win: Page, nodeId: string) {
  return win.locator(`[data-testid="gallery-cell"][data-node-id="${nodeId}"]`)
}

/** Import a solid-colour PNG and attach it to a fresh node; the colour
 * makes each asset's hash distinct so an arrow-swap is observable. */
async function seedImageNode(win: Page, color: string): Promise<{ nodeId: string; hash: string }> {
  const { hash, assetId } = await win.evaluate(async (rgb: string) => {
    const canvas = new OffscreenCanvas(400, 300)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = rgb
    ctx.fillRect(0, 0, 400, 300)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'seed.png' })
    if (!result.ok) throw new Error('seed import failed')
    return { hash, assetId: result.assetId }
  }, color)
  const nodeId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'SetNodeAppearance', { nodeId, appearance: { kind: 'image', assetId, crop: null } })
  return { nodeId, hash }
}

/** Used content width of a cell (box-sizing content-box → the cellSize
 * var verbatim, no border in the number). */
async function cellWidth(win: Page): Promise<string> {
  return win.evaluate(() => {
    const el = document.querySelector('[data-testid="gallery-cell"]')!
    return getComputedStyle(el).width
  })
}

async function setSlider(win: Page, value: number): Promise<void> {
  await win.getByTestId('gallery-thumb-size').evaluate((el, v) => {
    const input = el as HTMLInputElement
    input.value = String(v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

test('thumbnail-size slider rescales the grid live and persists across relaunch', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-thumb-'))
  const first = await launchApp('ew-e2e-gallery-thumb-', { EW_APP_CONFIG_DIR: configDir })
  for (let i = 0; i < 6; i += 1) await exec(first.win, 'CreateNode', { nodeId: crypto.randomUUID() })
  await openGallery(first.win)
  await expect.poll(() => first.win.locator('[data-testid="gallery-cell"]').count()).toBeGreaterThan(2)

  // Default cell edge (CELL = 168) until the slider moves it.
  expect(await cellWidth(first.win)).toBe('168px')

  // Live rescale: the virtualized grid re-buckets off the new var —
  // the same cells, resized, no reload.
  await setSlider(first.win, 240)
  await expect.poll(() => cellWidth(first.win)).toBe('240px')

  // Written app-tier under the persisted key.
  const stored = await first.win.evaluate(
    () => window.ew.settings.appAll() as Promise<Record<string, unknown>>,
  )
  expect(stored['galleryThumbSize']).toBe(240)
  await first.app.close()

  // Relaunch on the SAME project + app-config dir: the choice survives.
  const second = await launchAppInDir(first.projectDir, { EW_APP_CONFIG_DIR: configDir })
  await openGallery(second.win)
  await expect.poll(() => second.win.locator('[data-testid="gallery-cell"]').count()).toBeGreaterThan(2)
  await expect(second.win.getByTestId('gallery-thumb-size')).toHaveValue('240')
  await expect.poll(() => cellWidth(second.win)).toBe('240px')
  await second.app.close()
})

test('Space Quick Look: opens on the cursor cell, arrows swap the image, Esc closes without closing the gallery', async () => {
  const { app, win } = await launchApp('ew-e2e-gallery-quicklook-')
  // imageB is created last → newest → gallery index 0 (date sort);
  // imageA lands at index 1, its immediate neighbour.
  const imageA = await seedImageNode(win, 'rgb(40, 120, 220)')
  const imageB = await seedImageNode(win, 'rgb(220, 60, 40)')
  await openGallery(win)

  const order = await runQuery<Array<{ nodeId: string }>>(win, 'getGalleryIndex')
  expect(order[0]!.nodeId).toBe(imageB.nodeId)
  expect(order[1]!.nodeId).toBe(imageA.nodeId)

  // Both image cells hydrate (their <img> mounts) before we preview —
  // Quick Look reads items[cursor], present once the cell has rendered.
  await expect(cell(win, imageB.nodeId).locator('img')).toBeVisible()
  await expect(cell(win, imageA.nodeId).locator('img')).toBeVisible()

  // Park the cursor on imageB and select it, so we can prove Quick
  // Look leaves the selection untouched.
  await cell(win, imageB.nodeId).click()
  await expect(cell(win, imageB.nodeId)).toHaveAttribute('data-cursor', 'true')
  await expect(cell(win, imageB.nodeId)).toHaveAttribute('data-selected', 'true')

  // Space opens the preview over the cursor cell at ORIGINAL bytes
  // (no /thumb segment) carrying imageB's hash.
  await win.keyboard.press('Space')
  const preview = win.getByTestId('gallery-quicklook')
  await expect(preview).toBeVisible()
  const previewImg = win.getByTestId('gallery-quicklook-image')
  await expect.poll(async () => (await previewImg.getAttribute('src')) ?? '').toContain(imageB.hash)
  expect(await previewImg.getAttribute('src')).not.toContain('/thumb')

  // ArrowRight walks the cursor to imageA and swaps the image; the
  // selection does NOT follow (still imageB).
  await win.keyboard.press('ArrowRight')
  await expect.poll(async () => (await previewImg.getAttribute('src')) ?? '').toContain(imageA.hash)
  await expect(cell(win, imageA.nodeId)).toHaveAttribute('data-cursor', 'true')
  await expect(cell(win, imageB.nodeId)).toHaveAttribute('data-selected', 'true')
  await expect(cell(win, imageA.nodeId)).toHaveAttribute('data-selected', 'false')

  // ArrowLeft swaps back.
  await win.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await previewImg.getAttribute('src')) ?? '').toContain(imageB.hash)

  // Esc closes the preview and STOPS — the gallery takeover stays
  // open, and the selection is exactly what it was.
  await win.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await expect(win.locator('[data-testid="gallery-cell"][data-selected="true"]')).toHaveCount(1)
  await expect(cell(win, imageB.nodeId)).toHaveAttribute('data-selected', 'true')

  // Space toggles it back open, Space closes it again (the idiom).
  await win.keyboard.press('Space')
  await expect(preview).toBeVisible()
  await win.keyboard.press('Space')
  await expect(preview).toHaveCount(0)
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()

  await app.close()
})
