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
  x: number
  y: number
  flipX: number
  locked: number
  renderOrder: number
  appearanceKind: string | null
}

async function placement(win: Page, id: string): Promise<ScenePlacement | undefined> {
  const scene = await runQuery<{ items: ScenePlacement[] }>(win, 'getCanvasScene', {
    canvasId: await win.evaluate(() => window.__ewDebug!.canvasId()),
  })
  return scene.items.find((i) => i.id === id)
}

/** A rect decoration at world (x,y); returns its id and screen center. */
async function seedDecoration(
  win: Page,
  at: { x: number; y: number },
): Promise<{ id: string; cx: number; cy: number }> {
  const id = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  const width = 120
  const height = 90
  await exec(win, 'CreateDecoration', {
    decorationId: id,
    canvasId,
    kind: 'shape',
    data: { shape: 'rect', x: at.x, y: at.y, width, height, stroke: '#dde3ea', strokeWidth: 2, fill: '#2b2f36' },
  })
  return { id, cx: at.x + width / 2, cy: at.y + height / 2 }
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
    // Platform-aware: formatBinding prints mac glyphs on darwin and
    // spelled modifiers elsewhere (the settings.spec Linux lesson).
    await expect(flipChip).toHaveText(process.platform === 'darwin' ? '⇧H' : 'Shift+H')
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

test('decoration menu: style / z-order / lock / hide / Delete — never item verbs (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-deco-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const deco = await seedDecoration(win, { x: 600, y: 380 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 1)

    // Right-click the decoration opens the DECORATION menu.
    await win.mouse.click(box.x + deco.cx, box.y + deco.cy, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('decoration')

    // Style verbs present: edit-style (disabled), z-order, lock, hide.
    await expect(win.getByTestId('ctx-edit-style')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-bring-to-front')).toBeVisible()
    await expect(win.getByTestId('ctx-lock')).toBeVisible()
    await expect(win.getByTestId('ctx-hide')).toBeVisible()

    // NEVER item verbs — the grammar structurally omits them.
    const order = await rowOrder(win)
    for (const forbidden of [
      'ctx-appearance',
      'ctx-flip-h',
      'ctx-flip-v',
      'ctx-crop',
      'ctx-tags',
      'ctx-set-as-backdrop',
      'ctx-open-as-board',
      'ctx-hide-label',
    ]) {
      expect(order).not.toContain(forbidden)
    }
    // Delete is last, alone.
    expect(order[order.length - 1]).toBe('ctx-delete')

    // Delete removes the decoration (a shipped decoration command).
    await win.getByTestId('ctx-delete').click()
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 0)
  } finally {
    await app.close()
  }
})

test('multi-select menu: count header + Gather into a frame = ONE undo (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-multi-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const a = await seedPin(win, 'One', { x: 400, y: 300 })
    const b = await seedPin(win, 'Two', { x: 800, y: 300 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)

    // Marquee both (start on empty canvas above the pins).
    await win.mouse.move(box.x + 300, box.y + 120)
    await win.mouse.down()
    await win.mouse.move(box.x + 950, box.y + 470, { steps: 5 })
    await win.mouse.up()
    await win.waitForFunction(() => window.__ewDebug!.selection().length === 2)

    // Right-click INSIDE the selection opens the MULTI menu (selection
    // is not collapsed).
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('multi')

    // Count header leads; gather/align present; Delete names the count.
    await expect(win.getByTestId('ctx-count')).toHaveText('2 items selected')
    await expect(win.getByTestId('ctx-align')).toBeVisible()
    await expect(win.getByTestId('ctx-gather-into-frame')).toBeVisible()
    // (the row also carries its mono ⌫ shortcut chip, so match the label)
    await expect(win.getByTestId('ctx-delete')).toContainText('Delete 2 items')

    // Align flyout: pressing a child must run the verb, close the WHOLE
    // menu, and leave no orphaned flyout (Codex review, PR #9 — the
    // sibling-parented flyout was "outside" the pointer guard and got
    // stranded while the parent closed under it).
    await win.getByTestId('ctx-align').click()
    await expect(win.getByTestId('ctx-submenu-align')).toBeVisible()
    await win.getByTestId('ctx-align-left').click()
    await expect(win.getByTestId('context-menu')).toHaveCount(0)
    await expect(win.getByTestId('ctx-submenu-align')).toHaveCount(0)
    // The verb really ran: equal-sized pins align-left onto one center x.
    await expect
      .poll(async () => {
        const [pa, pb] = [await placement(win, a.placementId), await placement(win, b.placementId)]
        return pa && pb ? Math.abs(pa.x - pb.x) : Infinity
      })
      .toBeLessThan(0.5)

    // Re-select and reopen the multi menu for the gather assertion.
    await win.mouse.move(box.x + 300, box.y + 120)
    await win.mouse.down()
    await win.mouse.move(box.x + 950, box.y + 470, { steps: 5 })
    await win.mouse.up()
    await win.waitForFunction(() => window.__ewDebug!.selection().length === 2)
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()

    // Gather into a frame = one undo group: a frame placement is added
    // (2 → 3) and ONE Mod+Z reverses the whole gather.
    const depth = await undoDepth(win)
    await win.getByTestId('ctx-gather-into-frame').click()
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)
    expect(await undoDepth(win)).toBe(depth + 1)
    await undoOnce(win)
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 2)
    // The original members survive the round trip.
    expect(await placement(win, a.placementId)).toBeDefined()
  } finally {
    await app.close()
  }
})

test('frame menu: sort family + fill + Delete-frame-contents-stay (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-frame-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    // A frame placement: seed a pin, then switch its node to the frame
    // appearance so the scene projects appearanceKind 'frame'.
    const frame = await seedPin(win, 'Frame', { x: 500, y: 350 })
    await exec(win, 'SetNodeAppearance', { nodeId: frame.nodeId, appearance: { kind: 'frame' } })
    await expect
      .poll(async () => (await placement(win, frame.placementId))?.appearanceKind)
      .toBe('frame')

    const p = (await placement(win, frame.placementId))!
    await win.mouse.click(box.x + p.x, box.y + p.y, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('frame')

    // The sort family (129's actions) + rename (coming-soon) + delete.
    await expect(win.getByTestId('ctx-frame-sort-on-drop')).toContainText('Sort on drop:')
    await expect(win.getByTestId('ctx-frame-sort-now')).toBeVisible()
    await expect(win.getByTestId('ctx-frame-fill')).toBeVisible()
    await expect(win.getByTestId('ctx-rename-frame')).toHaveAttribute('aria-disabled', 'true')
    await expect(win.getByTestId('ctx-delete-frame')).toHaveText('Delete frame — contents stay')
    // No item-only backdrop verb on the frame menu.
    expect(await rowOrder(win)).not.toContain('ctx-set-as-backdrop')

    // Delete frame trashes the frame node — the frame placement leaves
    // the scene (its members, had it any, would stay).
    await win.getByTestId('ctx-delete-frame').click()
    await expect.poll(async () => await placement(win, frame.placementId)).toBeUndefined()
  } finally {
    await app.close()
  }
})
