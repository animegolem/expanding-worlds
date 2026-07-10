import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCK_FILENAME, ProjectLock, ProjectLockedError, type LockHolder } from './lock'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-lock-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
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

  it('never evicts a live same-host holder on heartbeat age (AI-IMP-226)', () => {
    // A live same-host pid whose JS event loop stalled past the stale
    // window (a huge synchronous import, SIGSTOP) keeps a fresh acquirer
    // OUT — its SQLite handle is still open, so evicting it on heartbeat
    // age alone would split-brain the writer. Use THIS process's pid as
    // the "live" holder and an ancient heartbeat.
    const stalledButAlive: LockHolder = {
      pid: process.pid,
      hostname: hostname(),
      token: 'stalled-token',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(stalledButAlive))
    // staleAfterMs 0 makes the heartbeat maximally "stale"; the live
    // same-host pid must still be respected.
    expect(() => ProjectLock.acquire(dir, { staleAfterMs: 0 })).toThrowError(ProjectLockedError)
    const holder = JSON.parse(readFileSync(join(dir, LOCK_FILENAME), 'utf8')) as LockHolder
    expect(holder.token).toBe('stalled-token')
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
