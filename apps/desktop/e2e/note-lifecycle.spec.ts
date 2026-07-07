import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * The open book (RFC §8.5 rev 0.55, AI-IMP-134). An image-anchored note
 * opens as a page BOUND to the image's side: sized to the shared edge,
 * flat, binder rings on the seam, scaling with the world. A portrait
 * binds to a side at the image's height; a wide image binds BELOW at the
 * image's width; deep zoom-out degrades the rings to a stroke then fades
 * the page whole (the shrink ladder, §8.2).
 */

/** Seed an IMAGE-appearance node with an attached note and a placement.
 * The asset is generated in-page at the requested pixel size, so the
 * placement's world size is exactly w×h (scale 1). Returns the
 * placement id and world center. */
async function seedImageNote(
  win: Page,
  opts: { w: number; h: number; x: number; y: number; title: string },
): Promise<{ placementId: string; x: number; y: number; w: number; h: number }> {
  const { assetId } = await win.evaluate(async (dim: { w: number; h: number }) => {
    const canvas = new OffscreenCanvas(dim.w, dim.h)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgb(40, 120, 200)'
    ctx.fillRect(0, 0, dim.w, dim.h)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const result = await window.ew.project.importAsset({ bytes, originalFilename: 'seed.png' })
    if (!result.ok) throw new Error('seed import failed')
    return { assetId: result.assetId }
  }, { w: opts.w, h: opts.h })

  const nodeId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'SetNodeAppearance', { nodeId, appearance: { kind: 'image', assetId, crop: null } })
  await exec(win, 'CreateNote', { noteId, title: opts.title, body: 'reference study' })
  await exec(win, 'AttachNoteToNode', { nodeId, noteId })
  await exec(win, 'CreatePlacement', { placementId, canvasId, nodeId, x: opts.x, y: opts.y })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  return { placementId, x: opts.x, y: opts.y, w: opts.w, h: opts.h }
}

/** The image's on-screen rect (host-relative) at the current camera —
 * deltas are frame-invariant, so widths/heights compare directly to a
 * bounding box. */
async function imageScreenRect(
  win: Page,
  c: { x: number; y: number; w: number; h: number },
): Promise<{ left: number; top: number; width: number; height: number }> {
  return win.evaluate((p: { x: number; y: number; w: number; h: number }) => {
    const tl = window.__ewDebug!.worldToScreen(p.x - p.w / 2, p.y - p.h / 2)
    const br = window.__ewDebug!.worldToScreen(p.x + p.w / 2, p.y + p.h / 2)
    return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y }
  }, c)
}

async function setZoom(win: Page, zoom: number): Promise<void> {
  await win.evaluate((z: number) => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: z }), zoom)
}

async function openImageNote(win: Page, c: { x: number; y: number }): Promise<void> {
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const center = await win.evaluate((p: { x: number; y: number }) => window.__ewDebug!.worldToScreen(p.x, p.y), c)
  await win.mouse.dblclick(box.x + center.x, box.y + center.y)
}

/** Poll the tethered page's rendered box until an axis matches the
 * image's rendered edge (within a sub-pixel tolerance). */
async function expectEdgeTracks(
  win: Page,
  axis: 'width' | 'height',
  c: { x: number; y: number; w: number; h: number },
): Promise<void> {
  await expect
    .poll(async () => {
      const rect = await imageScreenRect(win, c)
      const box = await win.getByTestId('note-pane').boundingBox()
      if (!box) return false
      return Math.abs(box[axis] - rect[axis]) <= 2
    })
    .toBe(true)
}

test('portrait image: page binds to a side at the image height and tracks it through zoom', async () => {
  const { app, win } = await launchApp('ew-e2e-book-portrait-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Portrait' })
  await setZoom(win, 1)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Portrait/)
  // Side-bound (not below), flat book with rings on the seam.
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(1)

  // Shared edge: page height = image height, at 100% and at 50%.
  await expectEdgeTracks(win, 'height', img)
  await setZoom(win, 0.5)
  await expectEdgeTracks(win, 'height', img)

  await app.close()
})

test('wide image: page binds BELOW at the image width like a calendar', async () => {
  const { app, win } = await launchApp('ew-e2e-book-wide-')
  const img = await seedImageNote(win, { w: 420, h: 200, x: 500, y: 380, title: 'Calendar' })
  await setZoom(win, 1)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Calendar/)
  await expect(pane).toHaveAttribute('data-bound-side', 'below')

  // Shared edge: page width = image width, tracked through zoom.
  await expectEdgeTracks(win, 'width', img)
  await setZoom(win, 0.5)
  await expectEdgeTracks(win, 'width', img)

  await app.close()
})

test('deep zoom-out degrades the rings to a stroke, then fades the page whole', async () => {
  const { app, win } = await launchApp('ew-e2e-book-degrade-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Fade' })
  await setZoom(win, 1)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Fade/)
  await expect(pane).toHaveAttribute('data-page-stage', 'full')

  // ~320 px edge → below the page floor (rings become a bound-edge
  // stroke; the mount still renders).
  await setZoom(win, 0.1)
  await expect(pane).toHaveAttribute('data-page-stage', 'degraded')
  await expect(win.getByTestId('binder-rings')).toHaveCount(1)

  // Below the furniture floor → the whole page fades and the rings go.
  await setZoom(win, 0.02)
  await expect(pane).toHaveAttribute('data-page-stage', 'hidden')
  await expect(pane).toHaveCSS('opacity', '0')
  await expect(win.getByTestId('binder-rings')).toHaveCount(0)

  await app.close()
})
