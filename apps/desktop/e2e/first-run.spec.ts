import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { openAppMenu, launchApp, launchAppInDir, seedPlacedNote } from './helpers'

/**
 * §19 first-run walkthrough (AI-IMP-145): the guide shows EXACTLY ONCE
 * on the true first open, renders the ratified copy on paper styling,
 * and `start ›` lands inside the seeded example. The whole suite runs
 * with EW_SUPPRESS_FIRST_RUN=1 (playwright.config) so the takeover
 * never blocks other specs; these tests opt back in with '0'.
 */

// The seeded example (see apps/desktop/resources/seed/): a root board
// of 3 artists, 9 works, and the explainer note.
const SEED_BOARD_COUNT = 3

test('Escape is the guide Skip exit and marks the profile seen', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-firstrun-escape-cfg-'))
  const { app, win } = await launchApp('ew-e2e-firstrun-escape-', {
    EW_SUPPRESS_FIRST_RUN: '0',
    EW_APP_CONFIG_DIR: configDir,
  })
  await expect(win.getByTestId('first-run-guide')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('first-run-guide')).toHaveCount(0)
  await expect.poll(async () => (await win.evaluate(() => window.ew.settings.appAll())).firstRunSeen).toBe(true)
  await app.close()
})

test('clicking the first-run scrim uses the same Skip exit', async () => {
  const { app, win } = await launchApp('ew-e2e-firstrun-scrim-', {
    EW_SUPPRESS_FIRST_RUN: '0',
  })
  const guide = win.getByTestId('first-run-guide')
  await expect(guide).toBeVisible()
  await guide.click({ position: { x: 5, y: 5 } })
  await expect(guide).toHaveCount(0)
  await app.close()
})

test('a fresh profile shows the guide and renders the ratified page-2 copy verbatim', async () => {
  const { app, win } = await launchApp('ew-e2e-firstrun-', { EW_SUPPRESS_FIRST_RUN: '0' })

  await expect(win.getByTestId('first-run-guide')).toBeVisible()
  await expect(win.getByTestId('first-run-title')).toHaveText('A board for your pictures')

  // Page 2 is the load-bearing trust moment — asserted verbatim.
  await win.getByTestId('first-run-next').click()
  await expect(win.getByTestId('first-run-title')).toHaveText('Your pictures are safe')
  await expect(win.getByTestId('first-run-body')).toHaveText(
    'Everything you drop here is COPIED. Your own folders and originals are never touched, moved, or changed — and one picture can live in many places at once without existing twice.',
  )

  await app.close()
})

test('previous pages back, tracks with the dots, and stays inert on the first card (AI-IMP-203)', async () => {
  const { app, win } = await launchApp('ew-e2e-firstrun-prev-', { EW_SUPPRESS_FIRST_RUN: '0' })

  const activeDotIndex = (): Promise<number> =>
    win
      .locator('[data-testid="first-run-dots"] .dot')
      .evaluateAll((dots) => dots.findIndex((dot) => dot.getAttribute('data-active') === 'true'))

  await expect(win.getByTestId('first-run-guide')).toBeVisible()
  // First card: previous is rendered but inert (the app's disabled-rows
  // convention — visible, named, disabled — rather than absent).
  await expect(win.getByTestId('first-run-prev')).toBeDisabled()
  expect(await activeDotIndex()).toBe(0)

  await win.getByTestId('first-run-next').click()
  await win.getByTestId('first-run-next').click()
  await expect(win.getByTestId('first-run-title')).toHaveText('No knobs on your art')
  expect(await activeDotIndex()).toBe(2)
  await expect(win.getByTestId('first-run-prev')).toBeEnabled()

  await win.getByTestId('first-run-prev').click()
  await expect(win.getByTestId('first-run-title')).toHaveText('Your pictures are safe')
  expect(await activeDotIndex()).toBe(1)

  // ArrowLeft/ArrowRight page the guide the same way while it holds focus.
  await win.keyboard.press('ArrowRight')
  await expect(win.getByTestId('first-run-title')).toHaveText('No knobs on your art')
  expect(await activeDotIndex()).toBe(2)

  await win.keyboard.press('ArrowLeft')
  await win.keyboard.press('ArrowLeft')
  await expect(win.getByTestId('first-run-title')).toHaveText('A board for your pictures')
  expect(await activeDotIndex()).toBe(0)
  await expect(win.getByTestId('first-run-prev')).toBeDisabled()

  // ArrowLeft on the first card is a no-op, never a dead click through
  // to something else underneath.
  await win.keyboard.press('ArrowLeft')
  await expect(win.getByTestId('first-run-title')).toHaveText('A board for your pictures')

  await app.close()
})

