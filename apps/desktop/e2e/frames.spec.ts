import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * §4.9 frames (AI-IMP-127) acceptance. The whole board loop: draw a
 * frame, drop items in (captured by the innermost frame), move the
 * frame (members carry), resize it (membership never changes —
 * geometry immunity), drag an item out (released), and undo the whole
 * sequence back cleanly. Membership is asserted through the recorded
 * read model (getFrameTree / the host's index over it), never from
 * geometry. Mouse coordinates are computed through the LIVE camera
 * (worldToScreen) so panel insets never skew absolute positions.
 */

interface FrameTreeNode {
  placementId: string
  isFrame: boolean
  depth: number
  members: FrameTreeNode[]
}

async function frameRoots(win: Page): Promise<FrameTreeNode[]> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const tree = await runQuery<{ roots: FrameTreeNode[] }>(win, 'getFrameTree', { canvasId })
  return tree.roots
}

/**
 * Membership from the host's live index (indexed from getFrameTree —
 * the DB read model), so a poll on it also gates the NEXT interaction
 * on the host having applied the scene that carry/capture reads.
 */
async function transitiveMembers(win: Page, framePlacementId: string): Promise<string[]> {
  return win.evaluate((id) => window.__ewDebug!.frameMembers(id), framePlacementId)
}

interface PlacementLite {
  id: string
  x: number
  y: number
  width: number | null
  height: number | null
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
      width: i['width'] as number | null,
      height: i['height'] as number | null,
      appearanceKind: (i['appearanceKind'] as string | null) ?? null,
    }))
}

/** Client (viewport) coordinates for a world point, via the live camera. */
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

/** Click a placement's center to select it (frames select on their wash). */
async function selectItem(win: Page, placementId: string): Promise<void> {
  const target = (await placements(win)).find((p) => p.id === placementId)!
  const at = await screenOf(win, target.x, target.y)
  await win.mouse.click(at.x, at.y)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
    .toContain(placementId)
}

/** The nodeId behind a placement (frames title from their node's note). */
async function nodeIdOf(win: Page, placementId: string): Promise<string> {
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const scene = await runQuery<{ items: Array<Record<string, unknown>> }>(win, 'getCanvasScene', {
    canvasId,
  })
  return scene.items.find((i) => i['id'] === placementId)!['nodeId'] as string
}

/** Seed a bare 40×40 dot placement at a world point. */
async function seedItem(win: Page, at: { x: number; y: number }): Promise<string> {
  const nodeId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreatePlacement', {
    placementId,
    canvasId,
    nodeId,
    x: at.x,
    y: at.y,
    width: 40,
    height: 40,
  })
  return placementId
}

