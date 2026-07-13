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

  // Shared edge: page height = image height at two window sizes and
  // through camera zoom. Window chrome may reflow; the book seam may not.
  await expectEdgeTracks(win, 'height', img)
  await win.setViewportSize({ width: 1040, height: 720 })
  await expectEdgeTracks(win, 'height', img)
  await win.setViewportSize({ width: 1280, height: 800 })
  await setZoom(win, 0.5)
  await expectEdgeTracks(win, 'height', img)

  await app.close()
})

test('reading flight fits the whole open book and Escape restores the exact prior camera', async () => {
  const { app, win } = await launchApp('ew-e2e-book-reading-flight-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Reading' })
  const startingCamera = { x: 91, y: 47, zoom: 0.83 }
  await win.evaluate((camera) => window.__ewDebug!.setCamera(camera), startingCamera)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(pane.getByTestId('panel-whisper-strip')).toBeVisible()
  const before = await win.evaluate(() => window.__ewDebug!.camera())
  expect(before).toEqual(startingCamera)

  const read = pane.getByTestId('panel-reading-flight')
  await read.click()
  await expect(read).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.stage().flightActive), { timeout: 5_000 })
    .toBe(false)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).not.toEqual(before)

  await win.keyboard.press('Escape')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.stage().flightActive), { timeout: 5_000 })
    .toBe(false)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual(before)
  await expect(read).toHaveAttribute('aria-pressed', 'false')

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

// ---- AI-IMP-135: the reversible lifecycle — tear / place / pull pin /
// untape, the rotation gate, and the centered tear. ----

/** Re-issue the placement's full transform with a new rotation
 * (radians), keeping its seeded center/size. */
async function rotateImage(
  win: Page,
  c: { placementId: string; x: number; y: number; w: number; h: number },
  rotation: number,
): Promise<void> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'TransformContent', {
    canvasId,
    items: [
      {
        kind: 'placement',
        placementId: c.placementId,
        x: c.x,
        y: c.y,
        width: c.w,
        height: c.h,
        scale: 1,
        rotation,
      },
    ],
  })
}

const undoDepth = (win: Page) => win.evaluate(() => window.__ewUndo!.undoDepth())
const placementCount = (win: Page) => win.evaluate(() => window.__ewDebug!.sceneStats().placements)

test('rotation gate: a rotated image keeps the tethered card, and the gate is live mid-life', async () => {
  const { app, win } = await launchApp('ew-e2e-book-rotated-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Tilted' })
  await setZoom(win, 1)

  // Rotated BEFORE opening: the note opens as the tethered card — the
  // binding would mount to the axis-aligned AABB and read as rings
  // floating beside the art, so no book until a rotated-book design
  // exists (AI-IMP-135 scope addition).
  await rotateImage(win, img, 0.4)
  await openImageNote(win, img)
  const pane = win.getByTestId('note-pane')
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Tilted/)
  await expect(pane).not.toHaveAttribute('data-bound-side', /.+/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(0)

  // Rotating back to square mid-life re-binds the page…
  await rotateImage(win, img, 0)
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(1)

  // …and rotating the open book drops it back to the tethered card.
  await rotateImage(win, img, 0.4)
  await expect(pane).not.toHaveAttribute('data-bound-side', /.+/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(0)

  await app.close()
})

