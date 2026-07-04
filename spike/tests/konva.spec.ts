import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AI-IMP-003 acceptance: the Konva adapter runs every scenario without
 * errors and writes metrics. Heap numbers are recorded in the results
 * JSON for the decision report but not hard-asserted (GC timing makes
 * absolute thresholds flaky).
 */

test('konva run-all completes every scenario', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await page.waitForFunction(() => window.__spike !== undefined)

  const { seed, scenarioCount } = await page.evaluate(() => ({
    seed: window.__spike.seed,
    scenarioCount: window.__spike.scenarioCount,
  }))
  expect(scenarioCount).toBe(10)

  const results = await page.evaluate(() => window.__spike.runAll('konva'))

  expect(results).toHaveLength(scenarioCount)
  for (const r of results) {
    expect.soft(r.error, `${r.scenario} errored`).toBeUndefined()
    expect.soft(r.ok, `${r.scenario} commit count ${r.commits} != ${r.expectedCommits}`).toBe(true)
    expect.soft(r.frames, `${r.scenario} collected no frames`).toBeGreaterThan(50)
  }
  expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0)

  const dir = join(process.cwd(), 'results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `konva-seed${seed}.json`), JSON.stringify(results, null, 2))
})
