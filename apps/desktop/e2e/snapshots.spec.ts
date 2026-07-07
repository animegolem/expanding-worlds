import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, seedPlacedNote } from './helpers'

/**
 * §11.4 session snapshots (AI-IMP-120): enabling the per-project
 * setting turns the project directory into a git repo whose history
 * gains one commit per checkpoint moment — project.sqlite (checkpointed
 * clean), assets/, and a readable notes/ tree. The empty-diff guard
 * suppresses a no-op checkpoint; the idle path commits in place without
 * closing the project.
 *
 * The snapshot moment is driven through the EW_TEST_HOOKS `test`
 * namespace (the same debug seam checkpoint/recovery use) so the spec
 * exercises the real flush→notes→checkpoint→commit path without waiting
 * on a power event; the idle path uses a shortened threshold constant
 * (EW_SNAPSHOT_IDLE_MS) rather than a ten-minute wait.
 */

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}

/** Commit count on HEAD, or 0 before the first commit / repo. */
function commitCount(dir: string): number {
  if (!existsSync(join(dir, '.git'))) return 0
  try {
    return Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
  } catch {
    return 0
  }
}

async function enableSnapshots(win: import('@playwright/test').Page): Promise<void> {
  await win.evaluate(() => window.ew.settings.setProject('snapshot_mode', 'commit'))
}

test('end session commits db + assets + notes, and the empty-diff guard suppresses a no-op', async () => {
  // Idle disabled for this test so the automatic timer can't slip an
  // extra commit between the explicit checkpoints.
  const { app, win, projectDir } = await launchApp('ew-e2e-snapshots-', {
    EW_TEST_HOOKS: '1',
    EW_SNAPSHOT_IDLE_MS: '600000',
  })
  try {
    await seedPlacedNote(win, 'First Note', 'body one', { x: 40, y: 60 })
    await enableSnapshots(win)

    // End-session snapshot → one commit containing the three payloads.
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(1)

    const tracked = git(projectDir, ['ls-tree', '-r', 'HEAD', '--name-only'])
    expect(tracked).toContain('project.sqlite')
    expect(tracked).toMatch(/notes\/First Note\.md/)

    // The WAL sidecar and the lock are ignored — never committed.
    expect(tracked).not.toContain('project.sqlite-wal')
    expect(tracked).not.toContain('project.lock')

    // A second checkpoint with nothing changed adds NO commit.
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(1)

    // A real change earns a new commit.
    await seedPlacedNote(win, 'Second Note', 'body two', { x: 120, y: 60 })
    await win.evaluate(() => window.ew.test.snapshot('end-session'))
    expect(commitCount(projectDir)).toBe(2)
    const latest = git(projectDir, ['log', '-1', '--pretty=%s'])
    expect(latest).toContain('end session')
  } finally {
    await app.close()
  }
})

test('idle checkpoint commits in place with a shortened threshold, project stays open', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-snapshots-idle-', {
    EW_TEST_HOOKS: '1',
    EW_SNAPSHOT_IDLE_MS: '400',
  })
  try {
    await enableSnapshots(win)
    // A committed change is activity: it arms the idle timer. With
    // nothing further happening, the idle checkpoint fires ~400ms later
    // and commits in place.
    await seedPlacedNote(win, 'Idle Note', 'drafted then left', { x: 40, y: 60 })

    await expect.poll(() => commitCount(projectDir), { timeout: 5000 }).toBeGreaterThan(0)
    const subject = git(projectDir, ['log', '-1', '--pretty=%s'])
    expect(subject).toContain('idle checkpoint')

    // The project never closed: it still answers queries and commits.
    const ok = await win.evaluate(async () => {
      const res = await window.ew.project.query('getProject')
      return res.ok
    })
    expect(ok).toBe(true)
  } finally {
    await app.close()
  }
})
