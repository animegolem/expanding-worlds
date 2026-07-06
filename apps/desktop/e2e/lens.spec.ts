import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, runQuery } from './helpers'

/**
 * AI-IMP-072 acceptance: the §4.8/§7.5 lens is a VIEW STATE — it dims
 * every placement outside the match set (without hiding), rings the
 * members with an accent treatment, survives pan and scene
 * reapplication, and Escape peels it BEFORE selection. Driven through
 * the __ewDebug lens hooks (the tag-panel toggle, AI-IMP-071, is the
 * chrome consumer of the same host API); assertions read
 * engine-observable state — the lens set, per-object rendered alpha,
 * and the adornment pass's ringed ids.
 */

const DIM = 0.25 // LENS_DIM_ALPHA — the engine's named dim factor

async function seedPlacement(
  win: Page,
  at: { x: number; y: number },
  size = 40,
): Promise<string> {
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
    width: size,
    height: size,
  })
  return placementId
}

test('lens dims non-members, rings members, survives pan and reapply, Escape peels lens then selection', async () => {
  const { app, win } = await launchApp('ew-e2e-lens-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // Mixed board: three placements, the lens will cover two.
  const a = await seedPlacement(win, { x: 150, y: 150 })
  const b = await seedPlacement(win, { x: 300, y: 200 })
  const c = await seedPlacement(win, { x: 450, y: 320 })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(3)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))

  // Select `a` by clicking it (placement x/y is its center).
  await win.mouse.click(box.x + 150, box.y + 150)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([a])

  // Lens on {a, b}: outsider dims to the named factor, members keep
  // full strength and gain the accent ring.
  await win.evaluate((ids) => window.__ewDebug!.setLens(ids), [a, b])
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.lens()?.sort() ?? null))
    .toEqual([a, b].sort())
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), a)).toBe(1)
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), b)).toBe(1)
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), c)).toBe(DIM)
  expect(await win.evaluate(() => window.__ewDebug!.lensRings().sort())).toEqual([a, b].sort())

  // Pan (two-finger scroll = plain wheel): the lens is a view state,
  // not a selection — the camera moves, the lens does not.
  const cameraBefore = await win.evaluate(() => window.__ewDebug!.camera())
  await win.mouse.move(box.x + 400, box.y + 300)
  await win.mouse.wheel(80, 120)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera()))
    .not.toEqual(cameraBefore)
  expect(await win.evaluate(() => window.__ewDebug!.lens()?.sort() ?? null)).toEqual(
    [a, b].sort(),
  )
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), c)).toBe(DIM)
  expect(await win.evaluate(() => window.__ewDebug!.lensRings().sort())).toEqual([a, b].sort())

  // Scene reapplication intersects with survivors: deleting member
  // `b` shrinks the lens to {a}; the board edit does not drop it.
  await exec(win, 'DeleteDraftPlacement', { placementId: b })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.lens()))
    .toEqual([a])
  expect(await win.evaluate(() => window.__ewDebug!.lensRings())).toEqual([a])
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), c)).toBe(DIM)

  // First Escape: the lens drops, the selection is untouched (§4.8 —
  // exiting a view state must not disturb what the user selected).
  await win.keyboard.press('Escape')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.lens())).toBeNull()
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), c)).toBe(1)
  expect(await win.evaluate(() => window.__ewDebug!.lensRings())).toEqual([])
  expect(await win.evaluate(() => window.__ewDebug!.selection())).toEqual([a])

  // Second Escape: now the selection clears.
  await win.keyboard.press('Escape')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection())).toEqual([])

  await app.close()
})

test('an empty intersection clears the lens; clearLens is explicit and idempotent', async () => {
  const { app, win } = await launchApp('ew-e2e-lens-clear-')

  const a = await seedPlacement(win, { x: 150, y: 150 })
  const b = await seedPlacement(win, { x: 300, y: 200 })
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(2)

  // Lens on {a} only: deleting `a` empties the intersection — the
  // lens drops entirely instead of dimming the whole board, and `b`
  // returns to full strength.
  await win.evaluate((ids) => window.__ewDebug!.setLens(ids), [a])
  await expect
    .poll(() => win.evaluate((id) => window.__ewDebug!.lensAlpha(id), b))
    .toBe(DIM)
  await exec(win, 'DeleteDraftPlacement', { placementId: a })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.lens())).toBeNull()
  expect(await win.evaluate((id) => window.__ewDebug!.lensAlpha(id), b)).toBe(1)

  // Explicit clear mirrors the host API the tag panel toggle will use.
  await win.evaluate((ids) => window.__ewDebug!.setLens(ids), [b])
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.lensRings()))
    .toEqual([b])
  await win.evaluate(() => window.__ewDebug!.clearLens())
  await win.evaluate(() => window.__ewDebug!.clearLens()) // idempotent
  expect(await win.evaluate(() => window.__ewDebug!.lens())).toBeNull()
  expect(await win.evaluate(() => window.__ewDebug!.lensRings())).toEqual([])

  // The scene never lost anything to the lens: dim ≠ hide.
  const scene = await runQuery<{ items: Array<{ itemKind: string }> }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  expect(scene.items.filter((item) => item.itemKind === 'placement')).toHaveLength(1)

  await app.close()
})
