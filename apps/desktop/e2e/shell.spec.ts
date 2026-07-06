import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'
import { launchApp, revealTitleStrip, seedPlacedNote } from './helpers'

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

  // Rail and dock are present; charms whose views haven't shipped
  // stay disabled (outline and ☰ went live with AI-IMP-068).
  await expect(win.getByTestId('charm-rail')).toBeVisible()
  await expect(win.getByTestId('dock')).toBeVisible()
  for (const id of ['project', 'search', 'graph', 'gallery']) {
    await expect(win.getByTestId(`charm-${id}`)).toHaveAttribute('aria-disabled', 'true')
  }
  for (const id of ['outline', 'menu']) {
    await expect(win.getByTestId(`charm-${id}`)).not.toHaveAttribute('aria-disabled', 'true')
  }
  // Tool modes and the zoom cluster live in the dock.
  await expect(win.getByTestId('tool-select')).toBeVisible()
  await expect(win.getByTestId('dock-shape')).toBeVisible()
  await expect(win.getByTestId('zoom-pct')).toHaveText('100%')
  await win.getByTestId('zoom-in').click()
  await expect(win.getByTestId('zoom-pct')).toHaveText('125%')
  await win.getByTestId('zoom-out').click()
  await expect(win.getByTestId('zoom-pct')).toHaveText('100%')

  // The shape flyout carries the shape kinds behind one dock button.
  await expect(win.getByTestId('tool-rect')).toHaveCount(0)
  await win.getByTestId('dock-shape').click()
  await expect(win.getByTestId('tool-rect')).toBeVisible()
  await win.getByTestId('tool-ellipse').click()
  await expect(win.getByTestId('tool-ellipse')).toHaveCount(0) // flyout closed
  await win.getByTestId('tool-select').click()

  // Tool shortcuts: the GUI is the tutorial for the keyboard app.
  await win.getByTestId('canvas-host').click({ position: { x: 400, y: 400 } })
  await win.keyboard.press('t')
  await expect(win.getByTestId('tool-text')).toHaveClass(/active/)
  await win.keyboard.press('v')
  await expect(win.getByTestId('tool-select')).toHaveClass(/active/)

  // Title strip: hidden at rest, revealed at the top edge.
  await expect(win.getByTestId('title-strip')).toHaveCount(0)
  await revealTitleStrip(win)

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
  await win.getByTestId('charm-menu').click()
  await expect(win.getByTestId('rail-menu')).toBeVisible()
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('rail-menu')).toHaveCount(0)
  await expect(win.getByTestId('takeover-settings')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('takeover-settings')).toHaveCount(0)

  // Board input lives again after return.
  await win.getByTestId('canvas-host').click({ position: { x: 400, y: 400 } })
  await win.keyboard.press('t')
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.activeTool()))
    .toBe('text')

  await app.close()
})
