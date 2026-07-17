import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openAppMenu, exec, launchApp, launchAppInDir, revision } from './helpers'

/**
 * §11.5 settings takeover (AI-IMP-074): commit-on-click with no save
 * step, live apply behind the sheet, and app-tier persistence. Project-
 * owned controls live on their owning surfaces (trash retention moved
 * to Trash in rev 0.70). EW_APP_CONFIG_DIR keeps these instances out of
 * the real user config.
 */

async function openSettings(win: Page): Promise<void> {
  await openAppMenu(win)
  await win.getByTestId('menu-settings').click()
  await expect(win.getByTestId('settings-view')).toBeVisible()
}

function currentTheme(win: Page): Promise<string> {
  return win.evaluate(() => document.documentElement.dataset['theme'] ?? 'dark')
}

function currentDensity(win: Page): Promise<string> {
  return win.evaluate(() => document.documentElement.dataset['density'] ?? 'compact')
}

test('settings commit on click, apply live, and persist per tier across relaunch', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-'))
  const first = await launchApp('ew-e2e-settings-', { EW_APP_CONFIG_DIR: configDir })
  const { app, win, projectDir } = first

  await openSettings(win)
  const revisionBefore = await revision(win)
  await expect(win.getByTestId('settings-commit-copy')).toHaveText(
    'Changes apply instantly · no save',
  )
  await expect(win.getByTestId('settings-section-notes')).toContainText('this world')

  // Theme repaints live behind the sheet, no apply button anywhere.
  await win.getByTestId('settings-theme-light').click()
  await expect.poll(() => currentTheme(win)).toBe('light')

  // App-tier preference rows commit on interaction.
  await win.getByTestId('settings-charm-corner-upper-right').click()
  await win.getByTestId('settings-title-strip-always').click()
  await win.getByTestId('settings-fade-never').click()
  await expect(win.getByTestId('settings-fade-never')).toHaveAttribute('aria-checked', 'true')

  // Density is app-tier and live: both the root token and a settings
  // row's physical target grow without reopening the sheet.
  const compactHeight = (await win.getByTestId('settings-row-density').boundingBox())!.height
  await win.getByTestId('settings-density-comfortable').click()
  await expect.poll(() => currentDensity(win)).toBe('comfortable')
  await expect
    .poll(async () => (await win.getByTestId('settings-row-density').boundingBox())!.height)
    .toBeGreaterThan(compactHeight)
  await expect
    .poll(async () => (await win.getByTestId('settings-row-density').boundingBox())!.height)
    .toBeGreaterThanOrEqual(36)
  await expect(win.getByTestId('settings-density-touch')).toHaveCount(0)

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

  await expect(win.getByTestId('settings-row-retention')).toHaveCount(0)

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
  expect(persisted['density']).toBe('comfortable')

  // An old inert key is ignored by the renderer codec rather than
  // making a pre-300 settings file unreadable.
  writeFileSync(
    join(configDir, 'app-settings.json'),
    `${JSON.stringify({ ...persisted, menuPlacement: 'system' }, null, 2)}\n`,
  )

  // Relaunch on the same project + config: app settings survive, and
  // the theme applies before the user touches anything.
  const second = await launchAppInDir(projectDir, { EW_APP_CONFIG_DIR: configDir })
  await expect.poll(() => currentTheme(second.win)).toBe('light')
  await expect.poll(() => currentDensity(second.win)).toBe('comfortable')
  // 'always' survived the relaunch: strip up at boot, no hover.
  // (Asserted before opening settings — a takeover unmounts it.)
  await expect(second.win.getByTestId('title-strip')).toBeVisible()
  await openSettings(second.win)
  await expect(second.win.getByTestId('settings-theme-light')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(second.win.getByTestId('settings-density-comfortable')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Rows with no backing behavior leave rather than impersonating
  // controls. This includes the stale menu-placement inventory.
  for (const id of [
    'settings-row-grid',
    'settings-row-snap',
    'settings-row-vault',
    'settings-row-mirror-drops',
    'settings-row-border',
    'settings-row-corners',
    'settings-row-menu-placement',
  ]) {
    await expect(second.win.getByTestId(id)).toHaveCount(0)
  }

  // Fold memory is renderer-session view state: it survives closing
  // and reopening Settings, but never enters the app settings file.
  await second.win.getByTestId('settings-fold-appearance').click()
  await expect(second.win.getByTestId('settings-fold-appearance')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(second.win.getByTestId('settings-row-density')).toHaveCount(0)
  await second.win.keyboard.press('Escape')
  await openSettings(second.win)
  await expect(second.win.getByTestId('settings-fold-appearance')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(second.win.getByTestId('settings-row-density')).toHaveCount(0)
  await second.win.getByTestId('settings-fold-appearance').click()

  // 'never' kills both the drag strip and its reveal zone live, but
  // AI-IMP-293's sole top-right ☰ remains — Settings cannot strand its
  // own recovery route.
  await second.win.getByTestId('settings-title-strip-never').click()
  await second.win.keyboard.press('Escape')
  await expect(second.win.getByTestId('settings-view')).toHaveCount(0)
  await expect(second.win.getByTestId('title-strip')).toHaveCount(0)
  await expect(second.win.getByTestId('title-strip-reveal')).toHaveCount(0)
  await expect(second.win.getByTestId('charm-menu')).toBeVisible()
  await openAppMenu(second.win)
  await expect(second.win.getByTestId('rail-menu')).toBeVisible()
  await second.app.close()
})

test('Keyboard section lists registered bindings by scope, read-only (§8.2, AI-IMP-117)', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-keys-'))
  const { app, win } = await launchApp('ew-e2e-settings-keys-', { EW_APP_CONFIG_DIR: configDir })

  await openSettings(win)
  await expect(win.getByTestId('settings-section-keyboard')).toBeVisible()

  // The head states the plan rather than reading finished-and-limited.
  await expect(win.getByTestId('settings-keyboard-note')).toContainText('Rebinding is coming soon')

  // A binding from each scope renders with its platform-specific combo
  // string. formatCombo keys off the renderer's navigator.platform: on
  // macOS it stacks glyphs (⌘K, ⇧⌘]), elsewhere it spells modifiers and
  // joins with '+' (Ctrl+K, Ctrl+Shift+]). The renderer shares this
  // machine, so process.platform is the correct oracle — assert the
  // EXACT string this platform must show (CI on Linux prints Ctrl form).
  const mac = process.platform === 'darwin'
  await expect(win.getByTestId('settings-key-combo-quick-open')).toHaveText(mac ? '⌘K' : 'Ctrl+K')
  await expect(win.getByTestId('settings-key-combo-nav-back')).toHaveText(mac ? '⌘[' : 'Ctrl+[')
  await expect(win.getByTestId('settings-key-combo-bookmark-jump')).toHaveText(
    mac ? '⌘1–9' : 'Ctrl+1–9',
  )
  // The new Mod+D binding is listed too (§8.1 rev 0.48).
  await expect(win.getByTestId('settings-key-combo-bookmark-current')).toHaveText(
    mac ? '⌘D' : 'Ctrl+D',
  )
  await expect(win.getByTestId('settings-key-combo-board-send-front')).toHaveText(
    mac ? '⇧⌘]' : 'Ctrl+Shift+]',
  )
  // Undo/Redo are declared (AI-IMP-123) so the "every shortcut" claim
  // is accurate; dispatch stays capture-phase in undo-keys.ts.
  await expect(win.getByTestId('settings-key-combo-undo')).toHaveText(mac ? '⌘Z' : 'Ctrl+Z')
  await expect(win.getByTestId('settings-key-combo-redo')).toHaveText(
    mac ? '⇧⌘Z' : 'Ctrl+Shift+Z',
  )
  await expect(win.getByTestId('settings-key-combo-tool-select')).toHaveText('V')
  await expect(win.getByTestId('settings-key-combo-gallery-bucket-jump')).toHaveText(
    mac ? '⌘↑ ↓' : 'Ctrl+↑ ↓',
  )

  // Read-only: the section holds no interactive controls (no buttons,
  // inputs, or selects — unlike every other settings section).
  const controls = win
    .getByTestId('settings-section-keyboard')
    .locator(
      '#settings-section-keyboard-body button, ' +
        '#settings-section-keyboard-body input, ' +
        '#settings-section-keyboard-body select',
    )
  await expect(controls).toHaveCount(0)

  await app.close()
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

test('corrupt app-settings file falls back to defaults, announces the recovery loudly, and preserves the bad file (CA-015/AI-IMP-237)', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ew-e2e-appcfg-bad-'))
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'app-settings.json'), '{not json')

  const { app, win, projectDir } = await launchApp('ew-e2e-settings-bad-', {
    EW_APP_CONFIG_DIR: configDir,
  })
  await expect.poll(() => currentTheme(win)).toBe('dark')

  // The reset is LOUD — a §8.6 toast, not a silent fallback. Checked
  // before anything else touches settings, since the toast is
  // transient (auto-dismisses after TOAST_DURATION_MS).
  await expect(win.getByTestId('app-settings-recovered')).toContainText('reset to defaults')

  // The unreadable original is preserved beside the good path for
  // inspection rather than simply discarded.
  const before = readdirSync(configDir)
  expect(before).not.toContain('app-settings.json')
  expect(before.some((name) => name.startsWith('app-settings.json.corrupt-'))).toBe(true)
  expect(before.some((name) => name.includes('.tmp-'))).toBe(false)

  await openSettings(win)
  await expect(win.getByTestId('settings-theme-dark')).toHaveAttribute('aria-pressed', 'true')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('settings-view')).toHaveCount(0)

  // A write after the recovery goes through the atomic path and
  // survives a relaunch — the crash-safety half of CA-015, not just
  // the load-time half.
  await openSettings(win)
  await win.getByTestId('settings-charm-corner-upper-right').click()
  await win.keyboard.press('Escape')
  await app.close()

  const persisted = JSON.parse(
    readFileSync(join(configDir, 'app-settings.json'), 'utf8'),
  ) as Record<string, unknown>
  expect(persisted['charmCorner']).toBe('upper-right')
  // No leftover temp file from the write that just happened.
  expect(readdirSync(configDir).some((name) => name.includes('.tmp-'))).toBe(false)

  const relaunch = await launchAppInDir(projectDir, { EW_APP_CONFIG_DIR: configDir })
  await openSettings(relaunch.win)
  await expect(
    relaunch.win.getByTestId('settings-charm-corner-upper-right'),
  ).toHaveAttribute('aria-pressed', 'true')
  // The recovery toast does not repeat on a clean second boot.
  await expect(relaunch.win.getByTestId('app-settings-recovered')).toHaveCount(0)
  await relaunch.app.close()
})
