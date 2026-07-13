/**
 * AI-IMP-260: the loose-note exit. A note with no placement had NO
 * delete affordance anywhere — TrashNote existed with zero
 * dispatchers. Now the outline's loose bin row and the panel's
 * unfolded "0 places" list both offer Trash. TrashNote is undo-EXEMPT
 * (AI-IMP-233 trash-is-recovery-home), so the round trip is
 * trash → restore FROM THE TRASH VIEW → loose again.
 */
import { test, expect } from '@playwright/test'
import { openAppMenu, launchApp, exec, runQuery } from './helpers'

async function seedLooseNote(
  win: import('@playwright/test').Page,
  title: string,
): Promise<string> {
  const noteId = crypto.randomUUID()
  await exec(win, 'CreateNote', { noteId, title, body: 'loose body' })
  return noteId
}

test('outline loose bin: Trash removes the row; Trash-view restore returns it loose (AI-IMP-260)', async () => {
  const { app, win } = await launchApp('ew-e2e-loose-trash-')
  await seedLooseNote(win, 'Stray thought')

  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('outline-view')).toBeVisible()
  const row = win.getByTestId('loose-note-row')
  await expect(row).toHaveCount(1)

  // Row actions reveal on hover; Trash dispatches the existing verb.
  await row.hover()
  await row.getByTestId('outline-trash-note').click()
  await expect(win.getByTestId('loose-note-row')).toHaveCount(0)

  // Recovery home is the TRASH VIEW, not Mod+Z (AI-IMP-233 exempt).
  const trashed = await runQuery<{ notes: Array<{ id: string }> }>(win, 'getTrashView')
  expect(trashed.notes).toHaveLength(1)

  // Restore through the trash takeover; the note returns LOOSE.
  await openAppMenu(win)
  await win.getByTestId('menu-trash').click()
  await expect(win.getByTestId('takeover-trash')).toBeVisible()
  const trashRow = win.locator('[data-testid="trash-row"][data-kind="note"]')
  await expect(trashRow).toHaveCount(1)
  await trashRow.getByTestId('trash-restore').click()
  await expect(win.getByTestId('trash-row')).toHaveCount(0)

  await win.getByTestId('charm-outline').click()
  await expect(win.getByTestId('loose-note-row')).toHaveCount(1)
  await expect(win.getByTestId('loose-note-row')).toContainText('Stray thought')
  await app.close()
})

test('note panel: a loose note offers Trash under its empty uses list; a placed note does not (AI-IMP-260)', async () => {
  const { app, win } = await launchApp('ew-e2e-loose-trash-panel-')
  const noteId = await seedLooseNote(win, 'Panel stray')

  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, noteId)
  await expect(win.getByTestId('note-pane')).toBeVisible()

  // The exit lives where the looseness shows: the unfolded "⌖ 0" list.
  await expect(win.getByTestId('uses-toggle')).toContainText('⌖ 0')
  await win.getByTestId('uses-toggle').click()
  await win.getByTestId('panel-trash-note').click()

  // The panel closes through the ordinary path and the note is trashed.
  await expect(win.getByTestId('note-pane')).toBeHidden()
  const trashed = await runQuery<{ notes: Array<{ id: string }> }>(win, 'getTrashView')
  expect(trashed.notes.map((note) => note.id)).toEqual([noteId])

  // A PLACED note's uses list offers no trash row (1 place ≠ loose).
  const placedId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNote', { noteId: placedId, title: 'Placed one', body: 'x' })
  await exec(win, 'CreatePin', {
    nodeId: crypto.randomUUID(),
    canvasId,
    placementId: crypto.randomUUID(),
    x: 200,
    y: 200,
    appearance: { kind: 'dot', color: '#ff7700' },
    note: { kind: 'attach', noteId: placedId },
  })
  await win.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('ew-open-note', { detail: { noteId: id } }))
  }, placedId)
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await expect(win.getByTestId('uses-toggle')).toContainText('⌖ 1')
  await win.getByTestId('uses-toggle').click()
  await expect(win.getByTestId('panel-trash-note')).toHaveCount(0)
  await app.close()
})
