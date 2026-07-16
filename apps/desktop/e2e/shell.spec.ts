import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import { launchApp, openAppMenu, revealTitleStrip, seedPlacedNote } from './helpers'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-006 acceptance: renderer → preload → main → utility process
 * round-trip, sandboxed renderer, correct window title.
 * AI-IMP-007 acceptance: Svelte shell regions render; the ping seam
 * is asserted directly (the interim status strip retired with the
 * §8.6 toasts + perch, AI-IMP-066).
 * AI-IMP-010 acceptance: the Project API executes a real command
 * against a real project with revision, conflict, and event flow.
 */

test('shell launches and the Project API round-trips', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-project-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()

  await expect(win).toHaveTitle('Expanding Worlds')

  const response = await win.evaluate(() => window.ew.project.ping())
  expect(response).toEqual({ pong: true, from: 'utility' })

  // Sandbox: no node globals leak into the page context.
  const requireType = await win.evaluate(
    () => typeof (window as unknown as Record<string, unknown>)['require'],
  )
  expect(requireType).toBe('undefined')

  // The window is the board (§8.2): no docked note pane exists — a
  // note panel appears only when a note opens (AI-IMP-064) — and the
  // status strip retired with the §8.6 toasts + perch (AI-IMP-066):
  // no persistent status chrome, no perch slot without a condition.
  await expect(win.getByTestId('note-pane')).toHaveCount(0)
  await expect(win.getByTestId('workspace')).toBeVisible()
  await expect(win.getByTestId('status-strip')).toHaveCount(0)
  await expect(win.getByTestId('service-status')).toHaveCount(0)
  await expect(win.getByTestId('perch')).toHaveCount(0)

  // AI-IMP-010: execute CreateNode end to end and observe revision,
  // query visibility, the pushed project-changed event, and a stale
  // -revision conflict.
  const outcome = await win.evaluate(async () => {
    const events: unknown[] = []
    window.ew.project.onChanged((event) => events.push(event))

    const projectQuery = await window.ew.project.query('getProject')
    if (!projectQuery.ok) throw new Error(`getProject failed: ${projectQuery.message}`)
    const project = projectQuery.result as { id: string; revision: number }

    const nodeId = crypto.randomUUID()
    const executed = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: project.id,
      commandType: 'CreateNode',
      commandVersion: 1,
      expectedProjectRevision: project.revision,
      issuedAt: new Date().toISOString(),
      payload: { nodeId },
    })

    const stale = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: project.id,
      commandType: 'CreateNode',
      commandVersion: 1,
      expectedProjectRevision: project.revision,
      issuedAt: new Date().toISOString(),
      payload: { nodeId: crypto.randomUUID() },
    })

    const nodesQuery = await window.ew.project.query('listNodes')
    const nodeIds = nodesQuery.ok
      ? (nodesQuery.result as Array<{ id: string }>).map((n) => n.id)
      : []

    // The event is pushed utility → main → renderer; give it a beat.
    const deadline = Date.now() + 2_000
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    return { executed, stale, nodeIds, nodeId, events }
  })

  expect(outcome.executed).toMatchObject({ status: 'committed', revision: 1 })
  expect(outcome.stale).toMatchObject({ status: 'conflict', actualRevision: 1 })
  expect(outcome.nodeIds).toContain(outcome.nodeId)
  expect(outcome.events.length).toBeGreaterThanOrEqual(1)
  expect(outcome.events[0]).toMatchObject({
    type: 'project-changed',
    revision: 1,
    commandType: 'CreateNode',
  })

  await app.close()
})

/**
 * AI-IMP-059 acceptance: the floating chrome frame (RFC §8.2) — charm
 * rail, dock, hover title strip — and the engagement cadence: the
 * whole layer fades on ONE clock and never reflows the canvas.
 */
