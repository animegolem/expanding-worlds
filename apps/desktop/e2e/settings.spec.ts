import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { exec, launchApp, launchAppInDir, revision, runQuery } from './helpers'

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

  // Flat canvas color repaints the background-less board live.
  await win.getByTestId('settings-flat-3').click()
  await expect
    .poll(() =>
      win.evaluate(() => {
        const wanted = getComputedStyle(document.documentElement)
          .getPropertyValue('--ew-canvas-flat-3')
          .trim()
        return window.__ewDebug!.stage().fallbackColor === wanted
      }),
    )
    .toBe(true)

  // Window opacity applies to the real BrowserWindow. Electron
  // implements setOpacity on Windows/macOS ONLY — on Linux it is a
  // documented no-op and getOpacity() stays 1 (broke CI's Ubuntu
  // runner), so the live half gates on the runner's platform; the
  // persisted half below asserts on every platform.
  await win.getByTestId('settings-opacity').fill('0.8')
  if (process.platform !== 'linux') {
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getOpacity()),
      )
      .toBeCloseTo(0.8, 2)
  }

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

  // Title strip 'always': visible with no hover, reveal zone retired.
  await expect(win.getByTestId('title-strip')).toBeVisible()
  await expect(win.getByTestId('title-strip-reveal')).toHaveCount(0)

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
  expect(persisted['windowOpacity']).toBe(0.8)

  // Relaunch on the same project + config: both tiers survive, and
  // the theme applies before the user touches anything.
  const second = await launchAppInDir(projectDir, { EW_APP_CONFIG_DIR: configDir })
  await expect.poll(() => currentTheme(second.win)).toBe('light')
  expect(await runQuery<string>(second.win, 'getTrashRetention')).toBe('30d')
  // 'always' survived the relaunch: strip up at boot, no hover.
  // (Asserted before opening settings — a takeover unmounts it.)
  await expect(second.win.getByTestId('title-strip')).toBeVisible()
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

  // 'never' kills both the strip and its reveal zone live.
  await second.win.getByTestId('settings-title-strip-never').click()
  await second.win.keyboard.press('Escape')
  await expect(second.win.getByTestId('settings-view')).toHaveCount(0)
  await expect(second.win.getByTestId('title-strip')).toHaveCount(0)
  await expect(second.win.getByTestId('title-strip-reveal')).toHaveCount(0)
  await second.app.close()
})

test('charm corner flips existing hint charms live (§11.5)', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-corner-'))
  const { app, win } = await launchApp('ew-e2e-settings-corner-', {
    EW_APP_CONFIG_DIR: configDir,
  })

  // A noted 200×200 placement grows lower-right hint charms (§8.4).
  const placementId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId,
    placementId,
    x: 400,
    y: 300,
    appearance: { kind: 'dot', color: '#77aaff' },
    note: { kind: 'create', noteId: crypto.randomUUID(), title: 'Corner Probe' },
  })
  await exec(win, 'TransformContent', {
    canvasId,
    items: [
      {
        kind: 'placement',
        placementId,
        x: 400,
        y: 300,
        width: 200,
        height: 200,
        scale: 1,
        rotation: 0,
      },
    ],
  })
  const group = win.getByTestId(`hint-charms-${placementId}`)
  await expect(group).toBeVisible()
  const before = (await group.boundingBox())!

  await openSettings(win)
  await win.getByTestId('settings-charm-corner-upper-right').click()
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('settings-view')).toHaveCount(0)

  // The flip moves the charm group up by roughly the placement height.
  await expect
    .poll(async () => ((await group.boundingBox()) ?? { y: before.y }).y)
    .toBeLessThan(before.y - 100)

  await app.close()
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
