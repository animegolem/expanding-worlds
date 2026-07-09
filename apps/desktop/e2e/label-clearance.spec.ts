import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { EW_FURNITURE_MIN_PX } from '@ew/canvas-engine'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-087 acceptance: the §4.5 placement label (world-scale text
 * under the body) and the §6.9 selection outline (screen-scale pad +
 * stroke around the body rect) must avoid each other at EVERY zoom.
 * The owner's screenshot showed the outline running through the
 * label at zoom-out — the world gap compressed below the outline's
 * screen-constant reach. The fix hangs the label a screen-constant
 * clearance (pad + stroke + gap) below the body, so at each sampled
 * zoom the label's top edge must sit clear of the outline band's
 * outer edge. Geometry is sampled through __ewDebug (labelBounds is
 * the Text object's real on-screen bounds; outlineChrome reports the
 * constants the outline is actually drawn with), the same idiom the
 * suite uses for zone math in gestures.spec.ts: known world geometry
 * plus the camera transform, no pixel scraping.
 */

async function launch(prefix: string) {
  const projectDir = mkdtempSync(join(tmpdir(), prefix))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  return { app, win }
}

async function runCommand(win: Page, commandType: string, payload: unknown): Promise<void> {
  await win.evaluate(
    async ({ commandType, payload }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const { id: projectId } = project.result as { id: string }
      const result = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
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

test('selected labeled item: the label clears the outline band at zooms 0.5 / 1 / 2', async () => {
  const { app, win } = await launch('ew-e2e-label-clearance-')

  // Seed a 200×200 placement at (300, 300) and attach a note so the
  // §4.5 label ("The Gang", the screenshot title) appears under it.
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  await runCommand(win, 'CreateNode', { nodeId })
  await runCommand(win, 'CreatePlacement', {
    placementId,
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: 300,
    y: 300,
    width: 200,
    height: 200,
  })
  await runCommand(win, 'CreateNote', { noteId, title: 'The Gang' })
  await runCommand(win, 'AttachNoteToNode', { nodeId, noteId })
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.labelBounds(id), placementId))
    .not.toBeNull()

  // Select it (camera starts at identity: world = screen).
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  await win.mouse.click(box.x + 300, box.y + 300)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)

  const chrome = await win.evaluate(() => window.__ewDebug!.outlineChrome())

  for (const zoom of [0.5, 1, 2]) {
    // Keep the item on screen: its center lands at (320, 240).
    await win.evaluate(
      (cam) => window.__ewDebug!.setCamera(cam),
      { x: 300 - 320 / zoom, y: 300 - 240 / zoom, zoom },
    )
    const bodyBottomScreen = 240 + (200 / 2) * zoom
    // Outer reach of the outline band below the body edge: the 2 px
    // pad plus the full stroke, both screen-constant.
    const outlineOuterScreen = bodyBottomScreen + chrome.pad + chrome.stroke
    // The label repositions on the next cull pass (rAF) — poll.
    await expect
      .poll(async () => {
        const bounds = await win.evaluate(
          (id) => window.__ewDebug!.labelBounds(id),
          placementId,
        )
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return Number.NEGATIVE_INFINITY
        return bounds.y - outlineOuterScreen
      }, { message: `label clear of outline at zoom ${zoom}` })
      .toBeGreaterThan(chrome.gap - 1) // breathing gap, 1 px raster tolerance
  }

  await app.close()
})

/**
 * §8.2 label zoom ceiling (AI-IMP-216): Owner Parking Lot flush
 * (2026-07-09) — at board zoom (~37%) a placement title rendered HUGE
 * relative to its shrunken artwork, the label sibling of the 192
 * charm-bar fix. The label rides the shrink ladder's own two bounds
 * (EW_FURNITURE_MIN_PX / EW_PAGE_FLOOR_PX) as a fade envelope keyed on
 * the PLACEMENT's own rendered size (packages/canvas-engine's
 * placementRenderedMaxEdge + labelZoomOpacity), so it fades out with
 * an unreadable body and — unlike the AI-IMP-192 selection dismissal —
 * resurrects the instant zoom-in restores legibility.
 */
test('a placement label fades below the furniture floor and resurrects on zoom-in (§8.2, AI-IMP-216)', async () => {
  const { app, win } = await launch('ew-e2e-label-zoom-ceiling-')

  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  await runCommand(win, 'CreateNode', { nodeId })
  await runCommand(win, 'CreatePlacement', {
    placementId,
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
    nodeId,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  })
  await runCommand(win, 'CreateNote', { noteId, title: 'Beyrl' })
  await runCommand(win, 'AttachNoteToNode', { nodeId, noteId })
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.labelBounds(id), placementId))
    .not.toBeNull()

  const labelWidth = async (): Promise<number> =>
    (await win.evaluate((id) => window.__ewDebug!.labelBounds(id), placementId))?.width ?? 0

  // Working zoom: the 200-world-unit body's rendered edge clears the
  // page floor comfortably (200 ≥ EW_PAGE_FLOOR_PX) — the label reads.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await expect.poll(labelWidth).toBeGreaterThan(0)

  // Deep zoom-out: rendered = 200 × zoom is well under the furniture
  // floor — the label yields with its now-unreadable body.
  const belowFloorZoom = EW_FURNITURE_MIN_PX / 2 / 200
  await win.evaluate(
    (zoom) => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom }),
    belowFloorZoom,
  )
  await expect.poll(labelWidth).toBe(0)

  // Zoom back in past the page floor: the label resurrects — this is
  // presentation, not the AI-IMP-192 selection dismissal, so there is
  // no "stays gone until reselected" behavior to fight here.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await expect.poll(labelWidth).toBeGreaterThan(0)

  await app.close()
})
