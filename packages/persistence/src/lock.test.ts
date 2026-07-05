import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Interception point for the reclaim-race test: fires after every
// renameSync so a "racing winner" can land between our rename and
// the verify read-back. Null for every other test.
const renameHook = vi.hoisted(() => ({ after: null as ((to: string) => void) | null }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: (from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]) => {
      actual.renameSync(from, to)
      renameHook.after?.(String(to))
    },
  }
})
import { LOCK_FILENAME, ProjectLock, ProjectLockedError, type LockHolder } from './lock'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-lock-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ProjectLock', () => {
  it('refuses a second acquisition with a structured error', () => {
    const lock = ProjectLock.acquire(dir)
    try {
      expect(() => ProjectLock.acquire(dir)).toThrowError(ProjectLockedError)
      try {
        ProjectLock.acquire(dir)
      } catch (err) {
        const locked = err as ProjectLockedError
        expect(locked.code).toBe('PROJECT_LOCKED')
        expect(locked.holder.pid).toBe(process.pid)
      }
    } finally {
      lock.release()
    }
  })

  it('is acquirable again after release', () => {
    ProjectLock.acquire(dir).release()
    const again = ProjectLock.acquire(dir)
    again.release()
  })

  it('reclaims a stale lock', () => {
    const stale: LockHolder = {
      pid: 999999,
      hostname: 'ghost-host',
      token: 'dead-token',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(stale))
    const lock = ProjectLock.acquire(dir, { staleAfterMs: 30_000 })
    const holder = JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder
    expect(holder.pid).toBe(process.pid)
    lock.release()
  })

  it('reclaims a same-host lock whose holder pid is dead (AI-IMP-053)', () => {
    // A guaranteed-dead same-host pid: a child that already exited.
    const child = spawnSync(process.execPath, ['-e', ''])
    const corpse: LockHolder = {
      pid: child.pid!,
      hostname: hostname(),
      token: 'corpse-token',
      acquiredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(), // fresh heartbeat!
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(corpse))
    const lock = ProjectLock.acquire(dir)
    try {
      const holder = JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder
      expect(holder.pid).toBe(process.pid)
    } finally {
      lock.release()
    }
  })

  it('refuses when another racer wins the stale reclaim (AI-IMP-058)', () => {
    // Simulate the losing interleave: our rename lands, then the
    // racing winner's rename lands before the verify read-back.
    const stale: LockHolder = {
      pid: process.pid,
      hostname: hostname(),
      token: 'stale-token',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(stale))
    renameHook.after = (to) => {
      const winner: LockHolder = {
        pid: 424242,
        hostname: hostname(),
        token: 'racing-winner',
        acquiredAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      }
      writeFileSync(to, JSON.stringify(winner))
    }
    try {
      expect(() => ProjectLock.acquire(dir)).toThrowError(ProjectLockedError)
    } finally {
      renameHook.after = null
    }
  })

  it('respects a fresh foreign lock', () => {
    const fresh: LockHolder = {
      pid: 999999,
      hostname: 'other-host',
      token: 'live-token',
      acquiredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(fresh))
    expect(() => ProjectLock.acquire(dir)).toThrowError(ProjectLockedError)
  })

  it('refreshes the heartbeat', async () => {
    const lock = ProjectLock.acquire(dir, { heartbeatMs: 20 })
    const first = (JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder)
      .heartbeatAt
    await new Promise((resolve) => setTimeout(resolve, 80))
    const second = (JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder)
      .heartbeatAt
    lock.release()
    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first))
  })

  it('release does not remove a lock reclaimed by another holder', () => {
    const lock = ProjectLock.acquire(dir)
    const usurper: LockHolder = {
      pid: 4242,
      hostname: 'usurper',
      token: 'other-token',
      acquiredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(usurper))
    lock.release()
    const holder = JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder
    expect(holder.token).toBe('other-token')
  })
})
