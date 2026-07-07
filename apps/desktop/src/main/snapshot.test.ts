import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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

  it('recovers a wedged repo by sweeping a stale .git/index.lock', async () => {
    writeDb(projectDir, 'ONE')
    await engine.runSnapshot('end-session')
    expect(commitCount(projectDir)).toBe(1)

    // Simulate a quit that abandoned an in-flight commit: an orphaned
    // index.lock that would make every later `git add` fail.
    const lock = join(projectDir, '.git', 'index.lock')
    writeFileSync(lock, '')
    expect(existsSync(lock)).toBe(true)

    // The next snapshot must sweep the stale lock and still commit.
    writeDb(projectDir, 'TWO')
    await engine.runSnapshot('end-session')
    expect(existsSync(lock)).toBe(false)
    expect(commitCount(projectDir)).toBe(2)
  })

  it('lists snapshots newest-first and restores one to a sibling directory', async () => {
    writeDb(projectDir, 'ONE')
    writeFileSync(join(projectDir, 'marker.txt'), 'first')
    await engine.runSnapshot('end-session')

    writeDb(projectDir, 'TWO')
    writeFileSync(join(projectDir, 'marker.txt'), 'second')
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
    expect(readFileSync(join(result.dir, 'marker.txt')).toString()).toBe('first')

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
