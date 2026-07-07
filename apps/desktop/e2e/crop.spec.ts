import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * AI-IMP-159 acceptance (RFC §4.6): the crop editor overlay. Crop from
 * the charm bar opens an overlay showing the FULL image; committing a
 * rect crops the DISPLAY — the appearance's normalized source-space
 * rect — never the canonical file. The board then renders only that
 * region at the placement frame (asserted through the placementCrop
 * debug seam, which reads the UV matrix back from the body's actual
 * fill instruction), the managed asset stays byte-identical, one Mod+Z
 * restores the full display, re-entering shows the whole image with
 * the current rect ready to adjust, and Esc discards. Board input is
 * scoped out underneath (takeover-family input blocker).
 */

/** Pin the shared engagement clock ON (hidden-window e2e has no OS
 * cursor; the idle fade would make the charm layer pointer-transparent
 * and deadlock actionability — the charms.spec idiom). */
async function pinEngagement(win: Page): Promise<void> {
  await win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
    )
  })
}

/** Import a generated 128×128 PNG and place it as an image pin.
 * Returns the placement id and the source digest for byte identity. */
async function seedImagePin(
  win: Page,
  at: { x: number; y: number },
): Promise<{ placementId: string; nodeId: string; digest: string; byteLength: number }> {
  const seeded = await win.evaluate(async (pos) => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    for (let i = 0; i < 16; i += 1) {
      ctx.fillStyle = `hsl(${(i * 53) % 360} 65% 50%)`
      ctx.fillRect((i % 4) * 32, Math.floor(i / 4) * 32, 32, 32)
    }
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    const imported = await window.ew.project.importAsset({ bytes, originalFilename: 'crop.png' })
    if (!('assetId' in imported) || !imported.assetId) throw new Error('import failed')
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const placementId = crypto.randomUUID()
    const nodeId = crypto.randomUUID()
    const result = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: (project.result as { id: string }).id,
      commandType: 'CreatePin',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: {
        nodeId,
        canvasId: window.__ewDebug!.canvasId(),
        placementId,
        x: pos.x,
        y: pos.y,
        appearance: { kind: 'image', assetId: imported.assetId, crop: null },
      },
    })
    if (result.status !== 'committed') throw new Error(`seed: ${result.status}`)
    return { placementId, nodeId, digest, byteLength: bytes.byteLength }
  }, at)
  return seeded
}

/** Select a placement by clicking its on-screen center (screen position
 * resolved live — zoom-fit moves world points). */
async function selectPlacement(win: Page, world: { x: number; y: number }): Promise<void> {
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const screen = await win.evaluate(
    (p) => window.__ewDebug!.worldToScreen(p.x, p.y),
    world,
  )
  await win.mouse.click(box.x + screen.x, box.y + screen.y)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
}

const cropOf = (win: Page, id: string) =>
  win.evaluate((placementId) => window.__ewDebug!.placementCrop(placementId), id)