test('lifecycle walk: tear → sticky, place → landmark, pull pin → sticky, untape → book; persisted steps are one undo each', async () => {
  const { app, win } = await launchApp('ew-e2e-lifecycle-walk-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Walk' })
  await setZoom(win, 1)
  await win.waitForFunction(() => window.__ewUndo !== undefined)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  const depth0 = await undoDepth(win)

  // TEAR: the page rips out of its book and tapes itself to the glass —
  // pinned, wearing tape + the torn edge; the book hardware goes.
  await win.getByTestId('panel-tear').click()
  const sticky = win.locator('.note-panel.pinned')
  await expect(sticky).toHaveCount(1)
  await expect(sticky).toHaveAttribute('data-paper', 'torn')
  await expect(win.getByTestId('sticky-tape')).toHaveCount(1) // a zero-size anchor point: presence, not visibility
  await expect(win.getByTestId('sticky-torn-edge')).toBeVisible()
  await expect(win.getByTestId('binder-rings')).toHaveCount(0)
  // A presentation flip: no structural undo entry.
  expect(await undoDepth(win)).toBe(depth0)

  // PLACE: the sticky becomes the LANDMARK — one undoable command; the
  // placement keeps the torn edge and wears the push pin.
  await win.getByTestId('panel-place-on-board').click()
  await expect(win.locator('.note-panel')).toHaveCount(0)
  await expect.poll(() => placementCount(win)).toBe(2)
  await expect(win.locator('[data-testid^="landmark-pin-"]')).toHaveCount(1)
  await expect(win.getByTestId('landmark-torn-edge')).toBeVisible()
  await expect.poll(() => undoDepth(win)).toBe(depth0 + 1)

  // PULL PIN: the landmark lifts off the board (one more undo entry)
  // and the sticky reappears, still taped and torn.
  await win.locator('[data-testid^="landmark-pin-"]').click()
  await expect.poll(() => placementCount(win)).toBe(1)
  await expect(win.locator('[data-testid^="landmark-pin-"]')).toHaveCount(0)
  await expect(win.locator('.note-panel.pinned')).toHaveCount(1)
  await expect(win.locator('.note-panel.pinned')).toHaveAttribute('data-paper', 'torn')
  await expect.poll(() => undoDepth(win)).toBe(depth0 + 2)

  // UNTAPE: the page returns to its book — bound again, hardware back,
  // tape gone. The full walk is home.
  await win.getByTestId('panel-untape').click()
  await expect(win.getByTestId('note-pane')).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(1)
  await expect(win.getByTestId('sticky-tape')).toHaveCount(0)

  // Mod+Z walks the persisted steps back one at a time: the landmark
  // placement returns (undoing its delete), then goes (undoing place).
  await win.evaluate(() => window.__ewUndo!.undo())
  await expect.poll(() => placementCount(win)).toBe(2)
  await win.evaluate(() => window.__ewUndo!.undo())
  await expect.poll(() => placementCount(win)).toBe(1)

  await app.close()
})

test('centered tear: double-click tears the page to a modal editor over the dimmed board; esc tucks it home', async () => {
  const { app, win } = await launchApp('ew-e2e-centered-tear-')
  const img = await seedImageNote(win, { w: 200, h: 320, x: 500, y: 400, title: 'Center' })
  await setZoom(win, 1)
  await openImageNote(win, img)

  const pane = win.getByTestId('note-pane')
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(pane.getByTestId('note-pane-title')).toHaveText(/Center/)

  // Double-click the page margin (the header strip left of the title
  // input — page chrome, not a control and not the editor).
  const box = (await pane.boundingBox())!
  await win.mouse.dblclick(box.x + 4, box.y + 10)

  // The torn-out page at the modal rung: torn chrome over the scrim.
  const editor = win.getByTestId('big-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('data-torn', 'true')
  await expect(win.getByTestId('big-editor-torn-edge')).toBeVisible()
  await expect(win.getByTestId('big-editor-backdrop')).toBeVisible()
  // The page scrolls INSIDE itself (containment, §8.5).
  await expect(
    await editor.locator('.big-editor-body').evaluate((el) => getComputedStyle(el).overflowY),
  ).toMatch(/auto|scroll/)

  // Its spot in the book is empty while it is out: shell + rings hide.
  await expect(pane).toHaveAttribute('data-torn-out', 'true')
  await expect(win.getByTestId('binder-rings')).toHaveCount(0)

  // Esc tucks it home (the ~200ms reverse beat rides the unmount).
  await win.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(pane).toHaveAttribute('data-bound-side', /^(left|right)$/)
  await expect(pane).not.toHaveAttribute('data-torn-out', /.+/)
  await expect(win.getByTestId('binder-rings')).toHaveCount(1)

  await app.close()
})
