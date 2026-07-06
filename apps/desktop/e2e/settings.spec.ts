import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, launchAppInDir, revision, runQuery } from './helpers'

/**
 * §11.5 settings takeover (AI-IMP-074): commit-on-click with no save
 * step, live apply behind the sheet, and two-tier persistence — app
 * settings follow the app-config dir, trash retention follows the
 * project database. EW_APP_CONFIG_DIR keeps these instances out of
 * the real user config.
 */

async function openSettings(win: Page): Promise<void> {
  await win.getByTestId('charm-menu').click()
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('settings-view')).toBeVisible()
}

function currentTheme(win: Page): Promise<string> {
  return win.evaluate(() => document.documentElement.dataset['theme'] ?? 'dark')
}

test('settings commit on click, apply live, and persist per tier across relaunch', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-'))
  const first = await launchApp('ew-e2e-settings-', { EW_APP_CONFIG_DIR: configDir })
  const { app, win, projectDir } = first

  await openSettings(win)
  const revisionBefore = await revision(win)

  // Theme repaints live behind the sheet, no apply button anywhere.
  await win.getByTestId('settings-theme-light').click()
  await expect.poll(() => currentTheme(win)).toBe('light')

  // App-tier preference rows commit on interaction.
  await win.getByTestId('settings-charm-corner-upper-right').click()
  await win.getByTestId('settings-title-strip-always').click()
  await win.getByTestId('settings-fade-never').click()
  await expect(win.getByTestId('settings-fade-never')).toHaveAttribute('aria-pressed', 'true')
  await win.getByTestId('settings-flat-3').click()

  // App-tier changes never enter command history: same revision.
  expect(await revision(win)).toBe(revisionBefore)

  // Trash retention is the project-tier row (its §9 command).
  await win.getByTestId('settings-retention-30d').click()
  await expect
    .poll(() => runQuery<string>(win, 'getTrashRetention'))
    .toBe('30d')

  // Esc closes; nothing to save.
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('settings-view')).toHaveCount(0)
  await expect.poll(() => currentTheme(win)).toBe('light')

  await app.close()

  // The app tier landed in the config dir as one JSON file.
  const persisted = JSON.parse(
    readFileSync(join(configDir, 'app-settings.json'), 'utf8'),
  ) as Record<string, unknown>
  expect(persisted['theme']).toBe('light')
  expect(persisted['charmCorner']).toBe('upper-right')
  expect(persisted['titleStrip']).toBe('always')
  expect(persisted['fadeDelayMs']).toBe('never')
  expect(persisted['flatCanvasColor']).toBe('--ew-canvas-flat-3')

  // Relaunch on the same project + config: both tiers survive, and
  // the theme applies before the user touches anything.
  const second = await launchAppInDir(projectDir, { EW_APP_CONFIG_DIR: configDir })
  await expect.poll(() => currentTheme(second.win)).toBe('light')
  expect(await runQuery<string>(second.win, 'getTrashRetention')).toBe('30d')
  await openSettings(second.win)
  await expect(second.win.getByTestId('settings-theme-light')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(second.win.getByTestId('settings-retention-30d')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The disabled inventory still names what it waits for.
  await expect(second.win.getByTestId('settings-row-grid')).toHaveAttribute(
    'title',
    'arrives with the grid feature',
  )
  await second.app.close()
})

test('corrupt app-settings file falls back to defaults', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-bad-'))
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'app-settings.json'), '{not json')

  const { app, win } = await launchApp('ew-e2e-settings-bad-', {
    EW_APP_CONFIG_DIR: configDir,
  })
  await expect.poll(() => currentTheme(win)).toBe('dark')
  await openSettings(win)
  await expect(win.getByTestId('settings-theme-dark')).toHaveAttribute('aria-pressed', 'true')
  await app.close()
})