test('draw → capture → carry → resize-immune → release → undo (§4.9)', async () => {
  const { app, win } = await launchApp('ew-e2e-frames-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

    // ---- draw a frame spanning world 100..400 (center 250,250) ----
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)

    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    // Renders as a frame appearance placement, sized from the drawn rect.
    const framePlacement = (await placements(win)).find((p) => p.id === frameId)!
    expect(framePlacement.appearanceKind).toBe('frame')
    expect(framePlacement.width).toBeCloseTo(300)
    expect(framePlacement.height).toBeCloseTo(300)

    // Back to the select tool for the drag interactions.
    await win.getByTestId('tool-select').click()

    // ---- two items dragged to end INSIDE → captured by the frame ----
    const itemA = await seedItem(win, { x: 600, y: 150 })
    const itemB = await seedItem(win, { x: 600, y: 300 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)

    // Drag A from (600,150) to (200,200) — ends inside the frame.
    await dragWorld(win, { x: 600, y: 150 }, { x: 200, y: 200 })
    await expect.poll(() => transitiveMembers(win, frameId)).toEqual([itemA])

    // Drag B to (300,300) — also inside.
    await dragWorld(win, { x: 600, y: 300 }, { x: 300, y: 300 })
    await expect.poll(() => transitiveMembers(win, frameId)).toEqual([itemA, itemB].sort())

    // ---- move the frame: members carry, membership unchanged ----
    const before = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))
    // Grab an empty spot of the frame (130,130 — no member) and drag +80,+60.
    await dragWorld(win, { x: 130, y: 130 }, { x: 210, y: 190 })
    await expect
      .poll(async () => {
        const now = new Map((await placements(win)).map((p) => [p.id, { x: p.x, y: p.y }]))
        return [frameId, itemA, itemB].map((id) => [
          Math.round(now.get(id)!.x - before.get(id)!.x),
          Math.round(now.get(id)!.y - before.get(id)!.y),
        ])
      })
      .toEqual([
        [80, 60],
        [80, 60],
        [80, 60],
      ])
    // Membership survived the carry.
    expect(await transitiveMembers(win, frameId)).toEqual([itemA, itemB].sort())

    // ---- resize the frame smaller: releases NOTHING (geometry immunity) ----
    // The frame's SE corner is now at world (480,460) (100..400 + 80,60).
    // Grab the corner resize zone and shrink hard so members fall outside.
    await dragWorld(win, { x: 480, y: 460 }, { x: 230, y: 230 })
    await expect
      .poll(async () => Math.round((await placements(win)).find((p) => p.id === frameId)!.width!))
      .toBeLessThan(300)
    expect(await transitiveMembers(win, frameId)).toEqual([itemA, itemB].sort())

    // ---- drag an item OUT → released ----
    // itemA is at world (280,260) now (200,200 + carry 80,60); it already
    // sits visually outside the shrunken frame (immunity). Drag it clear.
    // Deselect the frame first: its selection chrome can overlay nearby
    // content; Escape clears selection without a coordinate-dependent click.
    await win.getByTestId('canvas-host').click({ position: { x: 5, y: 5 } })
    await win.keyboard.press('Escape')
    await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(0)
    await dragWorld(win, { x: 280, y: 260 }, { x: 700, y: 600 })
    await expect.poll(() => transitiveMembers(win, frameId)).toEqual([itemB])

    // ---- undo walks the whole sequence back cleanly ----
    const undo = () => win.evaluate(() => window.__ewUndo!.undo())

    // 1) undo the drag-out → itemA re-captured (position + membership together).
    await undo()
    await expect.poll(() => transitiveMembers(win, frameId)).toEqual([itemA, itemB].sort())

    // 2) undo the resize → frame back to 300 wide, membership still intact.
    await undo()
    await expect
      .poll(async () => Math.round((await placements(win)).find((p) => p.id === frameId)!.width!))
      .toBe(300)
    expect(await transitiveMembers(win, frameId)).toEqual([itemA, itemB].sort())

    // 3) undo the frame move → everything shifts back by the carry.
    await undo()
    await expect
      .poll(async () => {
        const f = (await placements(win)).find((p) => p.id === frameId)!
        return [Math.round(f.x), Math.round(f.y)]
      })
      .toEqual([250, 250])

    // 4) + 5) undo both captures → no members remain.
    await undo()
    await undo()
    await expect.poll(() => transitiveMembers(win, frameId)).toEqual([])

    // 6) undo the frame creation → no frames, only the two seeded items.
    await undo()
    await expect.poll(async () => (await frameRoots(win)).length).toBe(0)
    await expect
      .poll(async () => (await placements(win)).filter((p) => p.appearanceKind === 'frame').length)
      .toBe(0)
  } finally {
    await app.close()
  }
})

