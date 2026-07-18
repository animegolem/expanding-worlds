import { expect, test } from '@playwright/test'
import { exec, launchApp, launchAppInDir } from './helpers'

/**
 * AI-IMP-060 acceptance (RFC §8.1): the session history is the path —
 * entry route, never ancestry. Flights go through navigateTo (the
 * __ewNav hook stands in for the dive UI until AI-IMP-063), Back and
 * Forward restore viewports, stale targets skip and collapse, and ⌂
 * returns to the protected root canvas.
 */

async function seedCanvas(win: import('@playwright/test').Page): Promise<string> {
  const nodeId = crypto.randomUUID()
  const canvasId = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId })
  await exec(win, 'CreateCanvas', { canvasId, nodeId })
  return canvasId
}

test('path, back/forward, viewport restore, home (§17 item 12)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  // A distinctive viewport on the root, to be restored by Back.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 137, y: 59, zoom: 2 }))

  // Fly Home → B → C through the one true flight path.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  // The path renders the back-stack with the current entry last.
  await expect(win.getByTestId('nav-crumb-0')).toHaveText('Home')
  await expect(win.getByTestId('nav-crumb-1')).toHaveText('Harbor')
  await expect(win.getByTestId('nav-crumb-2')).toHaveText('Keep')

  // Back twice via the keyboard: to B, then to the root with its
  // viewport as the user left it.
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({ x: 137, y: 59, zoom: 2 })

  // Forward stack intact: two entries ahead.
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  // A NEW navigation clears the forward stack (§8.1).
  const canvasD = await seedCanvas(win)
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Delta'), { id: canvasD })
  expect(await win.evaluate(() => window.__ewNav!.entries().length)).toBe(3) // Home, Harbor, Delta
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasD)

  // Crumb click returns to that entry.
  await win.getByTestId('nav-crumb-0').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // ⌂ is itself a navigation event: a NEW entry, not a rewind.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // AI-IMP-306: at both supported frame widths, the invisible arrows
  // reserve no resident width and own no phantom hits. Revealing them
  // is opacity-only: Home and the first route crumb remain byte-still.
  for (const width of [960, 1280]) {
    await app.evaluate(({ BrowserWindow }, nextWidth) => {
      BrowserWindow.getAllWindows()[0]?.setSize(nextWidth, 800)
    }, width)
    await win.mouse.move(width - 80, 400)

    const rest = await win.evaluate(() => {
      const rect = (testId: string): DOMRect =>
        document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.getBoundingClientRect()
      const plain = (value: DOMRect) => ({
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
      })
      const homeRect = rect('nav-home')
      const crumbRect = rect('nav-crumb-0')
      const arrowRects = [rect('nav-back'), rect('nav-forward')]
      const arrowOwnsHit = arrowRects.map((arrowRect) =>
        document
          .elementsFromPoint(
            arrowRect.left + arrowRect.width / 2,
            arrowRect.top + arrowRect.height / 2,
          )
          .some((element) =>
            ['nav-back', 'nav-forward'].includes(element.getAttribute('data-testid') ?? ''),
          ),
      )
      return {
        home: plain(homeRect),
        crumb: plain(crumbRect),
        residentGap: crumbRect.left - homeRect.right,
        ruledGap: Number.parseFloat(getComputedStyle(document.querySelector('.path-bar')!).gap),
        arrowOwnsHit,
      }
    })
    // Blink resolves layout to 1/64 CSS-pixel units, so the rendered rem gap
    // may sit one quantum either side of the computed-style decimal.
    expect(Math.abs(rest.residentGap - rest.ruledGap)).toBeLessThanOrEqual(1 / 64)
    expect(rest.arrowOwnsHit).toEqual([false, false])

    await win.getByTestId('path-bar').hover()
    await expect(win.getByTestId('nav-arrows')).toHaveCSS('opacity', '1')
    const revealedCrumb = await win.getByTestId('nav-crumb-0').evaluate((element) => {
      const value = element.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
      }
    })
    expect(revealedCrumb).toEqual(rest.crumb)
  }

  // The revealed ‹ › affordances still act: Back returns to where ⌂
  // was pressed, Forward to the root again.
  await win.getByTestId('path-bar').hover()
  await win.getByTestId('nav-back').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.getByTestId('nav-forward').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  await app.close()
})

