import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, launchAppInDir } from './helpers'

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

  await win.getByTestId('charm-menu').click()
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
