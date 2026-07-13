import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * §4.9 add-from-library round-trip (AI-IMP-196). The frame action parks
 * a target frame and opens the EXISTING gallery takeover; the gallery's
 * ordinary place then lands the picked nodes captured + arranged inside
 * the frame (frame-load.ts). AI-IMP-129 shipped this path with NO e2e —
 * and the picker self-dismissed on the first click, making step one
 * impassable. This spec drives the WHOLE path: select frame → Add from
 * library → picker opens → click a tile (must NOT dismiss) → place →
 * captured member.
 */

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

async function transitiveMembers(win: Page, framePlacementId: string): Promise<string[]> {
  return win.evaluate((id) => window.__ewDebug!.frameMembers(id), framePlacementId)
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
  const a = await screenOf(win, from.x, from.y)
  const b = await screenOf(win, to.x, to.y)
  await win.mouse.move(a.x, a.y)
  await win.mouse.down()
  await win.mouse.move(b.x, b.y, { steps })
  await win.mouse.up()
}

/** The nodeId behind a frame's placement, so we can pick a DIFFERENT
 * gallery cell (the frame's own node also lands in the index). */
async function nodeIdOf(win: Page, placementId: string): Promise<string> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await runQuery<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  return scene.items.find((i) => i['id'] === placementId)!['nodeId'] as string
}

function cell(win: Page, nodeId: string) {
  return win.locator(`[data-testid="gallery-cell"][data-node-id="${nodeId}"]`)
}

test('select frame → Add from library → pick a tile (no self-dismiss) → captured member (§4.9, AI-IMP-196)', async () => {
  const { app, win } = await launchApp('ew-e2e-frame-library-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // Seed one bare node — it is the library work we will pick. (Bare
    // CreateNode lands in the gallery index just like an import.)
    const pickNodeId = crypto.randomUUID()
    await exec(win, 'CreateNode', { nodeId: pickNodeId })

    // Draw a frame spanning world 100..400 (center 250,250).
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    const frameNodeId = await nodeIdOf(win, frameId)
    await win.getByTestId('tool-select').click()

    // Select the frame → its charm actions appear.
    const at = await screenOf(win, 250, 250)
    await win.mouse.click(at.x, at.y)
    await expect
      .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
      .toContain(frameId)
    await expect(win.getByTestId('charm-frame-add-library')).toBeVisible()

    // Add from library → the gallery takeover opens over the parked frame.
    await win.getByTestId('charm-frame-add-library').click()
    await expect(win.getByTestId('takeover-gallery')).toBeVisible()

    // The BUG (AI-IMP-196): the picker self-dismissed on the first
    // click. Click a work — the picker must STAY, and the cell selects.
    await expect(cell(win, pickNodeId)).toBeVisible()
    await cell(win, pickNodeId).click()
    await expect(win.getByTestId('takeover-gallery')).toBeVisible()
    await expect(cell(win, pickNodeId)).toHaveAttribute('data-selected', 'true')
    await expect(win.getByTestId('gallery-action-bar')).toBeVisible()

    // Place → the takeover closes and the pick lands captured in the frame.
    await win.getByTestId('gallery-action-place').click()
    await expect(win.getByTestId('takeover-gallery')).toHaveCount(0)
    // frameMembers returns member PLACEMENT ids; the frame-load created a
    // fresh placement for the picked node — resolve it back and assert the
    // frame gained exactly one member, whose node is the pick.
    await expect
      .poll(async () => {
        const members = await transitiveMembers(win, frameId)
        const nodes = await Promise.all(members.map((id) => nodeIdOf(win, id)))
        return nodes
      })
      .toEqual([pickNodeId])
    // The frame's own node was never placed — only the pick landed.
    expect(pickNodeId).not.toBe(frameNodeId)
  } finally {
    await app.close()
  }
})