test('racing two navigations never persists the wrong board’s camera (§8.1, AI-IMP-176 M-01)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-race-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasA = await seedCanvas(win)
  const canvasB = await seedCanvas(win)

  // Give A and B distinct SAVED cameras (persisted to the DB): fly to
  // each, set a camera, wait out the 500 ms camera-persist debounce.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Alpha'), { id: canvasA })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasA)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 111, y: 222, zoom: 3 }))
  await win.waitForTimeout(700)

  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Beta'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 777, y: 888, zoom: 4 }))
  await win.waitForTimeout(700)

  // Home, so A and B are only reachable via a fresh openCanvas.
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // THE RACE: request A and B within the same tick. B is the latest
  // intent and must win; A's post-await camera write must be abandoned
  // (no A coordinates leaking onto B).
  await win.evaluate(
    ({ a, b }) => {
      const p1 = window.__ewNav!.navigateTo(a, 'Alpha')
      const p2 = window.__ewNav!.navigateTo(b, 'Beta')
      return Promise.all([p1, p2])
    },
    { a: canvasA, b: canvasB },
  )
  await win.evaluate(() => window.__ewNav!.entries()) // settle the microtask tail
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  // B renders with B's viewport, never A's.
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({ x: 777, y: 888, zoom: 4 })

  // Let the camera-persist debounce fire, then reopen B from scratch:
  // A's coordinates were never written onto B's saved camera.
  await win.waitForTimeout(700)
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Beta'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({ x: 777, y: 888, zoom: 4 })

  await app.close()
})

test('held-key back is one nav per press and never deletes Home (§8.1, AI-IMP-176 M-08)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-keyrepeat-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  // Trash the middle entry so a Back from C hits the dead-candidate
  // collapse branch — the branch that spliced Home under key-repeat.
  await exec(win, 'TrashCanvas', { canvasId: canvasB })

  // Hold Mod+[: the OS emits synthetic key-repeat keydowns. A burst of
  // them must do NOTHING — one navigation per PHYSICAL press only.
  await win.evaluate(() => {
    for (let i = 0; i < 12; i++) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '[',
          code: 'BracketLeft',
          metaKey: true,
          ctrlKey: true,
          repeat: true,
          bubbles: true,
        }),
      )
    }
  })
  // Still on C; the Home entry is untouched at index 0.
  expect(await win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)
  expect(await win.evaluate(() => window.__ewNav!.entries()[0]!.label)).toBe('Home')

  // A genuine (non-repeat) press navigates once: skips trashed Harbor,
  // lands on the root — and does NOT splice Home.
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  expect(await win.evaluate(() => window.__ewNav!.entries().map((e) => e.label))).toEqual([
    'Home',
    'Keep',
  ])

  // Home still works for the rest of the session.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  await app.close()
})

test('stale targets skip and collapse; history survives trash (§8.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-nav-stale-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasC })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  // Trash B while standing on C: Back skips and collapses it.
  await exec(win, 'TrashCanvas', { canvasId: canvasB })
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  // The dead entry is gone from the stack; Keep remains ahead.
  expect(await win.evaluate(() => window.__ewNav!.entries().map((e) => e.label))).toEqual([
    'Home',
    'Keep',
  ])
  await win.keyboard.press('ControlOrMeta+BracketRight')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasC)

  await app.close()
})

/**
 * AI-IMP-061 (RFC §8.1): the map-pin menu does everything — add,
 * jump, drag-reorder, remove — row order IS the Mod+1–n binding and
 * each row prints its current shortcut. Bookmark jumps are navigation
 * events (Back returns), capture viewports, and the order is durable.
 */