test('floating chrome: rail, dock, title strip, engagement cadence', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-chrome-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await expect(win.getByTestId('canvas-host')).toBeVisible()

  // AI-IMP-293: the rail is exactly the four ways-of-seeing doors;
  // project and menu have moved to their scoped homes.
  await expect(win.getByTestId('charm-rail')).toBeVisible()
  await expect(win.getByTestId('dock')).toBeVisible()
  const railOrder = await win.getByTestId('charm-rail').evaluate((rail) =>
    Array.from(rail.querySelectorAll(':scope > [data-testid^="charm-"]')).map(
      (el) => (el as HTMLElement).dataset['testid'],
    ),
  )
  expect(railOrder).toEqual(['charm-gallery', 'charm-outline', 'charm-graph', 'charm-search'])
  for (const id of ['graph']) {
    await expect(win.getByTestId(`charm-${id}`)).toHaveAttribute('aria-disabled', 'true')
  }
  for (const id of ['search', 'outline', 'gallery']) {
    await expect(win.getByTestId(`charm-${id}`)).not.toHaveAttribute('aria-disabled', 'true')
  }
  await expect(win.getByTestId('charm-project')).toHaveCount(0)
  await expect(win.getByTestId('charm-menu')).toBeVisible()
  // AI-IMP-301: keep one real placement beneath the dismissal gestures.
  // Pixi renders it into the canvas at this world/screen point on the
  // default camera, so a leaked click would select/draw against it.
  await seedPlacedNote(win, 'Dismissal guard', 'stays put', { x: 20, y: 200 })
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements)).toBe(1)
  await win.getByTestId('canvas-host').click({ position: { x: 20, y: 200 } })
  await win.keyboard.press('ControlOrMeta+a')
  await expect.poll(() => win.evaluate(() => window.__ewDebug!.selection().length)).toBe(1)
  // Tool modes and the zoom cluster live in the dock.
  await expect(win.getByTestId('tool-select')).toBeVisible()
  await expect(win.getByTestId('dock-shape')).toBeVisible()
  await expect(win.getByTestId('zoom-pct')).toHaveText('100%')
  await win.getByTestId('zoom-in').click()
  await expect(win.getByTestId('zoom-pct')).toHaveText('125%')
  await win.getByTestId('zoom-out').click()
  await expect(win.getByTestId('zoom-pct')).toHaveText('100%')

  // The shape slot quick-arms its remembered face; a re-press or hold
  // opens the kit flyout, whose exits never change that face.
  await expect(win.getByTestId('tool-rect')).toHaveCount(0)
  await win.getByTestId('dock-shape').click()
  await expect(win.getByTestId('dock-shape')).toHaveClass(/active/)
  await expect(win.getByTestId('tool-rect')).toHaveCount(0)
  await win.getByTestId('dock-shape').click()
  await expect(win.getByTestId('tool-rect')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('tool-rect')).toHaveCount(0)

  const shapeBox = (await win.getByTestId('dock-shape').boundingBox())!
  await win.mouse.move(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2)
  await win.mouse.down()
  await win.waitForTimeout(320)
  await expect(win.getByTestId('shape-flyout')).toBeVisible()
  await expect(win.getByTestId('shape-flyout')).toContainText('Shapes')
  const ellipseBox = (await win.getByTestId('tool-ellipse').boundingBox())!
  await win.mouse.move(ellipseBox.x + ellipseBox.width / 2, ellipseBox.y + ellipseBox.height / 2)
  await win.mouse.up()
  await expect(win.getByTestId('tool-ellipse')).toHaveCount(0) // flyout closed
  await expect(win.getByTestId('dock-shape')).toHaveText('◯')

  await win.getByTestId('dock-shape').click() // armed re-press
  await expect(win.getByTestId('shape-flyout')).toBeVisible()
  await expect(win.getByTestId('dock-shape')).toHaveAttribute('data-flyout-open', 'true')
  // Re-press while already open is deliberately idempotent-open, not a
  // toggle-close. Only an explicit exit (outside/Escape/pick) dismisses.
  await win.getByTestId('dock-shape').click()
  await expect(win.getByTestId('shape-flyout')).toBeVisible()
  await expect(win.getByTestId('dock-shape')).toHaveAttribute('data-flyout-open', 'true')
  const flyoutBoard = await win.evaluate(() => ({
    scene: window.__ewDebug!.sceneStats(),
    selection: window.__ewDebug!.selection(),
    camera: window.__ewDebug!.camera(),
    activeTool: window.__ewDebug!.activeTool(),
    decorations: window.__ewDebug!.decorations(),
  }))
  await win.mouse.click(20, 200)
  await expect(win.getByTestId('shape-flyout')).toHaveCount(0)
  await expect(win.getByTestId('dock-shape')).toHaveText('◯')
  // The complete down/up/click sequence was a dismissal only: it did not
  // draw with the armed ellipse tool or clear the placement selection.
  expect(await win.evaluate(() => ({
    scene: window.__ewDebug!.sceneStats(),
    selection: window.__ewDebug!.selection(),
    camera: window.__ewDebug!.camera(),
    activeTool: window.__ewDebug!.activeTool(),
    decorations: window.__ewDebug!.decorations(),
  }))).toEqual(flyoutBoard)
  await win.getByTestId('tool-select').click()

  // Tool shortcuts: the GUI is the tutorial for the keyboard app.
  await win.getByTestId('canvas-host').click({ position: { x: 400, y: 400 } })
  await win.keyboard.press('t')
  await expect(win.getByTestId('tool-text')).toHaveClass(/active/)
  // AI-IMP-289: an armed tool grows exactly one kit-defaults row,
  // advertises the reservation-band growth, and contains no retired
  // native select/color/number controls.
  const defaults = win.getByTestId('tool-defaults')
  await expect(defaults).toHaveAttribute('data-defaults-tool', 'text')
  await expect(win.getByTestId('dock')).toHaveAttribute('data-dock-expanded', 'true')
  await expect.poll(() => win.evaluate(() => document.documentElement.dataset['dockExpanded'])).toBe('true')
  await expect(defaults.locator('select,input[type="color"],input[type="number"]')).toHaveCount(0)
  await win.getByTestId('default-font').click()
  await expect(win.getByTestId('default-font-list').getByRole('option')).toHaveCount(3)
  await win.getByTestId('default-font-list').getByRole('option', { name: 'Serif' }).click()
  await expect(win.getByTestId('default-font')).toContainText('Serif')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)
  await expect(defaults).toHaveCount(0)
  await expect.poll(() => win.evaluate(() => document.documentElement.dataset['dockExpanded'] ?? null)).toBeNull()

  const eyeDropperPresent = await win.evaluate(
    () => typeof (window as Window & { EyeDropper?: unknown }).EyeDropper === 'function',
  )
  await expect(win.getByTestId('tool-eyedropper')).toHaveAttribute('aria-disabled', String(!eyeDropperPresent))

  await win.keyboard.press('t')
  await win.keyboard.press('v')
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)

  // Title strip: hidden at rest, revealed at the top edge.
  await expect(win.getByTestId('title-strip')).toHaveCount(0)
  // AI-IMP-209 (CI catch): arm a MutationObserver BEFORE the reveal to
  // capture the strip's opacity at the instant it mounts — in:fade
  // applies its 0-opacity start state synchronously on insertion, so
  // this reads < 1 regardless of how slowly the runner draws frames.
  // The old fixed-90ms mid-fade sample raced the 220ms tween on the
  // Linux runner (both samples read the same value): wall-clock
  // sampling of a tween is never deterministic.
  await win.evaluate(() => {
    ;(window as unknown as { __stripMountOpacity: number | null }).__stripMountOpacity = null
    const observer = new MutationObserver(() => {
      const el = document.querySelector('[data-testid="title-strip"]') as HTMLElement | null
      if (!el) return
      ;(window as unknown as { __stripMountOpacity: number | null }).__stripMountOpacity = Number(
        getComputedStyle(el).opacity,
      )
      observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await revealTitleStrip(win)

  // §8.2 frameless shell: the revealed strip IS the window drag handle.
  await expect(win.getByTestId('title-strip')).toHaveAttribute('data-drag-region', 'drag')
  await expect
    .poll(() =>
      win.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('[data-testid="title-strip"]')!,
          ).getPropertyValue('-webkit-app-region'),
      ),
    )
    .toBe('drag')

  // AI-IMP-191 (§8.2 decision-01): the hover reveal is a smoky
  // near-black gradient that genuinely RISES (a fade, not a hard pop):
  // it mounted at less-than-full opacity (captured by the observer
  // above, race-free) and settles fully opaque.
  const mountOpacity = await win.evaluate(
    () => (window as unknown as { __stripMountOpacity: number | null }).__stripMountOpacity,
  )
  expect(mountOpacity).not.toBeNull()
  expect(mountOpacity!).toBeLessThan(1)
  await expect
    .poll(() =>
      win.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="title-strip"]')!).opacity,
      ),
    )
    .toBe('1')

  // AI-IMP-191: decision-01 drops the pill — the path/board-name reads
  // as bare text at the traffic-light corner (no chip behind it).
  await expect
    .poll(() =>
      win.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="path-bar"]')!).backgroundColor,
      ),
    )
    .toBe('rgba(0, 0, 0, 0)')

  // Engagement cadence: one shared clock fades the WHOLE layer; the
  // canvas never reflows. Driven via the deterministic test event —
  // hidden windows have no OS cursor to enter or leave.
  const canvasBefore = (await win.getByTestId('canvas-host').boundingBox())!
  await win.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: false } }),
    ),
  )
  await expect(win.getByTestId('chrome-layer')).toHaveAttribute('data-engaged', 'false')
  await expect
    .poll(() =>
      win.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="chrome-layer"]')!).opacity,
      ),
    )
    .toBe('0')
  const canvasAfter = (await win.getByTestId('canvas-host').boundingBox())!
  expect(canvasAfter).toEqual(canvasBefore)
  await win.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: true } }),
    ),
  )
  await expect(win.getByTestId('chrome-layer')).toHaveAttribute('data-engaged', 'true')

  // Tooltip rule: hovering a control names it and prints its shortcut.
  await win.getByTestId('tool-select').hover()
  await expect(win.getByTestId('tooltip-chip')).toBeVisible()
  await expect(win.getByTestId('tooltip-chip')).toContainText('Select')
  await expect(win.getByTestId('tooltip-chip')).toContainText('V')

  await app.close()
})