test('skip marks it seen; a later launch never shows it unbidden', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-firstrun-proj-'))
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-firstrun-cfg-'))
  const env = { EW_SUPPRESS_FIRST_RUN: '0', EW_APP_CONFIG_DIR: configDir }

  {
    const { app, win } = await launchAppInDir(projectDir, env)
    await expect(win.getByTestId('first-run-guide')).toBeVisible()
    await win.getByTestId('first-run-skip').click()
    await expect(win.getByTestId('first-run-guide')).toHaveCount(0)
    await app.close()
  }

  {
    const { app, win } = await launchAppInDir(projectDir, env)
    // The seen flag persisted across the relaunch (same config dir);
    // the poll forces the settings roundtrip the guide's boot check
    // makes, so a regression that re-shows it would have fired by now.
    await expect
      .poll(async () => (await win.evaluate(() => window.ew.settings.appAll()))['firstRunSeen'])
      .toBe(true)
    await expect(win.getByTestId('first-run-guide')).toHaveCount(0)
    await app.close()
  }
})

test('the Settings replay action re-opens the guide', async () => {
  const { app, win } = await launchApp('ew-e2e-firstrun-replay-', { EW_SUPPRESS_FIRST_RUN: '0' })

  await expect(win.getByTestId('first-run-guide')).toBeVisible()
  await win.getByTestId('first-run-skip').click()
  await expect(win.getByTestId('first-run-guide')).toHaveCount(0)

  await openAppMenu(win)
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('settings-view')).toBeVisible()
  await win.getByTestId('settings-replay-guide').click()

  // The settings takeover closes and the guide takes the window again.
  await expect(win.getByTestId('takeover-settings')).toHaveCount(0)
  await expect(win.getByTestId('first-run-guide')).toBeVisible()
  await expect(win.getByTestId('first-run-title')).toHaveText('A board for your pictures')

  await app.close()
})

test('start walks the arc, stores the pick, and lands inside the seeded example', async () => {
  const libraryDir = mkdtempSync(join(tmpdir(), 'ew-e2e-firstrun-seed-lib-'))
  const { app, win } = await launchApp('ew-e2e-firstrun-start-', {
    EW_SUPPRESS_FIRST_RUN: '0',
    EW_LIBRARY_DIR: libraryDir,
  })

  await expect(win.getByTestId('first-run-guide')).toBeVisible()

  // Six `next ›` steps walk pages 1–6 to the final page-7 pick.
  for (let i = 0; i < 6; i += 1) {
    await win.getByTestId('first-run-next').click()
  }
  await expect(win.getByTestId('first-run-title')).toHaveText('What do you plan to make?')

  // An optional pick is stored app-tier (consumer is future work).
  await win.getByTestId('first-run-pick-comic-bible').click()
  await win.getByTestId('first-run-start').click()

  // The guide closes and the gallery opens straight into the seeded
  // example — the example board is active (everything scope, the
  // library's 3 artist boards present).
  await expect(win.getByTestId('first-run-guide')).toHaveCount(0)
  await expect(win.getByTestId('takeover-gallery')).toBeVisible()
  await expect(win.locator('[data-testid="gallery-cell"][data-kind="board"]')).toHaveCount(
    SEED_BOARD_COUNT,
  )

  const settings = await win.evaluate(() => window.ew.settings.appAll())
  expect(settings['firstRunPick']).toBe('comic-bible')

  await app.close()
})

test('a replayed guide blocks board input — Delete cannot reach a live selection (PR #14 P2)', async () => {
  // Suppression stays ON here: replay calls showFirstRun() directly,
  // which is exactly the risky path the review named — a guide shown
  // over a board with selection and undo state.
  const { app, win } = await launchApp('ew-e2e-firstrun-block-')
  await seedPlacedNote(win, 'Guarded', 'must survive the guide', { x: 240, y: 200 })
  await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)

  // Select it on the live board, then replay the guide over it.
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await openAppMenu(win)
  await win.getByTestId('menu-settings').click()
  await win.getByTestId('settings-replay-guide').click()
  await expect(win.getByTestId('first-run-guide')).toBeVisible()

  // Board delete keys must not act underneath the takeover-family card.
  await win.keyboard.press('Delete')
  await win.keyboard.press('Backspace')
  await win.getByTestId('first-run-skip').click()
  await expect(win.getByTestId('first-run-guide')).toHaveCount(0)
  await expect
    .poll(() => win.evaluate(() => window.__ewDebug!.sceneStats().placements))
    .toBe(1)

  await app.close()
})