async function openBookmarkMenu(win: import('@playwright/test').Page): Promise<void> {
  const menu = win.getByTestId('bookmark-menu')
  // isVisible() is non-waiting: it reports the current DOM immediately. A
  // menu fading closed (the §8.2 rev 0.64 unpin fade, AI-IMP-166) lingers at
  // opacity 0 for ~120ms and still counts as "visible" — so when the menu is
  // present, distinguish a genuine open from that closing ghost and wait the
  // ghost out before reopening cleanly.
  if (await menu.isVisible().catch(() => false)) {
    if ((await menu.getAttribute('data-closing')) === 'true') {
      await expect(menu).toBeHidden()
    } else {
      return
    }
  }
  // Clicking the pin plays the one-shot bookmark BEAT before the menu
  // sweeps in; toBeVisible waits out the beat.
  await win.getByTestId('bookmark-pin').click()
  await expect(menu).toBeVisible()
}

test('bookmarks: add, jump with viewport, reorder rebinds Mod+n, order survives restart (§8.1)', async () => {
  const launched = await launchApp('ew-e2e-bookmarks-')
  const { projectDir } = launched
  let { app, win } = launched
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)

  // Bookmark the root under a distinctive viewport.
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 500, y: 250, zoom: 2 }))
  await openBookmarkMenu(win)
  await win.getByTestId('bookmark-add').click()
  await expect(win.getByTestId('bookmark-jump-0')).toHaveText('Home')
  await expect(win.getByTestId('bookmark-shortcut-0')).toHaveText('⌘1')

  // Fly to B and bookmark it too: rows print ⌘1 Home, ⌘2 Harbor.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Harbor'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await openBookmarkMenu(win)
  await win.getByTestId('bookmark-add').click()
  await expect(win.getByTestId('bookmark-jump-1')).toHaveText('Harbor')
  await expect(win.getByTestId('bookmark-shortcut-1')).toHaveText('⌘2')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('bookmark-menu')).not.toBeVisible()

  // Mod+1 jumps home, restores the bookmarked viewport, and is a
  // §8.1 history entry: Back returns to Harbor.
  await win.keyboard.press('ControlOrMeta+Digit1')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({ x: 500, y: 250, zoom: 2 })
  await win.keyboard.press('ControlOrMeta+BracketLeft')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  // Drag Harbor's row above Home's: row order is the binding, so the
  // printed shortcuts swap with it (self-teaching, live).
  await openBookmarkMenu(win)
  const from = (await win.getByTestId('bookmark-drag-1').boundingBox())!
  const to = (await win.getByTestId('bookmark-drag-0').boundingBox())!
  await win.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await win.mouse.down()
  await win.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 })
  await win.mouse.up()
  await expect(win.getByTestId('bookmark-jump-0')).toHaveText('Harbor')
  await expect(win.getByTestId('bookmark-shortcut-0')).toHaveText('⌘1')
  await expect(win.getByTestId('bookmark-jump-1')).toHaveText('Home')
  await expect(win.getByTestId('bookmark-shortcut-1')).toHaveText('⌘2')
  await win.keyboard.press('Escape')

  // Mod+1 now jumps to Harbor; Mod+2 to Home (press-time row order).
  await win.keyboard.press('ControlOrMeta+Digit2')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)
  await win.keyboard.press('ControlOrMeta+Digit1')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  // Durable: the reordered menu (and its bindings) survive restart.
  await app.close()
  ;({ app, win } = await launchAppInDir(projectDir))
  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-jump-0')).toHaveText('Harbor')
  await expect(win.getByTestId('bookmark-jump-1')).toHaveText('Home')
  await win.keyboard.press('Escape')
  await win.keyboard.press('ControlOrMeta+Digit1')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)

  await app.close()
})