test('crop via the charm bar: display crops, bytes stay, Mod+Z restores, re-entry + Esc honor the grammar', async () => {
  const { app, win } = await launchApp('ew-e2e-crop-')
  await pinEngagement(win)
  await win.waitForFunction(() => window.__ewUndo !== undefined)

  const seeded = await seedImagePin(win, { x: 400, y: 300 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  // Zoom-fit brings the image into view so its texture goes resident.
  await win.getByTestId('zoom-fit').click()
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.placementBody(id), seeded.placementId))
    .toBe('image')

  // Select → the charm bar shows with Crop ENABLED for an image.
  await selectPlacement(win, { x: 400, y: 300 })
  await expect(win.getByTestId('charm-bar')).toBeVisible()
  await expect(win.getByTestId('charm-crop')).toHaveAttribute('data-disabled', 'false')

  // Crop opens the overlay: full image, full-frame rect ready.
  await win.getByTestId('charm-crop').click()
  await expect(win.getByTestId('crop-editor')).toBeVisible()
  expect(await win.evaluate(() => window.__ewCrop!.current())).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  })
  // The editor shows the FULL image (the canonical asset URL, no crop).
  await expect(win.getByTestId('crop-image')).toHaveAttribute(
    'src',
    `ew-asset://${seeded.digest}`,
  )

  // Board input is scoped out underneath: Delete must not act.
  await win.keyboard.press('Delete')
  expect(await win.evaluate(() => window.__ewDebug!.sceneStats().placements)).toBe(1)

  // Commit the center quarter. setRect drives the same state the
  // handles mutate (fit-zoom pixel-dragging is nondeterministic in a
  // hidden window); Apply is the real commit path.
  await win.evaluate(() =>
    window.__ewCrop!.setRect({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }),
  )
  await win.getByTestId('crop-apply').click()
  await expect(win.getByTestId('crop-editor')).toBeHidden()

  // The board renders the cropped REGION: the body's fill instruction
  // carries the UV matrix (inverse maps unit square → crop rect).
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.placementBody(id), seeded.placementId))
    .toBe('image')
  const rendered = await cropOf(win, seeded.placementId)
  expect(rendered).not.toBeNull()
  expect(rendered!.matrix).not.toBeNull()
  expect(rendered!.matrix!.a).toBeCloseTo(2)
  expect(rendered!.matrix!.d).toBeCloseTo(2)
  expect(rendered!.matrix!.tx).toBeCloseTo(-0.5)
  expect(rendered!.matrix!.ty).toBeCloseTo(-0.5)
  expect(JSON.parse(rendered!.appearanceCrop!)).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  })

  // Non-destructive: the managed blob is byte-identical (§4.6/§8.5).
  const roundTrip = await win.evaluate(async (expected) => {
    const response = await fetch(`ew-asset://${expected.digest}`)
    if (!response.ok) return { ok: false as const, status: response.status }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    return { ok: true as const, byteLength: bytes.byteLength, matches: digest === expected.digest }
  }, seeded)
  expect(roundTrip).toMatchObject({ ok: true, byteLength: seeded.byteLength, matches: true })

  // ONE Mod+Z restores the full display (the commit is one undoable
  // SetNodeAppearance, captured through the group window).
  await win.keyboard.press('Meta+z')
  await expect
    .poll(async () => {
      const crop = await cropOf(win, seeded.placementId)
      // Uncropped again = stored crop null AND the live fill carries no
      // UV matrix (the rebuilt body may briefly be a placeholder).
      return crop !== null && crop.appearanceCrop === null && crop.matrix === null
        ? 'full-display'
        : JSON.stringify(crop)
    })
    .toBe('full-display')
  // Redo reapplies it (same single entry).
  await win.keyboard.press('Meta+Shift+z')
  await expect
    .poll(async () => (await cropOf(win, seeded.placementId))?.matrix?.a ?? 0)
    .toBeCloseTo(2)

  // Re-entry: the editor shows the WHOLE image with the current rect
  // ready to adjust (never the cropped pixels).
  await selectPlacement(win, { x: 400, y: 300 })
  await win.getByTestId('charm-crop').click()
  await expect(win.getByTestId('crop-editor')).toBeVisible()
  expect(await win.evaluate(() => window.__ewCrop!.current())).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  })
  await expect(win.getByTestId('crop-image')).toHaveAttribute(
    'src',
    `ew-asset://${seeded.digest}`,
  )

  // Reset restores the full frame in the editor…
  await win.getByTestId('crop-reset').click()
  expect(await win.evaluate(() => window.__ewCrop!.current())).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  })
  // …but Esc CANCELS: the committed crop is untouched.
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('crop-editor')).toBeHidden()
  const afterEsc = await cropOf(win, seeded.placementId)
  expect(JSON.parse(afterEsc!.appearanceCrop!)).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  })

  await app.close()
})

test('crop entry points gate on image: context-menu row live for images, disabled otherwise', async () => {
  const { app, win } = await launchApp('ew-e2e-crop-gate-')
  await pinEngagement(win)
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // An image pin and a plain dot pin.
  const image = await seedImagePin(win, { x: 400, y: 300 })
  const dotPlacementId = crypto.randomUUID()
  await exec(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    placementId: dotPlacementId,
    x: 800,
    y: 300,
    appearance: { kind: 'dot', color: '#77aaff' },
  })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
  await win.getByTestId('zoom-fit').click()
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.placementBody(id), image.placementId))
    .toBe('image')

  // Right-click the image: Crop is an ENABLED row; clicking opens the
  // editor (the §8.4 menu route — ContextMenu selects the hit first).
  const imageScreen = await win.evaluate((p) => window.__ewDebug!.worldToScreen(p.x, p.y), {
    x: 400,
    y: 300,
  })
  await win.mouse.click(box.x + imageScreen.x, box.y + imageScreen.y, { button: 'right' })
  await expect(win.getByTestId('context-menu')).toBeVisible()
  const cropRow = win.getByTestId('ctx-crop')
  await expect(cropRow).toBeVisible()
  expect(await cropRow.getAttribute('aria-disabled')).toBeNull()
  await cropRow.click()
  await expect(win.getByTestId('crop-editor')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('crop-editor')).toBeHidden()

  // Right-click the dot: the Crop row is disabled-with-reason (§8.2),
  // and the charm-bar button is inert too.
  const dotScreen = await win.evaluate((p) => window.__ewDebug!.worldToScreen(p.x, p.y), {
    x: 800,
    y: 300,
  })
  await win.mouse.click(box.x + dotScreen.x, box.y + dotScreen.y, { button: 'right' })
  await expect(win.getByTestId('context-menu')).toBeVisible()
  await expect(win.getByTestId('ctx-crop')).toHaveAttribute('aria-disabled', 'true')
  await win.keyboard.press('Escape')
  await win.mouse.click(box.x + dotScreen.x, box.y + dotScreen.y)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expect(win.getByTestId('charm-bar')).toBeVisible()
  await expect(win.getByTestId('charm-crop')).toHaveAttribute('data-disabled', 'true')
  await win.getByTestId('charm-crop').click()
  await expect(win.getByTestId('crop-editor')).toBeHidden()

  await app.close()
})
