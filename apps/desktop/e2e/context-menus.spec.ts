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

test('ground HERE leads to the shared board inventory; color and select-all stay live (§8.4)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-board-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    await seedPin(win, 'Anchor', { x: 400, y: 300 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

    // Right-click empty board opens HERE first.
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'ground')
    for (const id of ['paste-here', 'text-here', 'pin-here', 'shape-here', 'frame-here', 'board']) {
      await expect(win.getByTestId(`ctx-${id}`)).toBeVisible()
    }
    expect(await rowOrder(win)).not.toContain('ctx-arrange')
    await win.getByTestId('ctx-board').click()
    await expect(win.getByTestId('context-menu')).toHaveAttribute('data-kind', 'board')

    // The ratified board offers: paste (coming-soon), select-all, fit,
    // the backdrop family, the color row, and the board note.
    await expect(win.getByTestId('ctx-paste')).toHaveCount(0)
    await expect(win.getByTestId('ctx-select-all')).toBeVisible()
    await expect(win.getByTestId('ctx-zoom-to-fit')).toBeVisible()
    await expect(win.getByTestId('bg-set-from-file')).toBeVisible()
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
    await win.getByLabel('Recent colors').getByRole('button').first().click()
    await expect.poll(() => backgroundColor(win)).not.toBeNull()
    expect(await revision(win)).toBe(before + 1)
    expect(await undoDepth(win)).toBe(depthBefore + 1)
    await undoOnce(win)
    await expect.poll(() => backgroundColor(win)).toBeNull()

    // Select-all via the menu selects every item.
    await win.mouse.click(box.x + 950, box.y + 620, { button: 'right' })
    await win.getByTestId('ctx-board').click()
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

    // Count header leads; align moved to ⌗; Delete names the count.
    await expect(win.getByTestId('ctx-count')).toHaveText('2 items selected')
    await expect(win.getByTestId('ctx-align')).toHaveCount(0)
    await expect(win.getByTestId('ctx-gather-into-frame')).toBeVisible()
    // (the row also carries its mono ⌫ shortcut chip, so match the label)
    await expect(win.getByTestId('ctx-delete')).toContainText('Delete 2 items')

    await win.keyboard.press('Escape')
    await win.getByTestId('charm-arrange').click()
    await win.getByTestId('align-left').click()
    // The ruled charm verb really ran: equal-sized pins align-left.
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

/** The scene's decorations via the debug seam (decorations.spec idiom). */
interface DecoLite {
  id: string
  locked: number
  hidden: number
  data: Record<string, unknown>
}
async function decorations(win: Page): Promise<DecoLite[]> {
  return win.evaluate(() => window.__ewDebug!.decorations() as unknown as DecoLite[])
}

test('decoration lock/hide via menu = ONE undo each; Dock style traffic stays out (AI-IMP-154)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-deco-undo-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const deco = await seedDecoration(win, { x: 600, y: 380 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 1)
    const locked = async (): Promise<number | undefined> =>
      (await decorations(win)).find((d) => d.id === deco.id)?.locked
    const hidden = async (): Promise<number | undefined> =>
      (await decorations(win)).find((d) => d.id === deco.id)?.hidden

    // Lock from the menu: one undo entry; Mod+Z restores unlocked.
    const d0 = await undoDepth(win)
    await win.mouse.click(box.x + deco.cx, box.y + deco.cy, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    await win.getByTestId('ctx-lock').click()
    await expect.poll(() => locked()).toBe(1)
    expect(await undoDepth(win)).toBe(d0 + 1)
    // Keyboard Mod+Z (board holds focus after the empty-canvas click).
    await win.mouse.click(box.x + 60, box.y + 60)
    await win.keyboard.press('Meta+z')
    await expect.poll(() => locked()).toBe(0)
    expect(await undoDepth(win)).toBe(d0)

    // Hide from the menu: one undo entry; undo brings it back.
    await win.mouse.click(box.x + deco.cx, box.y + deco.cy, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    await win.getByTestId('ctx-hide').click()
    await expect.poll(() => hidden()).toBe(1)
    expect(await undoDepth(win)).toBe(d0 + 1)
    await undoOnce(win)
    await expect.poll(() => hidden()).toBe(0)
    expect(await undoDepth(win)).toBe(d0)

    // Restyle is selection furniture and one captured undo gesture.
    await win.mouse.click(box.x + deco.cx, box.y + deco.cy)
    await win.getByTestId('charm-restyle').click()
    const width = win.getByTestId('restyle-panel').locator('label').filter({ hasText: 'width' }).locator('input')
    await width.fill('7')
    await win.keyboard.press('Tab')
    await expect
      .poll(async () => (await decorations(win)).find((d) => d.id === deco.id)?.data['strokeWidth'])
      .toBe(7.1)
    expect(await undoDepth(win)).toBe(d0 + 1)
    await undoOnce(win)
    expect(await undoDepth(win)).toBe(d0)
  } finally {
    await app.close()
  }
})

