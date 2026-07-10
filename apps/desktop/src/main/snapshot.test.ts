import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRequest, ProjectResponse } from '@ew/protocol'
import { createSnapshotEngine, type SnapshotEngine } from './snapshot'

/**
 * §11.4 snapshot engine (AI-IMP-120/121): the restore mechanics and the
 * stale-index.lock sweep exercised directly against real `git` (the
 * engine IS system git — a mock would test nothing). The utility round-
 * trips are stubbed: getSettings reports snapshots ON, and the notes-
 * tree / WAL-checkpoint delegations succeed without touching disk, so a
 * commit picks up whatever files the test wrote into the project dir.
 */

// A believable project.sqlite: the 16-byte SQLite header magic
// (extractedDbOpens checks it) plus a version marker so a restored copy
// is distinguishable from the current one.
function writeDb(dir: string, marker: string): void {
  const header = Buffer.from('SQLite format 3\u0000', 'latin1')
  writeFileSync(join(dir, 'project.sqlite'), Buffer.concat([header, Buffer.from(marker)]))
}

function commitCount(dir: string): number {
  if (!existsSync(join(dir, '.git'))) return 0
  try {
    return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir }).toString().trim())
  } catch {
    return 0
  }
}

const stubCallUtility = async (req: ProjectRequest): Promise<ProjectResponse> => {
  switch (req.type) {
    case 'run-query':
      return { type: 'run-query', ok: true, result: { snapshot_mode: 'commit' } } as ProjectResponse
    case 'snapshot-write-notes':
      return { type: 'snapshot-write-notes', ok: true, notes: 0, assets: 0 }
    case 'checkpoint-wal':
      return { type: 'checkpoint-wal', ok: true }
    default:
      return { type: req.type, ok: true } as ProjectResponse
  }
}