/**
 * AI-IMP-068 acceptance: the takeover framework (RFC §8.2) — rail
 * charm entry, Esc/charm return, camera untouched, board input dead
 * underneath, chrome fade suspended while a takeover is open.
 */
test('takeover framework: charm entry, Esc return, camera and board untouched', async () => {
  const { app, win } = await launchApp('ew-e2e-takeover-')

  // A placed pin and a deliberate camera so the round trip has
  // something to disturb.
  await seedPlacedNote(win, 'Takeover Guard', 'body', { x: 100, y: 100 })
  await win.evaluate(() => window.__ewDebug!.setCamera({ x: 123, y: 45, zoom: 1.5 }))
  await win.getByTestId('canvas-host').click({ position: { x: 400, y: 400 } })
  await win.keyboard.press('ControlOrMeta+a')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.selection().length))
    .toBe(1)

  // Enter by charm; the charm reads active.
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  await expect(win.getByTestId('charm-outline')).toHaveAttribute('aria-pressed', 'true')

  // Chrome never fades under a takeover: the engagement clock holds.
  await win.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('ew-test-set-engagement', { detail: { engaged: false } }),
    ),
  )
  await expect(win.getByTestId('chrome-layer')).toHaveAttribute('data-engaged', 'true')

  // Board input is dead underneath: tool keys, delete, select-all.
  await win.keyboard.press('t')
  expect(await win.evaluate(() => window.__ewDebug!.activeTool())).toBe('select')
  await win.keyboard.press('Delete')
  await win.keyboard.press('ControlOrMeta+a')
  expect(await win.evaluate(() => window.__ewDebug!.selection().length)).toBe(1)
  expect(await win.evaluate(() => window.__ewDebug!.sceneStats().placements)).toBe(1)

  // Esc returns; the camera is exactly where it was.
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)
  await expect(win.getByTestId('charm-outline')).toHaveAttribute('aria-pressed', 'false')
  expect(await win.evaluate(() => window.__ewDebug!.camera())).toEqual({
    x: 123,
    y: 45,
    zoom: 1.5,
  })

  // The originating charm toggles: reopen, close by charm.
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toBeVisible()
  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('takeover-outline')).toHaveCount(0)

  // ☰ menu: Settings entry opens its takeover; opening a second kind
  // replaces the first implicitly through close-then-open.
  await openAppMenu(win)
  await expect(win.getByTestId('rail-menu')).toBeVisible()
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('rail-menu')).toHaveCount(0)
  await expect(win.getByTestId('takeover-settings')).toBeVisible()
  const takeoverBoard = await win.evaluate(() => ({
    scene: window.__ewDebug!.sceneStats(),
    selection: window.__ewDebug!.selection(),
    camera: window.__ewDebug!.camera(),
    activeTool: window.__ewDebug!.activeTool(),
    decorations: window.__ewDebug!.decorations(),
  }))
  const takeoverBox = (await win.getByTestId('takeover-settings').boundingBox())!
  const settingsBox = (await win.getByTestId('takeover-settings').locator('.sheet').boundingBox())!
  const dismissPoint = { x: takeoverBox.x + 4, y: takeoverBox.y + 4 }
  expect(dismissPoint.x).toBeLessThan(settingsBox.x)
  expect(dismissPoint.y).toBeLessThan(settingsBox.y)
  await win.mouse.click(dismissPoint.x, dismissPoint.y)
  await expect(win.getByTestId('takeover-settings')).toHaveCount(0)
  expect(await win.evaluate(() => ({
    scene: window.__ewDebug!.sceneStats(),
    selection: window.__ewDebug!.selection(),
    camera: window.__ewDebug!.camera(),
    activeTool: window.__ewDebug!.activeTool(),
    decorations: window.__ewDebug!.decorations(),
  }))).toEqual(takeoverBoard)

  // Board input lives again after return.
  await win.getByTestId('canvas-host').click({ position: { x: 400, y: 400 } })
  await win.keyboard.press('t')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.activeTool()))
    .toBe('text')

  await app.close()
})