test('hover dim: dragging an item over a frame focuses it and dims the rest', async () => {
  const { app, win } = await launchApp('ew-e2e-frames-dim-')
  try {
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
    // Draw a frame (100..400) and seed two items well outside it.
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    await win.getByTestId('tool-select').click()
    const dragged = await seedItem(win, { x: 600, y: 200 })
    const bystander = await seedItem(win, { x: 800, y: 600 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)

    const alpha = (id: string) => win.evaluate((i) => window.__ewDebug!.lensAlpha(i), id)

    // Begin dragging `dragged` and hold it OVER the frame (no drop).
    const from = await screenOf(win, 600, 200)
    const over = await screenOf(win, 250, 250)
    await win.mouse.move(from.x, from.y)
    await win.mouse.down()
    await win.mouse.move(over.x, over.y, { steps: 8 })

    // The frame focuses (lit), the dragged item stays lit, the bystander dims.
    await expect.poll(() => alpha(frameId)).toBe(1)
    await expect.poll(() => alpha(dragged)).toBe(1)
    await expect.poll(() => alpha(bystander)).toBeLessThan(1)

    // Drop outside; the dim clears cleanly (bystander back to full).
    const out = await screenOf(win, 800, 200)
    await win.mouse.move(out.x, out.y, { steps: 8 })
    await win.mouse.up()
    await expect.poll(() => alpha(bystander)).toBe(1)
    // Dropped outside → not captured.
    expect(await transitiveMembers(win, frameId)).toEqual([])
  } finally {
    await app.close()
  }
})

test('frame furniture: on-edge title + charm-bar sort chip, both zoom-gated (§4.9, AI-IMP-138)', async () => {
  const { app, win } = await launchApp('ew-e2e-frame-furniture-')
  try {
    await win.waitForFunction(() => window.__ewUndo !== undefined)
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
    // Keep the adornment layer engaged for the whole run.
    await win.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('ew-test-set-engagement', { detail: { engaged: true, hold: true } }),
      ),
    )

    // A frame spanning world 100..400 (300×300, center 250,250).
    await win.getByTestId('tool-frame').click()
    await dragWorld(win, { x: 100, y: 100 }, { x: 400, y: 400 }, 6)
    await expect.poll(async () => (await frameRoots(win)).length).toBe(1)
    const frameId = (await frameRoots(win))[0]!.placementId
    await win.getByTestId('tool-select').click()

    // Title the frame's node via a note; the on-edge label reads it.
    const nodeId = await nodeIdOf(win, frameId)
    const noteId = crypto.randomUUID()
    await exec(win, 'CreateNote', { noteId, title: 'Mood Board', body: '' })
    await exec(win, 'AttachNoteToNode', { nodeId, noteId })

    // ---- on-edge title: visible above the furniture floor ----
    const title = win.getByTestId(`frame-title-${frameId}`)
    await expect(title).toBeVisible()
    await expect(title).toHaveText('Mood Board')

    // ---- charm-bar sort chip reflects + sets AI-IMP-129's flag ----
    await selectItem(win, frameId)
    await expect(win.getByTestId('charm-bar')).toBeVisible()
    const chip = win.getByTestId('charm-frame-sort-on-drop')
    await expect(chip).toBeVisible()
    await expect(win.getByTestId('charm-frame-sort-now')).toBeVisible()
    // Default ON → the "grid" state; the flag is absent (absent = ON).
    await expect(chip).toHaveText(/grid/)

    // Toggle OFF → the "float" state, and the flag persists as false via
    // the SAME board-tooling path the Dock uses.
    await chip.click()
    await expect(chip).toHaveText(/float/)
    await expect
      .poll(async () => {
        const settings = await runQuery<Record<string, unknown>>(win, 'getSettings')
        return settings[`frame_sort_on_drop:${frameId}`]
      })
      .toBe(false)

    // ---- below the furniture floor: the title vanishes, region stays ----
    // 300 world px × 0.02 = 6 px < the ~8 px furniture floor.
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.02 }))
    await expect(win.getByTestId(`frame-title-${frameId}`)).toHaveCount(0)
    // The frame region itself never disappears (its ≥1px stroke persists
    // — the unit test proves the width; here the placement stays live).
    expect((await placements(win)).some((p) => p.id === frameId && p.appearanceKind === 'frame')).toBe(
      true,
    )

    // ---- back above the floor: the title returns ----
    await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
    await expect(win.getByTestId(`frame-title-${frameId}`)).toBeVisible()
  } finally {
    await app.close()
  }
})