test('signature pin: beat plays once and reseats, menu cascades with globes, close is a plain fade (§8.2 rev 0.64, AI-IMP-166)', async () => {
  const { app, win } = await launchApp('ew-e2e-pin-beat-')

  const glyph = win.getByTestId('bookmark-pin-glyph')
  // The pin's resting box BEFORE any beat — the reseat target.
  const before = (await glyph.boundingBox())!

  // Click the pin: the one-shot BEAT rides the glyph, then ENDS (the class
  // is removed exactly once) — after which the menu sweeps in.
  await win.getByTestId('bookmark-pin').click()
  await expect
    .poll(() => glyph.evaluate((el) => el.classList.contains('ew-pin-beat')))
    .toBe(true)
  await expect
    .poll(() => glyph.evaluate((el) => el.classList.contains('ew-pin-beat')))
    .toBe(false)
  await expect(win.getByTestId('bookmark-menu')).toBeVisible()

  // The pin reseats at its EXACT pre-beat box — no drift after the settle.
  const round = (b: { x: number; y: number; width: number; height: number }) => ({
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.width),
    h: Math.round(b.height),
  })
  await expect
    .poll(async () => round((await glyph.boundingBox())!))
    .toEqual(round(before))

  // Bookmark this board so a row exists; the row wears a GLOBE (decision 07).
  await win.getByTestId('bookmark-add').click()
  await expect(win.getByTestId('bookmark-globe-0')).toBeVisible()

  // Close: a plain fade — the beat NEVER replays on close.
  await win.keyboard.press('Escape')
  expect(await glyph.evaluate((el) => el.classList.contains('ew-pin-beat'))).toBe(false)
  await expect(win.getByTestId('bookmark-menu')).toBeHidden()

  // Reopen: the beat REPLAYS (one-shot again) — ceremony is for arrival.
  await win.getByTestId('bookmark-pin').click()
  await expect
    .poll(() => glyph.evaluate((el) => el.classList.contains('ew-pin-beat')))
    .toBe(true)
  await expect
    .poll(() => glyph.evaluate((el) => el.classList.contains('ew-pin-beat')))
    .toBe(false)
  await expect(win.getByTestId('bookmark-menu')).toBeVisible()

  await app.close()
})

test('Mod+D bookmarks the current board — the menu ＋ row’s twin (§8.1, AI-IMP-117)', async () => {
  const { app, win } = await launchApp('ew-e2e-bookmark-modd-')

  // Give the board a distinctive viewport, then bookmark with the
  // keyboard alone — no menu opened. Mod+D dispatches the SAME
  // CreateBookmark path as the ＋ row (bookmarks.bookmarkCurrentBoard).
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 321, y: 654, zoom: 1.5 }))
  await win.keyboard.press('ControlOrMeta+d')

  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-jump-0')).toHaveText('Home')
  await expect(win.getByTestId('bookmark-shortcut-0')).toHaveText('⌘1')
  // The captured viewport rides along, proving it went through the
  // shared path (label = leaf crumb, viewport = live camera).
  await win.keyboard.press('Escape')
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  await win.keyboard.press('ControlOrMeta+Digit1')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.camera()))
    .toEqual({ x: 321, y: 654, zoom: 1.5 })

  await app.close()
})

test('migrated shortcuts still fire: Mod+K opens search post-registry (§8.3, AI-IMP-117)', async () => {
  const { app, win } = await launchApp('ew-e2e-modp-migrated-')
  // The search binding now resolves through matches(event,'quick-open');
  // it must still summon the search panel in quick mode.
  await win.keyboard.press('ControlOrMeta+k')
  const panel = win.getByTestId('search-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-mode', 'quick')
  await app.close()
})

