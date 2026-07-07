import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp } from './helpers'

/**
 * AI-IMP-118 acceptance (§6.7 rev 0.50): on a board with no background
 * image the lit stage extent derives from content — a padded bbox in
 * the canvas color over a darker derived void. The extent is a session
 * ratchet: it grows (eased) as an item pushes past an edge and never
 * retreats mid-session; board open recomputes it snug. An empty board
 * is all void until the first placement blooms a stage.
 */

interface Seeded {
  nodeId: string
  placementId: string
}

async function seedPin(
  win: Page,
  at: { x: number; y: number },
  size = 200,
): Promise<Seeded> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId,
    x: at.x,
    y: at.y,
    appearance: { kind: 'dot', color: '#77aaff' },
  })
  await moveTo(win, placementId, at, size)
  return { nodeId, placementId }
}

/** Commits the outcome of a drag: TransformContent is exactly what a
 * released move gesture emits, so the ratchet sees it on scene apply. */
async function moveTo(
  win: Page,
  placementId: string,
  at: { x: number; y: number },
  size = 200,
): Promise<void> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'TransformContent', {
    canvasId,
    items: [
      { kind: 'placement', placementId, x: at.x, y: at.y, width: size, height: size, scale: 1, rotation: 0 },
    ],
  })
}

const stage = (win: Page) => win.evaluate(() => window.__ewDebug!.stage())

test('content defines the stage: bloom, grow-only ratchet, snug on reopen (§6.7 rev 0.50)', async () => {
  const { app, win } = await launchApp('ew-e2e-content-stage-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())

  // Empty board: no background image, no content → all void.
  const empty = await stage(win)
  expect(empty.extent).toBeNull() // no background image
  expect(empty.contentExtent).toBeNull()
  expect(empty.contentTarget).toBeNull()
  // The void tone is derived (darker) from the effective fill, not a
  // second raw color: strictly darker than the canvas color.
  const fillNum = Number.parseInt(empty.fallbackColor.replace('#', '').slice(0, 6), 16)
  expect(empty.voidColor).toBeLessThan(fillNum)

  // First placement lights a stage: the target appears immediately and
  // the displayed (eased) extent blooms up to it.
  const pin = await seedPin(win, { x: 400, y: 300 }, 200)
  await expect.poll(async () => (await stage(win)).contentTarget?.width ?? 0).toBeGreaterThan(0)
  const bloomed = await stage(win)
  // AABB (300,200,200,200) padded 320 → (-20,-120) size 840×840.
  expect(bloomed.contentTarget!.width).toBeCloseTo(840, 0)
  expect(bloomed.contentTarget!.height).toBeCloseTo(840, 0)
  // The lit rect exists (bloom settles to the target).
  await expect
    .poll(async () => (await stage(win)).contentExtent?.width ?? 0)
    .toBeCloseTo(840, 0)

  // Drag the item outward past the right edge → the target grows.
  await moveTo(win, pin.placementId, { x: 2000, y: 300 }, 200)
  await expect
    .poll(async () => (await stage(win)).contentTarget?.width ?? 0)
    .toBeGreaterThan(840)
  const grown = await stage(win)
  const grownRight = grown.contentTarget!.x + grown.contentTarget!.width
  expect(grownRight).toBeGreaterThan(bloomed.contentTarget!.x + bloomed.contentTarget!.width)

  // Drag it back inward → the ratchet does NOT shrink.
  await moveTo(win, pin.placementId, { x: 400, y: 300 }, 200)
  // Let any scene applies settle, then assert the target is unchanged.
  await win.evaluate(() => window.__ewDebug!.stage())
  await expect
    .poll(async () => (await stage(win)).contentTarget?.width ?? 0)
    .toBeCloseTo(grown.contentTarget!.width, 0)

  // Navigate away and back → the extent recomputes snug around content.
  const child = crypto.randomUUID()
  await exec(win, 'CreateCanvas', { canvasId: child, nodeId: pin.nodeId })
  await win.evaluate((id) => window.__ewDebug!.openCanvas(id), child)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(child)
  await win.evaluate((id) => window.__ewDebug!.openCanvas(id), root)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  // Back on the root, the pin sits snug again — target smaller than the
  // ratcheted width, matching the freshly padded bbox (~840).
  await expect
    .poll(async () => (await stage(win)).contentTarget?.width ?? 0)
    .toBeCloseTo(840, 0)

  await app.close()
})
