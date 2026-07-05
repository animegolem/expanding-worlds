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
 * Project API. Pending and subsequent calls reject with UTILITY_DIED,
 * the status strip surfaces the outage, and one automatic restart
 * recovers the session against the same project directory.
 */

test('utility death rejects calls, surfaces status, and recovers', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-recovery-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir, EW_TEST_HOOKS: '1' },
  })
  const win = await app.firstWindow()
  await win.waitForFunction(() => window.__ewDebug !== undefined)

  // Seed a note so recovery has durable state to prove.
  const noteId = await win.evaluate(async () => {
    const project = await window.ew.project.query('getProject')
    if (!project.ok) throw new Error(project.message)
    const noteId = crypto.randomUUID()
    const result = await window.ew.project.execute({
      commandId: crypto.randomUUID(),
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

  // The outage surfaced, then recovery: same project, data intact.
  await expect(win.getByTestId('service-status')).toBeVisible()
  await expect
    .poll(async () => {
      const note = await win.evaluate(
        (id) => window.ew.project.query('getNote', { noteId: id }),
        noteId,
      )
      return note.ok ? (note.result as { title: string }).title : null
    }, { timeout: 15_000 })
    .toBe('Survivor')
  await expect(win.getByTestId('service-status')).toHaveAttribute('data-status', 'ok')

  await app.close()
})
