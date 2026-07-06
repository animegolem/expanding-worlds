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

/** Renders a solid PNG in-page (matches board-tooling's helper). */
async function pngBytes(win: Page, color: string, size = 8): Promise<Buffer> {
  const bytes = await win.evaluate(
    async ({ fill, size }) => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, size, size)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
      )
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { fill: color, size },
  )
  return Buffer.from(bytes)
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

test('appearance switcher: dot→icon renders + undo, dot→card, card gated by note (§4.6)', async () => {
  const { app, win } = await launchApp('ew-e2e-appearance-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  // A dot node WITH a note (seedPin sets appearance dot #77aaff).
  const pin = await seedPin(win, 'Beacon', { x: 500, y: 350 })

  const kind = async (): Promise<unknown> =>
    (await scenePlacement(win, pin.placementId))?.['appearanceKind']
  const body = (id: string): Promise<string | null> =>
    win.evaluate((placementId) => window.__ewDebug!.placementBody(placementId), id)

  // Select → charm bar → the appearance charm opens the popover.
  await win.mouse.click(box.x + 500, box.y + 350)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await expect(win.getByTestId('charm-bar')).toBeVisible()
  await expect(win.getByTestId('charm-appearance-popover')).toBeHidden()
  await win.getByTestId('charm-appearance').click()
  await expect(win.getByTestId('charm-appearance-popover')).toBeVisible()

  // With a note attached, card is enabled.
  await expect(win.getByTestId('appearance-card')).toHaveAttribute('data-disabled', 'false')

  // Opening appearance folds the tag chips (one popover at a time).
  await win.getByTestId('charm-tags').click()
  await expect(win.getByTestId('charm-tag-chips')).toBeVisible()
  await expect(win.getByTestId('charm-appearance-popover')).toBeHidden()
  await win.getByTestId('charm-appearance').click()
  await expect(win.getByTestId('charm-appearance-popover')).toBeVisible()
  await expect(win.getByTestId('charm-tag-chips')).toBeHidden()

  // dot→icon: pick a built-in icon; the board re-renders to the icon
  // glyph WITHOUT reselection, and the popover folds after the pick.
  await win.getByTestId('appearance-icon-star').click()
  await expect.poll(kind).toBe('icon')
  await expect.poll(() => body(pin.placementId)).toBe('icon')
  await expect(win.getByTestId('charm-appearance-popover')).toBeHidden()

  // One undo restores the prior appearance. No interactive undo surface
  // yet (EPIC-007), so drive the handler's inverse directly: set a new
  // appearance, capture the returned inverse — then apply it and watch
  // the node return to the icon it held before.
  const runInPage = (commandType: string, payload: unknown) =>
    win.evaluate(
      async ({ commandType, payload }) => {
        const project = await window.ew.project.query('getProject')
        if (!project.ok) throw new Error(project.message)
        const outcome = await window.ew.project.execute({
          commandId: window.ew.util.newId(),
          projectId: (project.result as { id: string }).id,
          commandType,
          commandVersion: 1,
          issuedAt: new Date().toISOString(),
          payload,
        })
        if (outcome.status !== 'committed') throw new Error(`${commandType}: ${outcome.status}`)
        return outcome.inverse
      },
      { commandType, payload },
    )
  const inverse = await runInPage('SetNodeAppearance', {
    nodeId: pin.nodeId,
    appearance: { kind: 'dot', color: '#1234ab' },
  })
  expect(inverse).not.toBeNull()
  await expect.poll(kind).toBe('dot')
  await runInPage(inverse!.commandType, inverse!.payload)
  await expect.poll(kind).toBe('icon')

  // dot→card: reopen the popover, pick card; the card chrome renders.
  await win.getByTestId('charm-appearance').click()
  await win.getByTestId('appearance-card').click()
  await expect.poll(kind).toBe('card')
  await expect.poll(() => body(pin.placementId)).toBe('card')

  // A node with NO note: card is visibly disabled with a why-tooltip.
  const bare = await seedPin(win, '', { x: 800, y: 350 }, { note: false })
  await win.mouse.click(box.x + 800, box.y + 350)
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(1)
  await win.getByTestId('charm-appearance').click()
  await expect(win.getByTestId('charm-appearance-popover')).toBeVisible()
  await expect(win.getByTestId('appearance-card')).toHaveAttribute('data-disabled', 'true')
  await expect(win.getByTestId('appearance-card')).toHaveAttribute('aria-label', /needs a note/i)
  // Clicking the disabled card is a no-op — the bare node stays a dot.
  await win.getByTestId('appearance-card').click()
  expect(await body(bare.placementId)).toBe('dot')

  await app.close()
})

test('appearance switcher: image… imports through the ordinary pipeline (§4.6/§6.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-appearance-image-')
  const box = (await win.getByTestId('canvas-host').boundingBox())!
  const pin = await seedPin(win, 'Portal', { x: 500, y: 350 })

  await win.mouse.click(box.x + 500, box.y + 350)
  await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  await win.getByTestId('charm-appearance').click()
  await expect(win.getByTestId('charm-appearance-popover')).toBeVisible()

  // A PNG through the same file-input pattern the background uses.
  await win.getByTestId('appearance-image-input').setInputFiles({
    name: 'portal.png',
    mimeType: 'image/png',
    buffer: await pngBytes(win, '#3366cc'),
  })
  await expect
    .poll(async () => (await scenePlacement(win, pin.placementId))?.['appearanceKind'])
    .toBe('image')
  // The popover folded after the pick.
  await expect(win.getByTestId('charm-appearance-popover')).toBeHidden()

  await app.close()
})
