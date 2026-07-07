import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, seedPlacedNote } from './helpers'

/**
 * §11.4 remote push (AI-IMP-122): the `commit-push` snapshot variant
 * targets a user-configured remote as an Advanced setting, off by
 * default. Every snapshot commits LOCALLY and then pushes in the
 * background — the session ritual (driven here through the EW_TEST_HOOKS
 * `test:snapshot` seam, exactly as snapshots.spec drives it) resolves on
 * the local commit and NEVER waits on the network. A dead remote leaves
 * the commit intact, raises ONE failure toast per episode, and shows the
 * unpushed-snapshot debt on the §8.6 perch; the next snapshot retries,
 * and a restored remote clears the debt.
 *
 * The remote is a local bare repository (git init --bare) in the OS temp
 * dir — no network, no credentials. Push landing is asynchronous, so the
 * bare repo's ref count is polled rather than read once.
 */

/** Commit count on a ref in a bare repo (git --git-dir), or 0 when the
 * ref does not exist yet (nothing pushed). */
function bareRefCount(gitDir: string, ref: string): number {
  try {
    return Number(
      execFileSync('git', [`--git-dir=${gitDir}`, 'rev-list', '--count', ref], {
        encoding: 'utf8',
      }).trim(),
    )
  } catch {
    return 0
  }
}

/** Commit count on the working project's HEAD, or 0 before any commit. */
function commitCount(dir: string): number {
  if (!existsSync(join(dir, '.git'))) return 0
  try {
    return Number(
      execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(),
    )
  } catch {
    return 0
  }
}

test('commit-push pushes to a remote; a broken remote keeps the ritual intact with visible debt; restoring clears it', async () => {
  const remoteHome = mkdtempSync(join(tmpdir(), 'ew-e2e-push-remote-'))
  const bare = join(remoteHome, 'backup.git')
  const bareMoved = join(remoteHome, 'backup-moved.git')
  execFileSync('git', ['init', '--bare', '-q', bare])

  // Idle disabled so the timer can't slip an unexpected extra push.
  const { app, win, projectDir } = await launchApp('ew-e2e-push-', {
    EW_TEST_HOOKS: '1',
    EW_SNAPSHOT_IDLE_MS: '600000',
  })
  try {
    await seedPlacedNote(win, 'Note A', 'a', { x: 40, y: 60 })
    // Deliberate opt-in: commit-push mode AND a remote URL. Only now is
    // anything network-shaped in play (§11.5 constitution).
    await win.evaluate(async (url) => {
      await window.ew.settings.setProject('snapshot_mode', 'commit-push')
      await window.ew.settings.setProject('snapshot_remote', url)
    }, bare)

    // First snapshot: commits locally, then pushes in the background.
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(1)
    await expect.poll(() => bareRefCount(bare, 'main'), { timeout: 15000 }).toBe(1)
    // Reconciled: the ongoing-push perch clears (no debt condition).
    await expect(win.getByTestId('perch')).toBeHidden()

    // Break the remote: move it out from under the configured URL.
    renameSync(bare, bareMoved)
    await seedPlacedNote(win, 'Note B', 'b', { x: 120, y: 60 })
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    // The ritual completed and the commit landed LOCALLY despite the
    // dead network — the push failure never blocked it.
    expect(commitCount(projectDir)).toBe(2)

    // One failure toast, and the perch carries the unpushed debt.
    await expect(win.getByTestId('snapshot-push')).toBeVisible()
    await expect(win.getByTestId('perch')).toBeVisible()
    await win.getByTestId('perch').click()
    await expect(win.getByTestId('perch-panel')).toContainText('1 snapshot')
    await expect(win.getByTestId('perch-panel')).toContainText('not backed up')
    await win.keyboard.press('Escape')

    // One toast per EPISODE, not per retry: dismiss it, drive another
    // failing snapshot, and confirm no new toast is raised while the
    // debt (now 2) still grows on the perch.
    await win.getByTestId('snapshot-push').getByTestId('toast-dismiss').click()
    await expect(win.getByTestId('snapshot-push')).toBeHidden()

    await seedPlacedNote(win, 'Note C', 'c', { x: 200, y: 60 })
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(3)
    await win.getByTestId('perch').click()
    await expect(win.getByTestId('perch-panel')).toContainText('2 snapshot')
    await expect(win.getByTestId('snapshot-push')).toBeHidden()
    await win.keyboard.press('Escape')

    // Restore the remote: the NEXT snapshot retries and clears the debt,
    // pushing every pending commit (no new note needed — a push is
    // scheduled even when the snapshot itself is a no-op).
    renameSync(bareMoved, bare)
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    await expect.poll(() => bareRefCount(bare, 'main'), { timeout: 15000 }).toBe(3)
    await expect(win.getByTestId('perch')).toBeHidden()
  } finally {
    await app.close()
    rmSync(remoteHome, { recursive: true, force: true })
  }
})
