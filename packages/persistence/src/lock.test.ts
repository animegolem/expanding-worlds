import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCK_FILENAME,
  ProjectLock,
  ProjectLockedError,
  RECLAIM_GUARD_DIRNAME,
  type LockHolder,
} from './lock'

// The Windows runner can report EPERM from O_EXCL while a just-released
// handle drains. Inject that exact filesystem response once; every other
// write delegates to Node so this remains an integration-level lock test.
const faults = vi.hoisted(() => ({
  failNextExclusiveCreate: false,
  failAllExclusiveCreate: false,
  failAllGuardMkdir: false,
  failAllLockReads: false,
  failAllGuardStats: false,
  failNextLockUnlink: false,
  failAllLockUnlinks: false,
  failAllGuardRmdirs: false,
  lockUnlinkCalls: 0,
  guardRmdirCalls: 0,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      const [, , options] = args
      if ((faults.failNextExclusiveCreate || faults.failAllExclusiveCreate) && options?.flag === 'wx') {
        faults.failNextExclusiveCreate = false
        const err = new Error('injected transient O_EXCL failure') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return actual.writeFileSync(...args)
    },
    mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => {
      if (faults.failAllGuardMkdir && String(args[0]).endsWith('project.lock.reclaim')) {
        const err = new Error('injected persistent guard mkdir failure') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      return actual.mkdirSync(...args)
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (faults.failAllLockReads && String(args[0]).endsWith('project.lock')) {
        const err = new Error('injected persistent lock read denial') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      }
      return actual.readFileSync(...args)
    },
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      if (faults.failAllGuardStats && String(args[0]).endsWith('project.lock.reclaim')) {
        const err = new Error('injected persistent guard stat denial') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      }
      return actual.statSync(...args)
    },
    unlinkSync: (...args: Parameters<typeof actual.unlinkSync>) => {
      if (String(args[0]).endsWith('project.lock')) {
        faults.lockUnlinkCalls++
        if (faults.failNextLockUnlink || faults.failAllLockUnlinks) {
          faults.failNextLockUnlink = false
          const err = new Error('injected lock unlink failure') as NodeJS.ErrnoException
          err.code = 'EPERM'
          throw err
        }
      }
      return actual.unlinkSync(...args)
    },
    rmdirSync: (...args: Parameters<typeof actual.rmdirSync>) => {
      if (String(args[0]).endsWith('project.lock.reclaim')) {
        faults.guardRmdirCalls++
        if (faults.failAllGuardRmdirs) {
          const err = new Error('injected guard rmdir failure') as NodeJS.ErrnoException
          err.code = 'EPERM'
          throw err
        }
      }
      return actual.rmdirSync(...args)
    },
  }
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-lock-'))
})