test('mixed-selection Lock all covers decorations too; ONE Mod+Z frees everything (AI-IMP-154)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-lockall-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const a = await seedPin(win, 'One', { x: 400, y: 300 })
    const b = await seedPin(win, 'Two', { x: 800, y: 300 })
    const deco = await seedDecoration(win, { x: 580, y: 320 })
    await win.waitForFunction(
      () =>
        window.__ewDebug!.sceneStats().placements === 2 &&
        window.__ewDebug!.sceneStats().decorations === 1,
    )

    // Marquee all three, then open the MULTI menu inside the selection.
    await win.mouse.move(box.x + 300, box.y + 120)
    await win.mouse.down()
    await win.mouse.move(box.x + 1050, box.y + 550, { steps: 5 })
    await win.mouse.up()
    await win.waitForFunction(() => window.__ewDebug!.selection().length === 3)
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('multi')

    // Lock all: placements AND the decoration lock, as ONE undo entry.
    const d0 = await undoDepth(win)
    await win.getByTestId('ctx-lock-all').click()
    const lockedStates = async (): Promise<Array<number | undefined>> => [
      (await placement(win, a.placementId))?.locked,
      (await placement(win, b.placementId))?.locked,
      (await decorations(win)).find((d) => d.id === deco.id)?.locked,
    ]
    await expect.poll(() => lockedStates()).toEqual([1, 1, 1])
    expect(await undoDepth(win)).toBe(d0 + 1)

    // One undo frees the WHOLE selection the verb advertised.
    await undoOnce(win)
    await expect.poll(() => lockedStates()).toEqual([0, 0, 0])
    expect(await undoDepth(win)).toBe(d0)
  } finally {
    await app.close()
  }
})

test('decoration-only multi: Gather disabled-with-reason, Lock all still works (AI-IMP-154)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-deco-multi-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    const d1 = await seedDecoration(win, { x: 420, y: 300 })
    const d2 = await seedDecoration(win, { x: 700, y: 320 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().decorations === 2)

    await win.mouse.move(box.x + 300, box.y + 150)
    await win.mouse.down()
    await win.mouse.move(box.x + 950, box.y + 520, { steps: 5 })
    await win.mouse.up()
    await win.waitForFunction(() => window.__ewDebug!.selection().length === 2)
    await win.mouse.click(box.x + d1.cx, box.y + d1.cy, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    expect(await win.getByTestId('context-menu').getAttribute('data-kind')).toBe('multi')

    // §4.9 frames capture placements only — no empty frame from an
    // enabled row: Gather is disabled-with-reason (§8.2 grammar).
    await expect(win.getByTestId('ctx-gather-into-frame')).toHaveAttribute('aria-disabled', 'true')

    // Lock all remains actionable and locks both decorations as one entry.
    const d0 = await undoDepth(win)
    await win.getByTestId('ctx-lock-all').click()
    const lockedPair = async (): Promise<Array<number | undefined>> => {
      const ds = await decorations(win)
      return [ds.find((d) => d.id === d1.id)?.locked, ds.find((d) => d.id === d2.id)?.locked]
    }
    await expect.poll(() => lockedPair()).toEqual([1, 1])
    expect(await undoDepth(win)).toBe(d0 + 1)
    await undoOnce(win)
    await expect.poll(() => lockedPair()).toEqual([0, 0])
    expect(await undoDepth(win)).toBe(d0)
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

/**
 * AI-IMP-167 (RFC §8.2 rev 0.64, decision 06): the universal menu
 * CASCADE. On open, rows fade in staggered top-to-bottom — OPACITY ONLY
 * (the chrome rule), inside the ≤190ms budget, and interactive
 * throughout. A reopen replays a fresh animation (render mounts new DOM).
 * Intermediate opacities are deliberately NOT asserted (flake bait); the
 * budget-landing and the animation's presence are.
 */
test('menu cascade: rows fade in on open, opacity-only, replay on reopen (§8.2)', async () => {
  const { app, win } = await launchApp('ew-e2e-ctxmenu-cascade-')
  try {
    await readyUndo(win)
    const box = (await win.getByTestId('canvas-host').boundingBox())!
    await seedPin(win, 'Cascade', { x: 400, y: 300 })
    await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

    // Open the item menu.
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()

    // The last row (enabled Delete) carries the shared cascade class and
    // a staggered --row-index — the grammar is wired.
    const del = win.getByTestId('ctx-delete')
    await expect(del).toHaveClass(/ew-menu-cascade-row/)
    expect(await del.evaluate((el) => el.style.getPropertyValue('--row-index'))).not.toBe('')

    // Opacity ONLY: the fade never touches pointer-events or visibility,
    // so the row is hit-testable the instant the menu opens.
    expect(await del.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none')
    expect(await del.evaluate((el) => getComputedStyle(el).visibility)).not.toBe('hidden')

    // The cascade LANDS at full opacity. Asserted by driving the
    // animation to its end state rather than waiting wall-clock:
    // Linux CI runs the suite hidden under xvfb, where the never-shown
    // window never composites and the CSS animation timeline does not
    // advance — the row pins at its from-frame forever and a timed poll
    // times out (first-ever CI run of this spec was red 3×/4 runs).
    // finish() is a no-op when the timeline already ran (macOS local),
    // so the same assertion attests real advancement there. Motion
    // TIMING is a local hardware gate, like the perf suite.
    await del.evaluate((el) =>
      Promise.all(
        el.getAnimations().map((a) => {
          a.finish()
          return a.finished
        }),
      ),
    )
    expect(Number(await del.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)

    // Close, reopen → a FRESH cascade runs again (render mounts new DOM
    // each open, so the row re-animates from 0).
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('context-menu')).toHaveCount(0)
    await win.mouse.click(box.x + 400, box.y + 300, { button: 'right' })
    await expect(win.getByTestId('context-menu')).toBeVisible()
    const del2 = win.getByTestId('ctx-delete')
    // An animation is applied to the fresh row (replayed open).
    expect(await del2.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0)
    // Same landing-state assertion as above (CI's hidden xvfb windows
    // never advance the animation timeline).
    await del2.evaluate((el) =>
      Promise.all(
        el.getAnimations().map((a) => {
          a.finish()
          return a.finished
        }),
      ),
    )
    expect(Number(await del2.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
  } finally {
    await app.close()
  }
})
