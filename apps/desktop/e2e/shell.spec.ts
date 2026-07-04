import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-006 acceptance: renderer → preload → main → utility process
 * round-trip, sandboxed renderer, correct window title.
 */

test('shell launches and the process seam round-trips', async () => {
  const app = await electron.launch({ args: ['out/main/index.cjs'] })
  const win = await app.firstWindow()

  await expect(win).toHaveTitle('Expanding Worlds')

  const response = await win.evaluate(() => window.ew.project.ping())
  expect(response).toEqual({ pong: true, from: 'utility' })

  // Sandbox: no node globals leak into the page context.
  const requireType = await win.evaluate(() => typeof (window as unknown as Record<string, unknown>)['require'])
  expect(requireType).toBe('undefined')

  // The placeholder page renders the live seam result.
  await expect(win.locator('#status')).toHaveText('{"pong":true,"from":"utility"}')

  await app.close()
})
