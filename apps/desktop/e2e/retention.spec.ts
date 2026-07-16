import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { openAppMenu, exec, launchApp, launchAppInDir, runQuery } from './helpers'

test('retention purges on reopen, reports in the perch, and links back to Trash', async () => {
  const first = await launchApp('ew-e2e-retention-')
  const oldNoteId = crypto.randomUUID()
  const freshNoteId = crypto.randomUUID()

  await exec(first.win, 'CreateNote', { noteId: oldNoteId, title: 'Old ash' })
  await exec(first.win, 'CreateNote', { noteId: freshNoteId, title: 'Fresh ash' })
  await exec(first.win, 'TrashNote', { noteId: oldNoteId })
  await exec(first.win, 'TrashNote', { noteId: freshNoteId })

  await openAppMenu(first.win)
  await first.win.getByTestId('menu-trash').click()
  await first.win.getByTestId('trash-retention-30d').click()
  await expect(first.win.getByTestId('trash-retention-promise')).toContainText(
    'or 30 days pass, per your setting',
  )
  await first.app.close()

  // Closed-project test seam: age exactly one Trash row without adding a
  // production-only backdating capability to the renderer/utility API.
  const db = new DatabaseSync(join(first.projectDir, 'project.sqlite'))
  db.prepare('UPDATE note SET trashed_at = ? WHERE id = ?').run(
    '2026-01-01T00:00:00.000Z',
    oldNoteId,
  )
  db.close()

  const second = await launchAppInDir(first.projectDir)
  try {
    await expect(second.win.getByTestId('perch')).toBeVisible()
    await second.win.getByTestId('perch').click()
    await expect(second.win.getByTestId('perch-condition')).toContainText(
      '1 item left trash after 30 days',
    )
    await second.win.getByTestId('retention-open-trash').click()
    await expect(second.win.getByTestId('takeover-trash')).toBeVisible()
    await expect(second.win.getByTestId('trash-row')).toHaveCount(1)
    expect(await runQuery(second.win, 'getNote', { noteId: oldNoteId })).toBeNull()
    expect(await runQuery(second.win, 'getNote', { noteId: freshNoteId })).toMatchObject({
      lifecycleState: 'trashed',
    })

    // Takeover chrome retires the mode rail (including its status perch).
    // Close Trash first, then dismiss the still-live condition when the rail
    // returns; do not reach through the takeover for retired furniture.
    await second.win.getByTestId('takeover-close').click()
    await expect(second.win.getByTestId('takeover-trash')).toHaveCount(0)
    await expect(second.win.getByTestId('perch')).toBeVisible()
    await second.win.getByTestId('perch').click()
    await second.win.getByTestId('dismiss-trash-retention').click()
    await expect(second.win.getByTestId('perch')).toHaveCount(0)
  } finally {
    await second.app.close()
  }
})
