import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-053 acceptance: a dead utility process must never hang the
 * Project API. Pending and subsequent calls reject with UTILITY_DIED
 * and one automatic restart recovers the session against the same
 * project directory.
 *
 * AI-IMP-066 (RFC §8.6/§11.4): the outage is an ongoing condition —
 * the ⚠ perch exists for as long as it holds and its panel names it;
 * recovery clears the perch and fires a resolution toast. A transient
 * toast alone never satisfies the ongoing condition.
 */

test('utility death rejects calls, perches the outage, and recovers', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-recovery-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir, EW_TEST_HOOKS: '1' },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)

  // No condition holds at rest: no perch, no reserved space.
  await expect(win.getByTestId('perch')).toHaveCount(0)

  // Raise a holder condition and open the perch panel BEFORE the
  // kill: the automatic restart recovers in well under a second, too
  // fast to click through the arrival pulse, so the outage condition
  // is observed joining and leaving an already-open panel instead.
  await win.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('ew-test-condition', { detail: { id: 'e2e-hold', detail: 'holder' } }),
    )
  })
  await win.getByTestId('perch').click()
  await expect(win.getByTestId('perch-panel')).toContainText('holder')

  // Seed a note so recovery has durable state to prove.
  const noteId = await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const noteId = crypto.randomUUID()
    const result = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: (project.result as { id: string }).id,
      commandType: 'CreateNote',
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload: { noteId, title: 'Survivor' },
    })
    if (result.status !== 'committed') throw new Error(result.status)
    return noteId
  })

  // Kill the utility. The next query must REJECT (bounded), not hang.
  const outcome = await win.evaluate(async () => {
    const killed = window.ew.test.killUtility()
    const raced = await Promise.race([
      window.ew.project.query('getProject'),
      new Promise<'hang'>((resolve) => setTimeout(() => resolve('hang'), 10_000)),
    ])
    await killed
    return raced
  })
  expect(outcome).not.toBe('hang')
  // Either the call raced the crash and failed structurally, or the
  // restart already answered it; both are non-hangs. If it failed,
  // the code must be the structured one.
  if (typeof outcome === 'object' && outcome !== null && (outcome as { ok: boolean }).ok === false) {
    expect((outcome as { code: string }).code).toMatch(/UTILITY_DIED|NO_PROJECT/)
  }

  // §11.4: the outage holds an ongoing condition — it appears on the
  // perch and its anchored panel names it for as long as it lasts.
  // The enter transition also toasts (§8.6: enter AND resolve).
  await expect(win.getByTestId('perch')).toBeVisible()
  await expect(win.getByTestId('perch-panel')).toContainText(/restarting|failed/)
  await expect(win.getByTestId('service-outage')).toContainText(/restarting|failed/)

  // Recovery: the service condition clears (only the holder remains
  // on the perch) and the resolution toast fires.
  await expect(win.getByTestId('perch-condition')).toHaveCount(1, { timeout: 15_000 })
  await expect(win.getByTestId('perch-panel')).not.toContainText(/restarting|failed/)
  await expect(win.getByTestId('service-recovered')).toContainText('recovered')

  // Dropping the holder removes the perch entirely: no condition, no
  // slot, no reserved space.
  await win.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ew-test-condition', { detail: { id: 'e2e-hold' } }))
  })
  await expect(win.getByTestId('perch')).toHaveCount(0)
  await expect(win.getByTestId('perch-panel')).toHaveCount(0)

  // Same project, data intact.
  await expect
    .poll(async () => {
      const note = await win.evaluate(
        (id) => window.ew.project.query('getNote', { noteId: id }),
        noteId,
      )
      return note.ok ? (note.result as { title: string }).title : null
    }, { timeout: 15_000 })
    .toBe('Survivor')

  await app.close()
})

/**
 * §8.6 perch semantics, driven deterministically via the renderer's
 * test-condition event (the outage window above is too short to probe
 * stacking): conditions stack as ONE charm with a count, the panel
 * lists each detail and closes on Esc, and clearing the last
 * condition removes the slot without leaving reserved space.
 */
test('the perch stacks conditions with a count and clears to nothing', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-perch-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()
  await expect(win.getByTestId('charm-rail')).toBeVisible()
  await expect(win.getByTestId('perch')).toHaveCount(0)
  const railAtRest = (await win.getByTestId('charm-rail').boundingBox())!

  const setCondition = async (id: string, detail?: string): Promise<void> => {
    await win.evaluate(
      (payload) => {
        window.dispatchEvent(new CustomEvent('ew-test-condition', { detail: payload }))
      },
      detail === undefined ? { id } : { id, detail },
    )
  }

  // One condition: the perch appears (pulsing once on arrival is the
  // mount animation), no count badge for a single condition.
  await setCondition('e2e-a', 'Condition A holds')
  await expect(win.getByTestId('perch')).toBeVisible()
  await expect(win.getByTestId('perch-count')).toHaveCount(0)

  // Two conditions: still one charm, now with a count of 2.
  await setCondition('e2e-b', 'Condition B holds')
  await expect(win.getByTestId('perch')).toHaveCount(1)
  await expect(win.getByTestId('perch-count')).toHaveText('2')

  // The anchored panel lists both details; Esc closes the panel but
  // the charm remains while conditions hold.
  await win.getByTestId('perch').click()
  await expect(win.getByTestId('perch-condition')).toHaveCount(2)
  await expect(win.getByTestId('perch-panel')).toContainText('Condition A holds')
  await expect(win.getByTestId('perch-panel')).toContainText('Condition B holds')
  await win.keyboard.press('Escape')
  await expect(win.getByTestId('perch-panel')).toHaveCount(0)
  await expect(win.getByTestId('perch')).toBeVisible()

  // Clearing one condition drops the count; clearing the last removes
  // the slot entirely — the rail returns to its at-rest footprint.
  await setCondition('e2e-a')
  await expect(win.getByTestId('perch-count')).toHaveCount(0)
  await setCondition('e2e-b')
  await expect(win.getByTestId('perch')).toHaveCount(0)
  const railAfter = (await win.getByTestId('charm-rail').boundingBox())!
  expect(railAfter.height).toBe(railAtRest.height)

  await app.close()
})