describe('snapshot engine (AI-IMP-121)', () => {
  let base: string
  let projectDir: string
  let engine: SnapshotEngine

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ew-snap-'))
    projectDir = join(base, 'proj')
    mkdirSync(projectDir, { recursive: true })
    engine = createSnapshotEngine({
      callUtility: stubCallUtility,
      flushRenderers: () => Promise.resolve(),
      projectDir: () => projectDir,
    })
  })

  afterEach(() => {
    engine.dispose()
    rmSync(base, { recursive: true, force: true })
  })

  it('recovers a wedged repo by sweeping an AGED .git/index.lock (AI-IMP-218)', async () => {
    writeDb(projectDir, 'ONE')
    await engine.runSnapshot('end-session')
    expect(commitCount(projectDir)).toBe(1)

    // Simulate a quit that abandoned an in-flight commit: an orphaned
    // index.lock, backdated well past STALE_LOCK_MS (~10 min) so the
    // age-gate treats it as the orphan it is.
    const lock = join(projectDir, '.git', 'index.lock')
    writeFileSync(lock, '')
    const aged = new Date(Date.now() - 20 * 60 * 1000)
    utimesSync(lock, aged, aged)

    // The next snapshot must sweep the aged lock and still commit.
    writeDb(projectDir, 'TWO')
    await engine.runSnapshot('end-session')
    expect(existsSync(lock)).toBe(false)
    expect(commitCount(projectDir)).toBe(2)
  })

  it('defers the snapshot when a FRESH index.lock is present (AI-IMP-218)', async () => {
    writeDb(projectDir, 'ONE')
    await engine.runSnapshot('end-session')
    expect(commitCount(projectDir)).toBe(1)

    // A fresh lock stands in for a LIVE external git operation. The
    // age-gate must NOT touch it, and must skip the commit this episode.
    const lock = join(projectDir, '.git', 'index.lock')
    writeFileSync(lock, '')

    writeDb(projectDir, 'TWO')
    await engine.runSnapshot('end-session')
    // The lock is untouched and no new commit was recorded — the change
    // rides the next (retry) episode once the lock ages out.
    expect(existsSync(lock)).toBe(true)
    expect(commitCount(projectDir)).toBe(1)
  })

  it('commits only the allowlist — strays and export staging stay out (AI-IMP-223)', async () => {
    writeDb(projectDir, 'ONE')
    // Legitimate managed contents.
    mkdirSync(join(projectDir, 'notes'), { recursive: true })
    writeFileSync(join(projectDir, 'notes', 'a.md'), '# note a')
    mkdirSync(join(projectDir, 'assets', 'ab'), { recursive: true })
    writeFileSync(join(projectDir, 'assets', 'ab', 'abdeadbeef'), 'blob')
    // A stray file and a stand-in for an in-project export staging dir —
    // `git add -A` would have swept both into the backup.
    writeFileSync(join(projectDir, 'stray.txt'), 'do not commit me')
    mkdirSync(join(projectDir, '.tmp-export'), { recursive: true })
    writeFileSync(join(projectDir, '.tmp-export', 'project.sqlite'), 'frozen copy')

    await engine.runSnapshot('end-session')
    expect(commitCount(projectDir)).toBe(1)

    const tracked = execFileSync('git', ['ls-files'], { cwd: projectDir }).toString().split('\n')
    expect(tracked).toContain('project.sqlite')
    expect(tracked).toContain('notes/a.md')
    expect(tracked).toContain('assets/ab/abdeadbeef')
    expect(tracked).toContain('.gitignore')
    // The stray and the staging copy are absent from history.
    expect(tracked).not.toContain('stray.txt')
    expect(tracked.some((p) => p.startsWith('.tmp-export/'))).toBe(false)
  })

  it('migrates an existing v1 managed .gitignore to v2 in place (AI-IMP-223)', () => {
    // A user-authored line plus the OLD v1 managed block (no sentinels).
    const v1 = `# my own ignores
build/

# Expanding Worlds — session snapshots (RFC-0001 §11.4)
# The single-writer lock + heartbeat.
project.lock
# SQLite sidecars: the WAL is truncated into project.sqlite at every
# snapshot, so only the sealed .sqlite is committed.
project.sqlite-wal
project.sqlite-shm
project.sqlite-journal
# Regenerable — thumbnails rebuild lazily, staging is transient.
derivatives/
cache/
`
    const path = join(projectDir, '.gitignore')
    writeFileSync(path, v1, 'utf8')

    engine.seedGitignore(projectDir)
    const migrated = readFileSync(path, 'utf8')
    // The user's own lines survive; the block is now the versioned v2.
    expect(migrated).toContain('# my own ignores')
    expect(migrated).toContain('build/')
    expect(migrated).toContain('(managed v2)')
    // No duplicated managed block, and the old unversioned first line is
    // gone (replaced by the sentinel form).
    expect(migrated.match(/project\.lock/g)!.length).toBe(1)
    expect(migrated).not.toContain('session snapshots (RFC-0001 §11.4)')

    // Idempotent: a second seed against the v2 file changes nothing.
    engine.seedGitignore(projectDir)
    expect(readFileSync(path, 'utf8')).toBe(migrated)
  })

  it('lists snapshots newest-first and restores one to a sibling directory', async () => {
    // A committed second file must live under the allowlist (a top-level
    // stray is no longer committed — AI-IMP-223); notes/ is committed.
    mkdirSync(join(projectDir, 'notes'), { recursive: true })
    writeDb(projectDir, 'ONE')
    writeFileSync(join(projectDir, 'notes', 'marker.md'), 'first')
    await engine.runSnapshot('end-session')

    writeDb(projectDir, 'TWO')
    writeFileSync(join(projectDir, 'notes', 'marker.md'), 'second')
    await engine.runSnapshot('end-session')

    const list = await engine.listSnapshots()
    expect(list).toHaveLength(2)
    // Newest first: entry[0] is the second commit.
    expect(list[0]!.message).toContain('end session')
    expect(list[0]!.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const older = list[list.length - 1]!

    // Capture the source's current state to prove restore never writes it.
    const srcDbPath = join(projectDir, 'project.sqlite')
    const srcBefore = readFileSync(srcDbPath)
    const srcMtimeBefore = statSync(srcDbPath).mtimeMs

    const result = await engine.restore(older.sha)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The restored copy is a SIBLING of the source, not inside it.
    expect(dirname(result.dir)).toBe(dirname(projectDir))
    // Never nested INSIDE the source project directory.
    expect(result.dir.startsWith(projectDir + sep)).toBe(false)

    // It holds the OLDER snapshot's content.
    expect(readFileSync(join(result.dir, 'project.sqlite')).toString('latin1')).toContain('ONE')
    expect(readFileSync(join(result.dir, 'notes', 'marker.md')).toString()).toBe('first')

    // The source project is byte-for-byte and mtime untouched.
    expect(readFileSync(srcDbPath).equals(srcBefore)).toBe(true)
    expect(statSync(srcDbPath).mtimeMs).toBe(srcMtimeBefore)
    // ...and still reflects the NEWER content.
    expect(srcBefore.toString('latin1')).toContain('TWO')
  })

  it('collision-suffixes a second restore of the same day', async () => {
    writeDb(projectDir, 'ONE')
    await engine.runSnapshot('end-session')
    const [entry] = await engine.listSnapshots()

    const first = await engine.restore(entry!.sha)
    const second = await engine.restore(entry!.sha)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.dir).not.toBe(first.dir)
    expect(second.dir).toMatch(/ \(2\)$/)
    expect(existsSync(join(first.dir, 'project.sqlite'))).toBe(true)
    expect(existsSync(join(second.dir, 'project.sqlite'))).toBe(true)
  })

  it('returns an empty list when there is no repository yet', async () => {
    expect(await engine.listSnapshots()).toEqual([])
  })
})
