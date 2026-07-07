import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, revision, runQuery } from './helpers'

/**
 * AI-IMP-136 acceptance (RFC §8.4 rev 0.55): the ONE context-menu
 * surface. A right-click on an item opens the ratified item menu at the
 * cursor — grouped verbs, mono shortcut chips, Delete alone behind the
 * last divider — and a right-click on empty board opens the board menu
 * (paste / select-all / fit · backdrop family · color row · board
 * note). The three item round trips prove one-undo via undoDepth; the
 * board backdrop-color verb commits (SetCanvasBackgroundColor is not in
 * the renderer's undo allowlist — that seam lives in undo/, out of this
 * ticket's fence — so it is asserted as a commit, not a one-undo).
 */

interface Seeded {
  nodeId: string
  placementId: string
}

async function seedPin(
  win: Page,
  title: string,
  at: { x: number; y: number },
  color = '#77aaff',
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
    appearance: { kind: 'dot', color },
    note: { kind: 'create', noteId, title },
  })
  await exec(win, 'TransformContent', {
    canvasId,
    items: [
      { kind: 'placement', placementId, x: at.x, y: at.y, width: 200, height: 200, scale: 1, rotation: 0 },
    ],
  })
  return { nodeId, placementId }
}

interface ScenePlacement {
  id: string
  flipX: number
  locked: number
  renderOrder: number
}

async function placement(win: Page, id: string): Promise<ScenePlacement | undefined> {
  const scene = await runQuery<{ items: ScenePlacement[] }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  return scene.items.find((i) => i.id === id)
}

async function backgroundColor(win: Page): Promise<string | null> {
  const scene = await runQuery<{ background: { color: string | null } | null }>(
    win,
    'getCanvasScene',
    { canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()) },
  )
  return scene.background?.color ?? null
}

const readyUndo = (win: Page): Promise<void> =>
  win.waitForFunction(() => window.__ewUndo !== undefined).then(() => undefined)
const undoDepth = (win: Page): Promise<number> =>
  win.evaluate(() => window.__ewUndo!.undoDepth())
const undoOnce = (win: Page): Promise<void> =>
  win.evaluate(() => window.__ewUndo!.undo()).then(() => undefined)

/** The testids of the open menu's rows, top to bottom. */
async function rowOrder(win: Page): Promise<string[]> {
  return win.evaluate(() => {
    const menu = document.querySelector('[data-testid="context-menu"]')
    if (!menu) return []
    return [...menu.querySelectorAll('[role="menuitem"]')].map((b) =>
      b.getAttribute('data-testid'),
    ) as string[]
  })
}

test('item menu: ratified grammar + flip / z-order / delete one-undo round-trips (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-item-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    // Placed apart so a right-click lands unambiguously on the back
    // item (overlapping items would resolve to the topmost).
    const back = await seedPin(win, 'Back', { x: 400, y: 300 }, '#77aaff')
    const front = await seedPin(win, 'Front', { x: 800, y: 300 }, '#ffaa55')
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

    // Right-click the BACK item opens the item menu at the cursor.
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('item')

    // Grammar: Delete is the FINAL row, alone (destructive last).
    const order = await rowOrder(win)
    expect(order[order.length - 1]).toBe('ctx-delete')
    expect(order.filter((id) => id === 'ctx-delete')).toHaveLength(1)

    // A shipped verb prints its shortcut in a mono chip.
    const flipChip = win.getByTestId('ctx-flip-h').locator('span').last()
    await expect(flipChip).toHaveText('⇧H')
    const chipFont = await flipChip.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(chipFont.toLowerCase()).toContain('monospace')

    // Coming-soon verbs render disabled.
    await expect(win.getByTestId('ctx-replace-image')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-swap-for')).toHaveAttribute('aria-disabled', 'true')

    // --- round-trip 1: flip via menu = exactly one undo entry ---
    let depth = await undoDepth(win)
    await win.getByTestId('ctx-flip-h').click()
    await expect.poll(async () => (await placement(win, back.placementId))?.flipX).toBe(1)
    expect(await undoDepth(win)).toBe(depth + 1)
    await undoOnce(win)
    await expect.poll(async () => (await placement(win, back.placementId))?.flipX).toBe(0)

    // --- round-trip 2: z-order (bring to front) via menu = one undo ---
    const frontOrder = (await placement(win, front.placementId))!.renderOrder
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    depth = await undoDepth(win)
    await win.getByTestId('ctx-bring-to-front').click()
    await expect
      .poll(async () => (await placement(win, back.placementId))!.renderOrder)
      .toBeGreaterThan(frontOrder)
    expect(await undoDepth(win)).toBe(depth + 1)
    await undoOnce(win)
    await expect
      .poll(async () => (await placement(win, back.placementId))!.renderOrder)
      .toBeLessThan(frontOrder)

    // --- round-trip 3: delete via menu = one undo (Delete restores) ---
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('ctx-delete')).toBeVisible()
    depth = await undoDepth(win)
    await win.getByTestId('ctx-delete').click()
    await expect.poll(async () => await placement(win, back.placementId)).toBeUndefined()
    expect(await undoDepth(win)).toBe(depth + 1)
    await undoOnce(win)
    await expect.poll(async () => await placement(win, back.placementId)).toBeDefined()
  } finally {
    await app.close()
  }
})

test('board menu: offers paste / select-all / fit, backdrop family, color row (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-board-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    await seedPin(win, 'Anchor', { x: 400, y: 300 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

    // Right-click empty board opens the board menu.
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('board')

    // The ratified board offers: paste (coming-soon), select-all, fit,
    // the backdrop family, the color row, and the board note.
    await expect(win.getByTestId('ctx-paste')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-select-all')).toBeVisible()
    await expect(win.getByTestId('ctx-zoom-to-fit')).toBeVisible()
    await expect(win.getByTestId('ctx-set-backdrop')).toBeVisible()
    await expect(win.getByTestId('ctx-backdrop-color')).toBeVisible()
    await expect(win.getByTestId('ctx-board-note')).toBeVisible()
    // No destructive row on the board menu.
    expect(await rowOrder(win)).not.toContain('ctx-delete')

    // The backdrop color swatch commits SetCanvasBackgroundColor —
    // and per §8.4 rev 0.55 ("every verb = one undoable command") it
    // is undo-captured: one Mod+Z clears the paint (lead follow-up at
    // the 136 merge; SetPlacementLock/LabelVisibility/SetCanvasBackground
    // joined CAPTURED_COMMANDS alongside it).
    expect(await backgroundColor(win)).toBeNull()
    const before = await revision(win)
    const depthBefore = await undoDepth(win)
    await win.getByTestId('ctx-backdrop-color-1').click()
    await expect.poll(() => backgroundColor(win)).not.toBeNull()
    expect(await revision(win)).toBe(before + 1)
    expect(await undoDepth(win)).toBe(depthBefore + 1)
    await undoOnce(win)
    await expect.poll(() => backgroundColor(win)).toBeNull()

    // Select-all via the menu selects every item.
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await win.getByTestId('ctx-select-all').click()
    await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  } finally {
    await app.close()
  }
})