/**
 * AI-IMP-110 acceptance: the ☰ menu carries the ratified §8.2 rev 0.45
 * inventory — Undo · Redo · Trash… · End Session · Settings · Help/About
 * (· Export) in that geography — disabled rows are aria-disabled and
 * inert, Undo/Redo print their shortcuts, Help/About shows the real
 * running version, and Settings still opens its takeover.
 */
test('☰ menu: ratified inventory, disabled rows inert, Help/About version', async () => {
  const { app, win } = await launchApp('ew-e2e-menu-')

  try {
    await openAppMenu(win)
    await expect(win.getByTestId('rail-menu')).toBeVisible()

    // The rows read top-to-bottom in the ratified geography.
    const order = ['menu-undo', 'menu-redo', 'menu-trash', 'menu-restore', 'menu-end-session', 'menu-switch-world', 'menu-settings', 'menu-help', 'menu-export']
    const domOrder = await win.getByTestId('rail-menu').evaluate((menu) =>
      Array.from(menu.querySelectorAll('[data-testid^="menu-"]')).map(
        (el) => (el as HTMLElement).dataset['testid'],
      ),
    )
    expect(domOrder).toEqual(order)

    // Switch world is live through the native chooser. Cancellation is
    // a clean close and never reaches the relaunch capability consumer.
    await app.evaluate(async ({ dialog }) => {
      const state = globalThis as { __ewSwitchChooserCalls?: number }
      state.__ewSwitchChooserCalls = 0
      dialog.showOpenDialog = async () => {
        state.__ewSwitchChooserCalls = (state.__ewSwitchChooserCalls ?? 0) + 1
        return { canceled: true, filePaths: [] }
      }
    })
    await win.getByTestId('menu-switch-world').click()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as { __ewSwitchChooserCalls?: number }).__ewSwitchChooserCalls ?? 0,
        ),
      )
      .toBe(1)
    await openAppMenu(win)

    // Undo/Redo print their shortcuts — self-teaching even while off.
    await expect(win.getByTestId('menu-undo')).toContainText('⌘Z')
    await expect(win.getByTestId('menu-redo')).toContainText('⇧⌘Z')

    // Every deferred row is aria-disabled and inert: clicking it must
    // neither close the menu nor open anything. (Trash… went live with
    // AI-IMP-102 and is asserted separately below.)
    for (const id of ['menu-undo', 'menu-redo', 'menu-end-session']) {
      await expect(win.getByTestId(id)).toHaveAttribute('aria-disabled', 'true')
      // force past actionability: even a real DOM click must do nothing.
      await win.getByTestId(id).click({ force: true })
      await expect(win.getByTestId('rail-menu')).toBeVisible()
      await expect(win.getByTestId('takeover-settings')).toHaveCount(0)
      await expect(win.getByTestId('help-about-dialog')).toHaveCount(0)
    }

    // Export is honest: it opens Settings at the live export control.
    await expect(win.getByTestId('menu-export')).not.toHaveAttribute('aria-disabled', 'true')
    await win.getByTestId('menu-export').click()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect(win.getByTestId('takeover-settings')).toBeVisible()
    await expect(win.getByTestId('settings-export-run')).toBeFocused()
    await win.keyboard.press('Escape')
    await openAppMenu(win)

    // Help/About opens a clamped dialog with a real semver version and
    // the repo address; Esc closes it, leaving the menu behind.
    await win.getByTestId('menu-help').click()
    await expect(win.getByTestId('help-about-dialog')).toBeVisible()
    await expect(win.getByTestId('help-about-version')).toContainText(/\d+\.\d+\.\d+/)
    // AI-IMP-137 ratified copy: the RFC rev prints live beside the
    // version (a build-time constant read from the RFC header, never
    // hand-copied), the product sentence carries copies-never-touches,
    // and the one shortcuts link is present.
    await expect(win.getByTestId('help-about-version')).toContainText(/RFC \d+\.\d+/)
    await expect(win.getByTestId('help-about-tagline')).toContainText('copied in, never touched')
    await expect(win.getByTestId('help-about-shortcuts')).toBeVisible()
    await expect(win.getByTestId('help-about-repo')).toContainText('github.com/animegolem/expanding-worlds')
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('help-about-dialog')).toHaveCount(0)

    // Settings stays live: it opens the §11.5 takeover and closes the menu.
    await expect(win.getByTestId('rail-menu')).toBeVisible()
    await win.getByTestId('menu-settings').click()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect(win.getByTestId('takeover-settings')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('takeover-settings')).toHaveCount(0)

    // Trash… went live with AI-IMP-102: enabled, and opens its takeover.
    await openAppMenu(win)
    await expect(win.getByTestId('menu-trash')).not.toHaveAttribute('aria-disabled', 'true')
    await win.getByTestId('menu-trash').click()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect(win.getByTestId('takeover-trash')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('takeover-trash')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

/**
 * AI-IMP-155 fix 1: the Help/About "keyboard shortcuts" link opens the
 * Settings takeover AND dismisses the ☰ popover. Before the fix the
 * popover (z 500) stayed painted over the takeover (z 300) because the
 * link closed only its own dialog, never the app menu. The link now
 * threads the popover-close callback and calls it before openTakeover,
 * so both the dialog and the popover leave the DOM.
 */
test('☰ Help/About shortcuts link opens Settings and dismisses the ☰ popover', async () => {
  const { app, win } = await launchApp('ew-e2e-menu-shortcuts-')

  try {
    await openAppMenu(win)
    await expect(win.getByTestId('rail-menu')).toBeVisible()
    await win.getByTestId('menu-help').click()
    await expect(win.getByTestId('help-about-dialog')).toBeVisible()

    // The one shortcuts link → Settings takeover opens, and BOTH the
    // dialog and the ☰ popover are gone from the DOM (no lingering
    // popover over the takeover).
    await win.getByTestId('help-about-shortcuts').click()
    await expect(win.getByTestId('takeover-settings')).toBeVisible()
    await expect(win.getByTestId('rail-menu')).toHaveCount(0)
    await expect(win.getByTestId('help-about-dialog')).toHaveCount(0)

    await win.keyboard.press('Escape')
    await expect(win.getByTestId('takeover-settings')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

/**
 * AI-IMP-214 acceptance: the reveal trigger spans the full would-be-chrome
 * band (not a hairline at the very edge), arms reveal ONLY (never sinks a
 * canvas click that lands in the widened band), and the hover-revealed nav
 * arrows read as the chrome-mono light token in BOTH themes — never the
 * board's themed text, which goes near-black in the light theme and vanishes.
 */
test('AI-IMP-214: title band reveal is full-height + arms-only, nav arrows read mono-light', async () => {
  const { app, win } = await launchApp('ew-e2e-title-band-')

  try {
    await expect(win.getByTestId('title-strip')).toHaveCount(0)

    // The band is the full title-band height, not the old ~1px hairline.
    const zone = (await win.getByTestId('title-strip-reveal').boundingBox())!
    expect(zone.height).toBeGreaterThanOrEqual(40)

    // Arms reveal only: the trigger zone is inert (pointer-events:none), so a
    // canvas click landing anywhere in the widened band is never swallowed.
    await expect
      .poll(() =>
        win.evaluate(
          () =>
            getComputedStyle(document.querySelector('[data-testid="title-strip-reveal"]')!)
              .pointerEvents,
        ),
      )
      .toBe('none')

    // A pointer anywhere in the band — here band-height − 4px — smokes it in.
    await win.mouse.move(zone.x + zone.width / 2, zone.y + zone.height - 4)
    await expect(win.getByTestId('title-strip')).toBeVisible()

    // The nav arrows wear the SAME chrome-mono token the smoky strip uses
    // (--ew-strip-text, :root-only) in both themes — not --ew-text, which the
    // light theme drives near-black. Comparing to the strip's own resolved
    // color pins the token, and distinguishes the fix from the old bug.
    const arrowColor = (): Promise<string> =>
      win.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="nav-back"]')!).color,
      )
    const stripColor = (): Promise<string> =>
      win.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="title-strip"]')!).color,
      )
    const applyTheme = (theme: 'dark' | 'light'): Promise<unknown> =>
      win.evaluate((name) => {
        const hook = (window as unknown as {
          __ewTheme: { apply: (t: 'dark' | 'light' | 'glass') => Promise<unknown> }
        }).__ewTheme
        return hook.apply(name)
      }, theme)
    const currentTheme = (): Promise<string> =>
      win.evaluate(() => document.documentElement.dataset['theme'] ?? 'dark')

    expect(await arrowColor()).not.toBe('rgb(0, 0, 0)')
    expect(await arrowColor()).toBe(await stripColor())

    await applyTheme('light')
    await expect.poll(currentTheme).toBe('light')
    expect(await arrowColor()).not.toBe('rgb(0, 0, 0)')
    expect(await arrowColor()).toBe(await stripColor())

    await applyTheme('dark')
    await expect.poll(currentTheme).toBe('dark')
  } finally {
    await app.close()
  }
})

/**
 * AI-IMP-075 acceptance: theme tokens repaint chrome live, and glass
 * reports the applied theme or the dark fallback from main.
 */
test('theme tokens: light switch and glass fallback report applied theme', async () => {
  const { app, win } = await launchApp('ew-e2e-theme-')

  try {
    await expect(win.getByTestId('dock')).toBeVisible()
    // The dock testid sits on the transparent stack wrapper; the
    // themed surface is the row inside it.
    const surfaceBackground = (): Promise<string> =>
      win
        .getByTestId('dock')
        .evaluate((el) => getComputedStyle(el.firstElementChild as Element).backgroundColor)
    const applyTheme = (theme: 'dark' | 'light' | 'glass'): Promise<'dark' | 'light' | 'glass'> =>
      win.evaluate((name) => {
        const hook = (window as unknown as {
          __ewTheme: {
            apply: (theme: 'dark' | 'light' | 'glass') => Promise<'dark' | 'light' | 'glass'>
          }
        }).__ewTheme
        return hook.apply(name)
      }, theme)
    const currentTheme = (): Promise<string> =>
      win.evaluate(() => document.documentElement.dataset['theme'] ?? 'dark')

    const darkBackground = await surfaceBackground()
    await expect(applyTheme('light')).resolves.toBe('light')
    await expect.poll(currentTheme).toBe('light')
    expect(await surfaceBackground()).not.toBe(darkBackground)

    const glassResult = await applyTheme('glass')
    const stampedTheme = await currentTheme()
    expect(glassResult).toBe(stampedTheme)
    expect(['dark', 'glass']).toContain(glassResult)

    await expect(applyTheme('dark')).resolves.toBe('dark')
    await expect.poll(currentTheme).toBe('dark')
  } finally {
    await app.close()
  }
})
