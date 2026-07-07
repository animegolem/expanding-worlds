import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, launchAppInDir, runQuery, seedPlacedNote } from './helpers'

/**
 * §11.4 restore-from-backup (AI-IMP-121, rev 0.52): Restore from backup…
 * lists the project's dated snapshots and materializes a chosen one as a
 * NEW sibling project directory — never in-place. Destroy-nothing applies
 * to time travel: the current project is byte-untouched throughout, and
 * the restored copy opens as an ordinary project whose content is the
 * chosen snapshot (§11.2 recovery rebuilds derivatives lazily).
 *
 * Snapshot moments ride the same EW_TEST_HOOKS `test:snapshot` seam as
 * snapshots.spec.ts; idle is disabled so the timer can't slip an extra
 * commit between the explicit checkpoints.
 */

function commitCount(dir: string): number {
  if (!existsSync(join(dir, '.git'))) return 0
  try {
    return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir }).toString().trim())
  } catch {
    return 0
  }
}

async function enableSnapshots(win: import('@playwright/test').Page): Promise<void> {
  await win.evaluate(() => window.ew.settings.setProject('snapshot_mode', 'commit'))
}

const NO_IDLE = { EW_TEST_HOOKS: '1', EW_SNAPSHOT_IDLE_MS: '600000' }

test('restores an older snapshot to a new sibling directory, leaving the original untouched', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-restore-', NO_IDLE)
  let restoredDir = ''
  try {
    // Commit 1: First Note only.
    await seedPlacedNote(win, 'First Note', 'body one', { x: 40, y: 60 })
    await enableSnapshots(win)
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    // Commit 2: First + Second Note.
    await seedPlacedNote(win, 'Second Note', 'body two', { x: 120, y: 60 })
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(2)

    // Capture the original db to prove restore never writes the source.
    const dbPath = join(projectDir, 'project.sqlite')
    const before = readFileSync(dbPath)
    const mtimeBefore = statSync(dbPath).mtimeMs

    // List (newest-first) and restore the OLDER snapshot via the bridge.
    const list = await win.evaluate(() => window.ew.snapshot.list())
    expect(list).toHaveLength(2)
    const older = list[list.length - 1]!
    const result = await win.evaluate((sha) => window.ew.snapshot.restore(sha), older.sha)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    restoredDir = result.dir

    // The restored copy is a SIBLING of the original, not nested in it.
    expect(dirname(restoredDir)).toBe(dirname(projectDir))
    expect(existsSync(join(restoredDir, 'project.sqlite'))).toBe(true)

    // The original project is byte-for-byte and mtime untouched.
    expect(readFileSync(dbPath).equals(before)).toBe(true)
    expect(statSync(dbPath).mtimeMs).toBe(mtimeBefore)
  } finally {
    await app.close()
  }

  // The restored directory opens as a real project holding the OLDER
  // snapshot's content: First Note present, Second Note absent.
  const restored = await launchAppInDir(restoredDir, NO_IDLE)
  try {
    const titles = await runQuery<Array<{ title: string }>>(restored.win, 'listNoteTitles')
    const names = titles.map((t) => t.title)
    expect(names).toContain('First Note')
    expect(names).not.toContain('Second Note')
  } finally {
    await restored.app.close()
  }
})

test('the ☰ row gates on history and drives the picker to a restored copy', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-restore-ui-', NO_IDLE)
  try {
    // Fresh project, snapshots off: the row is visible but disabled.
    await win.getByTestId('charm-menu').click()
    await expect(win.getByTestId('menu-restore')).toHaveAttribute('aria-disabled', 'true')
    await win.keyboard.press('Escape')

    // Record two snapshots, then the row goes live.
    await seedPlacedNote(win, 'Alpha', 'a', { x: 40, y: 60 })
    await enableSnapshots(win)
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    await seedPlacedNote(win, 'Beta', 'b', { x: 120, y: 60 })
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(2)

    await win.getByTestId('charm-menu').click()
    await expect(win.getByTestId('menu-restore')).not.toHaveAttribute('aria-disabled', 'true')
    await win.getByTestId('menu-restore').click()

    // The picker is a dialog listing both dated snapshots.
    await expect(win.getByTestId('restore-dialog')).toBeVisible()
    await expect(win.getByTestId('restore-row')).toHaveCount(2)

    // Pick the oldest (rows are newest-first), confirm, and land on the
    // success state naming the created directory.
    await win.getByTestId('restore-row').last().click()
    await expect(win.getByTestId('restore-confirm')).toBeVisible()
    await win.getByTestId('restore-confirm-accept').click()
    await expect(win.getByTestId('restore-success')).toBeVisible()
    await expect(win.getByTestId('restore-path')).toContainText('-restored-')
    await expect(win.getByTestId('restore-open')).toBeVisible()
  } finally {
    await app.close()
  }
})
