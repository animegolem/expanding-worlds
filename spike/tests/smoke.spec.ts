import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AI-IMP-001 acceptance: the harness runs every scenario against the
 * no-op adapter, produces metrics, and fixture generation is
 * deterministic for a fixed seed.
 */

test('noop run-all completes and fixtures are deterministic', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await page.waitForFunction(() => window.__spike !== undefined)

  const { seed, scenarioCount, checksumA, checksumB } = await page.evaluate(() => ({
    seed: window.__spike.seed,
    scenarioCount: window.__spike.scenarioCount,
    checksumA: window.__spike.checksum(),
    checksumB: window.__spike.checksumFresh(window.__spike.seed),
  }))
  expect(scenarioCount).toBe(10)
  expect(checksumA).toBe(checksumB)

  const differentSeed = await page.evaluate(() => window.__spike.checksumFresh(1))
  expect(differentSeed).not.toBe(checksumA)

  const results = await page.evaluate(() => window.__spike.runAll('noop'))

  expect(results).toHaveLength(scenarioCount)
  for (const r of results) {
    expect.soft(r.error, `${r.scenario} errored`).toBeUndefined()
    expect.soft(r.ok, `${r.scenario} commit count ${r.commits} != ${r.expectedCommits}`).toBe(true)
    expect.soft(r.frames, `${r.scenario} collected no frames`).toBeGreaterThan(50)
  }
  expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0)

  const dir = join(process.cwd(), 'results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `noop-seed${seed}.json`), JSON.stringify(results, null, 2))
})