afterEach(() => {
  faults.failNextExclusiveCreate = false
  faults.failAllExclusiveCreate = false
  faults.failAllGuardMkdir = false
  faults.failAllLockReads = false
  faults.failAllGuardStats = false
  faults.failNextLockUnlink = false
  faults.failAllLockUnlinks = false
  faults.failAllGuardRmdirs = false
  faults.lockUnlinkCalls = 0
  faults.guardRmdirCalls = 0
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

  it('retries a transient O_EXCL EPERM without claiming the path (AI-IMP-249)', () => {
    faults.failNextExclusiveCreate = true
    const lock = ProjectLock.acquire(dir)
    try {
      expect(existsSync(join(dir, LOCK_FILENAME))).toBe(true)
    } finally {
      lock.release()
    }
  })

  it('surfaces a PERSISTENT O_EXCL EPERM as itself, never a fabricated holder (AI-IMP-249 P2)', () => {
    faults.failAllExclusiveCreate = true
    let thrown: unknown
    try {
      ProjectLock.acquire(dir, { retryWindowMs: 200 })
    } catch (err) {
      thrown = err
    }
    // The honest diagnosis is the filesystem condition — NOT a
    // ProjectLockedError synthesized from our own token.
    expect((thrown as NodeJS.ErrnoException).code).toBe('EPERM')
    expect(thrown).not.toBeInstanceOf(ProjectLockedError)
  })

  it('surfaces a persistent guard-mkdir EPERM over a dead corpse as the error (AI-IMP-249 P2)', () => {
    // A reclaimable corpse exists, but the guard can never be taken:
    // the truth is the permission failure, not "locked by a dead pid".
    const corpse: LockHolder = {
      pid: 999999,
      hostname: hostname(),
      token: 'corpse-token',
      acquiredAt: new Date(0).toISOString(),
      heartbeatAt: new Date(0).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(corpse))
    faults.failAllGuardMkdir = true
    let thrown: unknown
    try {
      ProjectLock.acquire(dir, { retryWindowMs: 200 })
    } catch (err) {
      thrown = err
    }
    expect((thrown as NodeJS.ErrnoException).code).toBe('EPERM')
    expect(thrown).not.toBeInstanceOf(ProjectLockedError)
  })

  it('surfaces lock read denial without unlinking an old live holder (AI-IMP-264)', () => {
    const live: LockHolder = {
      pid: process.pid,
      hostname: hostname(),
      token: 'live-token',
      acquiredAt: new Date(0).toISOString(),
      heartbeatAt: new Date(0).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(live))
    faults.failAllLockReads = true

    expect(() => ProjectLock.acquire(dir, { retryWindowMs: 20 })).toThrowError(
      expect.objectContaining({ code: 'EACCES' }),
    )
    expect(faults.lockUnlinkCalls).toBe(0)
  })

  it('reclaims old parseable content only after validating its holder shape (AI-IMP-264)', () => {
    const lockPath = join(dir, LOCK_FILENAME)
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: hostname() }))
    const old = new Date(Date.now() - 2_000)
    utimesSync(lockPath, old, old)

    const lock = ProjectLock.acquire(dir, { retryWindowMs: 100 })
    try {
      const holder = JSON.parse(readFileSync(lockPath, 'utf8')) as LockHolder
      expect(holder.token).not.toBeUndefined()
    } finally {
      lock.release()
    }
  })

  it('never removes a reclaim guard whose age cannot be inspected (AI-IMP-264)', () => {
    const corpse: LockHolder = {
      pid: 999999,
      hostname: 'ghost-host',
      token: 'corpse-token',
      acquiredAt: new Date(0).toISOString(),
      heartbeatAt: new Date(0).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(corpse))
    mkdirSync(join(dir, RECLAIM_GUARD_DIRNAME))
    faults.failAllGuardStats = true

    expect(() => ProjectLock.acquire(dir, { staleAfterMs: 0, retryWindowMs: 20 })).toThrowError(
      expect.objectContaining({ code: 'EACCES' }),
    )
    expect(faults.guardRmdirCalls).toBe(0)
  })

  it('retries transient release removal and remains retryable after persistence (AI-IMP-264)', () => {
    const transient = ProjectLock.acquire(dir)
    faults.failNextLockUnlink = true
    transient.release()
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(false)

    const persistent = ProjectLock.acquire(dir)
    faults.failAllLockUnlinks = true
    expect(() => persistent.release()).toThrowError(expect.objectContaining({ code: 'EPERM' }))
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(true)
    faults.failAllLockUnlinks = false
    persistent.release()
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(false)
  })

  it('keeps release retryable when holder verification is denied (AI-IMP-264)', () => {
    const lock = ProjectLock.acquire(dir)
    faults.failAllLockReads = true
    expect(() => lock.release()).toThrowError(expect.objectContaining({ code: 'EACCES' }))
    expect(faults.lockUnlinkCalls).toBe(0)
    faults.failAllLockReads = false
    lock.release()
    expect(existsSync(join(dir, LOCK_FILENAME))).toBe(false)
  })

  it('surfaces heartbeat holder-read denial instead of silently stopping (AI-IMP-264)', () => {
    vi.useFakeTimers()
    const lock = ProjectLock.acquire(dir, { heartbeatMs: 20 })
    try {
      faults.failAllLockReads = true
      expect(() => vi.advanceTimersByTime(20)).toThrowError(
        expect.objectContaining({ code: 'EACCES' }),
      )
    } finally {
      faults.failAllLockReads = false
      lock.release()
      vi.useRealTimers()
    }
  })

  it('surfaces exhausted reclaim-guard removal instead of fabricating contention (AI-IMP-264)', () => {
    const corpse: LockHolder = {
      pid: 999999,
      hostname: 'ghost-host',
      token: 'corpse-token',
      acquiredAt: new Date(0).toISOString(),
      heartbeatAt: new Date(0).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(corpse))
    faults.failAllGuardRmdirs = true

    expect(() => ProjectLock.acquire(dir, { staleAfterMs: 0, retryWindowMs: 20 })).toThrowError(
      expect.objectContaining({ code: 'EPERM' }),
    )
    expect(faults.guardRmdirCalls).toBe(5)
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

  it('outlives a leaked reclaim guard before reclaiming its corpse (AI-IMP-249)', () => {
    const corpse: LockHolder = {
      pid: 999999,
      hostname: 'ghost-host',
      token: 'corpse-token',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
    }
    writeFileSync(join(dir, LOCK_FILENAME), JSON.stringify(corpse))

    // Simulate a reclaimer that crashed after taking the guard. At eight
    // seconds old it is still protected, but the old 200-attempt loop gave
    // up in at most 1.2 seconds and stranded every contender.
    const guardPath = join(dir, RECLAIM_GUARD_DIRNAME)
    mkdirSync(guardPath)
    const guardTime = new Date(Date.now() - 8_000)
    utimesSync(guardPath, guardTime, guardTime)

    const startedAt = Date.now()
    const lock = ProjectLock.acquire(dir, { staleAfterMs: 0 })
    try {
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000)
      expect(existsSync(guardPath)).toBe(false)
    } finally {
      lock.release()
    }
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
