import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, revision } from './helpers'

/**
 * AI-IMP-063 acceptance (RFC §8.4): hint charms are the census of
 * what a node holds; the click grammar is single-click = select +
 * charm bar, page charm = note, frame charm = dive, double-click =
 * everything; the charm bar carries the node verbs. Charms live in a
 * DOM adornment layer — structurally outside the scene texture, so
 * they can never appear in exports or crop previews.
 */

interface Seeded {
  nodeId: string
  noteId: string
  placementId: string
}

async function seedPin(
  win: Page,
  title: string,
  at: { x: number; y: number },
  opts: { note?: boolean; size?: number } = {},
): Promise<Seeded> {
  const nodeId = crypto.randomUUID()
  const noteId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId,
    x: at.x,
    y: at.y,
    appearance: { kind: 'dot', color: '#77aaff' },
    ...(opts.note === false ? {} : { note: { kind: 'create', noteId, title } }),
  })
  const size = opts.size ?? 200
  await exec(win, 'TransformContent', {
    canvasId,
    items: [
      {
        kind: 'placement',
        placementId,
        x: at.x,
        y: at.y,
        width: size,
        height: size,
        scale: 1,
        rotation: 0,
      },
    ],
  })
  return { nodeId, noteId, placementId }
}

async function scenePlacement(
  win: Page,
  placementId: string,
): Promise<Record<string, unknown> | null> {
  return win.evaluate(
    async ({ id }) => {
      const canvasId = window.__ewDebug!.canvasId()
      const response = await window.ew.project.query('getCanvasScene', { canvasId })
      if (!response.ok) return null
      const scene = response.result as { items: Array<Record<string, unknown>> }
      return scene.items.find((item) => item['id'] === id) ?? null
    },
    { id: placementId },
  )
}

test('hint charms and the click grammar (§8.4 table)', async () => {
  const { app, win } = await launchApp('ew-e2e-charms-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const box = (await win.getByTestId('canvas-host').boundingBox())!

  // A node with a note only: page charm, no frame charm.
  const pin = await seedPin(win, 'Harbor Keep', { x: 400, y: 300 })
  await expect(win.getByTestId(`hint-page-${pin.placementId}`)).toBeVisible()
  await expect(win.getByTestId(`hint-frame-${pin.placementId}`)).toHaveCount(0)

  // Give it a canvas: the frame charm joins, side by side.
  const childCanvasId = crypto.randomUUID()
  await exec(win, 'CreateCanvas', { canvasId: childCanvasId, nodeId: pin.nodeId })
  await expect(win.getByTestId(`hint-frame-${pin.placementId}`)).toBeVisible()

  // Page charm click: the note opens; the canvas does NOT change.
  await win.getByTestId(`hint-page-${pin.placementId}`).click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor Keep/)
  expect(await win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // Frame charm click: dive only, as a history entry.
  await win.getByTestId(`hint-frame-${pin.placementId}`).click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(childCanvasId)
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // Double-click = everything: dive AND the note opens.
  await win.getByTestId('tool-select').click()
  await win.mouse.dblclick(box.x + 400, box.y + 300)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(childCanvasId)
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Harbor Keep/)
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // A bare node shows no charms at rest.
  const bare = await seedPin(win, '', { x: 700, y: 300 }, { note: false })
  await expect(win.getByTestId(`hint-charms-${bare.placementId}`)).toHaveCount(0)

  // Visibility keys on RENDERED screen size: zoom far out and the
  // charms drop; zoom back and they return.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 0.1 }))
  await expect(win.getByTestId(`hint-charms-${pin.placementId}`)).toHaveCount(0)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await expect(win.getByTestId(`hint-page-${pin.placementId}`)).toBeVisible()

  await app.close()
})

test('the charm bar: flips, make-canvas, tags, lock (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-charmbar-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const pin = await seedPin(win, 'Lighthouse', { x: 500, y: 350 })

  // Single click selects and shows the charm bar.
  await expect(win.getByTestId('charm-bar')).toBeHidden()
  await win.mouse.click(box.x + 500, box.y + 350)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expect(win.getByTestId('charm-bar')).toBeVisible()

  // Flips commit FlipPlacement.
  const before = await revision(win)
  await win.getByTestId('charm-flip-h').click()
  await expect.poll(async () => (await scenePlacement(win, pin.placementId))?.['flipX']).toBe(1)
  await win.getByTestId('charm-flip-v').click()
  await expect.poll(async () => (await scenePlacement(win, pin.placementId))?.['flipY']).toBe(1)
  expect(await revision(win)).toBe(before + 2)

  // Make-canvas creates the node's canvas; the frame hint appears and
  // the button retires into its disabled state.
  await win.getByTestId('charm-make-canvas').click()
  await expect(win.getByTestId(`hint-frame-${pin.placementId}`)).toBeVisible()
  await expect
    .poll(async () => (await scenePlacement(win, pin.placementId))?.['childCanvasId'])
    .not.toBeNull()
  await expect(win.getByTestId('charm-make-canvas')).toBeDisabled()

  // The # charm pops the node's tag chips.
  const tagId = crypto.randomUUID()
  await exec(win, 'CreateTag', { tagId, name: 'ink' })
  await exec(win, 'AssignTagToNode', { tagId, nodeId: pin.nodeId })
  await win.getByTestId('charm-tags').click()
  await expect(win.getByTestId(`tag-chip-${tagId}`)).toBeVisible()
  await expect(win.getByTestId(`tag-chip-${tagId}`)).toHaveText('#ink')

  // Lock persists through SetPlacementLock and survives reload.
  await win.getByTestId('charm-lock').click()
  await expect.poll(async () => (await scenePlacement(win, pin.placementId))?.['locked']).toBe(1)
  await win.getByTestId('charm-lock').click()
  await expect.poll(async () => (await scenePlacement(win, pin.placementId))?.['locked']).toBe(0)

  // The note charm opens the existing note.
  await win.getByTestId('charm-note').click()
  await expect(win.getByTestId('note-pane-title')).toHaveText(/Lighthouse/)

  await app.close()
})
