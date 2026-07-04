import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AI-IMP-002 acceptance: the PixiJS adapter runs every scenario with
 * the fixed seed, commits match expectations, frames are collected,
 * and results (including heap samples) are written for the AI-IMP-004
 * comparison. Heap numbers are recorded, not hard-asserted.
 */

test('pixi run-all completes all scenarios', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await page.waitForFunction(() => window.__spike !== undefined)

  const { seed, scenarioCount } = await page.evaluate(() => ({
    seed: window.__spike.seed,
    scenarioCount: window.__spike.scenarioCount,
  }))
  expect(scenarioCount).toBe(10)

  const results = await page.evaluate(() => window.__spike.runAll('pixi'))

  expect(results).toHaveLength(scenarioCount)
  for (const r of results) {
    expect.soft(r.error, `${r.scenario} errored`).toBeUndefined()
    expect.soft(r.ok, `${r.scenario} commit count ${r.commits} != ${r.expectedCommits}`).toBe(true)
    expect.soft(r.frames, `${r.scenario} collected no frames`).toBeGreaterThan(50)
  }
  expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0)

  const dir = join(process.cwd(), 'results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `pixi-seed${seed}.json`), JSON.stringify(results, null, 2))
})
