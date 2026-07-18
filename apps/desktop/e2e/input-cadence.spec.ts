import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

interface CadenceSample {
  label: string
  ms: number
}

async function timed(label: string, action: () => Promise<unknown>): Promise<CadenceSample> {
  const started = performance.now()
  await action()
  return { label, ms: Math.round((performance.now() - started) * 100) / 100 }
}

// Playwright's CI collector requires a literal object-destructuring first
// parameter even though this Electron probe consumes no browser fixture.
// eslint-disable-next-line no-empty-pattern
test('records pointer/compositor cadence under the active CI window mode (AI-IMP-269)', async ({}, testInfo) => {
  const { app, win } = await launchApp('ew-e2e-input-cadence-')
  try {
    await win.evaluate(() => {
      const probe = document.createElement('button')
      probe.type = 'button'
      probe.dataset['testid'] = 'input-cadence-target'
      probe.textContent = 'input cadence probe'
      Object.assign(probe.style, {
        position: 'fixed',
        left: '500px',
        top: '120px',
        zIndex: '2147483647',
      })
      probe.addEventListener('click', () => {
        probe.dataset['clicks'] = String(Number(probe.dataset['clicks'] ?? '0') + 1)
      })
      document.body.append(probe)
    })

    await win.mouse.move(64, 200)
    const samples = [
      await timed('evaluate', () => win.evaluate(() => document.visibilityState)),
      await timed('mouse.move steps=1', () => win.mouse.move(160, 200, { steps: 1 })),
      await timed('mouse.move steps=3', () => win.mouse.move(260, 200, { steps: 3 })),
      await timed('mouse.move steps=4', () => win.mouse.move(360, 200, { steps: 4 })),
      await timed('locator.click', () => win.getByTestId('input-cadence-target').click()),
    ]
    const evidence = {
      hiddenWindowsEnv: process.env['EW_TEST_HIDDEN_WINDOWS'] ?? '(default)',
      visibilityState: await win.evaluate(() => document.visibilityState),
      samples,
    }
    console.log(`[input-cadence] ${JSON.stringify(evidence)}`)
    await testInfo.attach('input-cadence.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    })
    await expect(win.getByTestId('input-cadence-target')).toHaveAttribute('data-clicks', '1')
  } finally {
    await app.close()
  }
})
