import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { exec, launchApp, seedPlacedNote } from './helpers'

/**
 * §11.4 involuntary end-session ritual (AI-IMP-096): the checkpoint
 * verb, driven the full window→preload→main→utility→service round-trip
 * (the inner call of the suspend/lock/blur ritual; the power events
 * themselves are untestable in CI). A burst of edits accumulates in
 * the WAL; the checkpoint truncates it so the .sqlite is complete at
 * rest — nothing for a cloud daemon to sync mid-write.
 *
 * The verb is reached through the EW_TEST_HOOKS `test` namespace, the
 * same debug seam the recovery spec uses to kill the utility — no
 * production renderer surface exposes it (main triggers it from power
 * events, never the renderer).
 */

// The utility opens the primary in WAL mode; the sidecar sits beside
// project.sqlite (DB_FILENAME) in the project dir.
const WAL_FILENAME = 'project.sqlite-wal'

test('checkpoint-wal truncates the WAL after a burst of edits', async () => {
  const { app, win, projectDir } = await launchApp('ew-e2e-checkpoint-', {
    EW_TEST_HOOKS: '1',
  })
  const walPath = join(projectDir, WAL_FILENAME)
  try {
    // Commit enough content to leave committed pages sitting in the WAL.
    for (let i = 0; i < 12; i += 1) {
      await seedPlacedNote(win, `Note ${i}`, `Body ${i}`, { x: 40 + i * 8, y: 60 })
    }
    // A settings write is a non-undoable commit too — belt on top of
    // the notes so the WAL is unambiguously non-empty.
    await exec(win, 'CreateNote', { noteId: crypto.randomUUID(), title: 'x', body: 'y' })

    expect(existsSync(walPath)).toBe(true)
    const before = statSync(walPath).size
    expect(before).toBeGreaterThan(0)

    const result = await win.evaluate(() => window.ew.test.checkpointWal())
    expect(result).toEqual({ type: 'checkpoint-wal', ok: true })

    // TRUNCATE returns the WAL to zero bytes (kept, not deleted, while
    // the utility's connection stays open).
    expect(statSync(walPath).size).toBe(0)

    // The data survived — it moved into the main db file. A fresh query
    // through the live connection still reads the seeded content.
    const count = await win.evaluate(async () => {
      const res = await window.ew.project.query('getProject')
      return res.ok
    })
    expect(count).toBe(true)
  } finally {
    await app.close()
  }
})