test('bookmarks degrade explicitly: In Trash greys with Restore, purged offers removal (§8.1)', async () => {
  const { app, win } = await launchApp('ew-e2e-bookmarks-stale-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  const canvasB = await seedCanvas(win)
  const canvasC = await seedCanvas(win)

  // Bookmark B ('Keep') and C ('Ruin') from their own boards.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Keep'), { id: canvasB })
  await openBookmarkMenu(win)
  await win.getByTestId('bookmark-add').click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('bookmark-menu')).toBeHidden()
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Ruin'), { id: canvasC })
  await openBookmarkMenu(win)
  await win.getByTestId('bookmark-add').click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('bookmark-menu')).toBeHidden()
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  await exec(win, 'TrashCanvas', { canvasId: canvasB })
  await exec(win, 'TrashCanvas', { canvasId: canvasC })
  await exec(win, 'PurgeRecord', { kind: 'canvas', id: canvasC })

  // Neither row silently vanishes: trashed greys with an In Trash
  // label and a dead jump; purged is broken and offers removal.
  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-row-0')).toHaveAttribute('data-target-state', 'trashed')
  await expect(win.getByTestId('bookmark-state-0')).toHaveText('In Trash')
  await expect(win.getByTestId('bookmark-jump-0')).toBeDisabled()
  await expect(win.getByTestId('bookmark-row-1')).toHaveAttribute('data-target-state', 'purged')
  await expect(win.getByTestId('bookmark-state-1')).toHaveText('Broken')

  // The trashed row's shortcut never jumps.
  await win.keyboard.press('ControlOrMeta+Digit1')
  await win.waitForTimeout(150)
  expect(await win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // Restore restores the canvas AND jumps; the bookmark revalidated
  // with no user action (stable ids).
  await win.getByTestId('bookmark-restore-0').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-row-0')).toHaveAttribute('data-target-state', 'active')

  // Removing the broken bookmark is the offered exit.
  await win.getByTestId('bookmark-remove-1').click()
  await expect(win.getByTestId('bookmark-row-1')).not.toBeVisible()
  await expect(win.getByTestId('bookmark-jump-0')).toHaveText('Keep')

  await app.close()
})

test('bookmark to a board whose OWNER node is trashed degrades and Restore revives the node (§9.6)', async () => {
  const { app, win } = await launchApp('ew-e2e-bookmark-trashed-owner-')
  const root = await win.evaluate(() => window.__ewDebug!.canvasId())
  // A board B owned by an ordinary node — the node is the aggregate
  // root Restore must revive (§9.6), not the canvas row.
  const nodeB = crypto.randomUUID()
  const canvasB = crypto.randomUUID()
  await exec(win, 'CreateNode', { nodeId: nodeB })
  await exec(win, 'CreateCanvas', { canvasId: canvasB, nodeId: nodeB })

  // Bookmark B from its own board, then return home.
  await win.evaluate(({ id }) => window.__ewNav!.navigateTo(id, 'Owned'), { id: canvasB })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await openBookmarkMenu(win)
  await win.getByTestId('bookmark-add').click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('bookmark-menu')).toBeHidden()
  await win.getByTestId('nav-home').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // §9.6: trashing the OWNER node (the canvas row stays active)
  // degrades the bookmark exactly like a directly-trashed board.
  await exec(win, 'TrashNode', { nodeId: nodeB })
  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-row-0')).toHaveAttribute('data-target-state', 'trashed')
  await expect(win.getByTestId('bookmark-state-0')).toHaveText('In Trash')
  await expect(win.getByTestId('bookmark-jump-0')).toBeDisabled()

  // The trashed row's shortcut never opens the board.
  await win.keyboard.press('ControlOrMeta+Digit1')
  await win.waitForTimeout(150)
  expect(await win.evaluate(() => window.__ewDebug!.canvasId())).toBe(root)

  // Restore revives the NODE aggregate (not a canvas restore, which
  // could not un-trash the owner) and jumps; stable ids revalidate
  // the bookmark with no bookmark write (§8.1).
  await win.getByTestId('bookmark-restore-0').click()
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.canvasId())).toBe(canvasB)
  await openBookmarkMenu(win)
  await expect(win.getByTestId('bookmark-row-0')).toHaveAttribute('data-target-state', 'active')

  await app.close()
})
