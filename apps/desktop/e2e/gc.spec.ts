import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, runQuery } from './helpers'

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9WQAAAAASUVORK5CYII='

test('End Session ages then sweeps an orphan, retires metadata, and manifests it', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-gc-', { EW_TEST_HOOKS: '1' })
  try {
    const assetId = await win.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      const result = await window.ew.project.importAsset({
        bytes,
        originalFilename: 'orphan.png',
      })
      if (!result.ok) throw new Error(result.message)
      return result.assetId
    }, PNG_1PX)
    const asset = await runQuery<{ contentHash: string }>(win, 'getAsset', { assetId })
    const blob = join(projectDir, 'assets', asset.contentHash.slice(0, 2), asset.contentHash)
    await expect.poll(() => existsSync(blob)).toBe(true)

    // First observed at the data-half boundary: starts the clock, keeps bytes.
    await win.evaluate(() => window.ew.test.endSessionData('2026-01-01T00:00:00.000Z'))
    expect(existsSync(blob)).toBe(true)

    await win.getByTestId('charm-menu').click()
    await win.getByTestId('menu-settings').click()
    await expect(win.getByTestId('settings-snapshots-note')).toContainText(
      'Cleanup can reclaim',
    )
    await win.keyboard.press('Escape')

    // Thirty-one days later, the same snapshot→sweep sequence re-checks
    // guards, removes metadata and bytes, then appends its manifest receipt.
    await win.evaluate(() => window.ew.test.endSessionData('2026-02-01T00:00:00.000Z'))
    await expect.poll(() => existsSync(blob)).toBe(false)
    expect(await runQuery(win, 'getAsset', { assetId })).toBeNull()
    const manifest = readFileSync(join(projectDir, 'cache', 'gc-manifest.jsonl'), 'utf8')
    expect(manifest).toContain(asset.contentHash)
  } finally {
    await app.close()
  }
})
