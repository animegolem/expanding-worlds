import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IMPORT_TMP_DIR } from './import/store'
import { LOCK_FILENAME } from './lock'
import { createProject, DB_FILENAME } from './project'
import { openProjectService } from './service'

/**
 * CA-002 (AI-IMP-227) construction-guard faults. `openProjectService`
 * acquires the writable handle (lock + ticking heartbeat) BEFORE it
 * runs recovery, registers the API, and enqueues derivatives. Before
 * the guard, a throw in any of those steps leaked the handle: the
 * heartbeat kept refreshing the lock, so one recoverable startup fault
 * wedged the project until the utility died — a retry against the same
 * PID failed with ProjectLockedError.
 *
 * Each fault below drives a stage to throw, asserts the open throws
 * AND the lock file is gone (the guard closed the handle), then repairs
 * the cause and asserts a retry opens with NO ProjectLockedError.
 *
 * Recovery is faulted for real (an unreadable recovery artifact, per
 * the audit's probe). Migration and derivative-enqueue faults are
 * injected by module mock — the point under test is the guard, not the
 * fault — gated by a hoisted flag so setup and the retry run the real
 * implementation.
 */

const faults = vi.hoisted(() => ({ migrate: false, enqueue: false, dispatcher: false }))

vi.mock('./migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migrate')>()
  return {
    ...actual,
    migrate: (db: Parameters<typeof actual.migrate>[0]) => {
      if (faults.migrate) {
        faults.migrate = false
        throw new Error('injected migration failure')
      }
      return actual.migrate(db)
    },
  }
})

vi.mock('./import/derivatives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./import/derivatives')>()
  return {
    ...actual,
    enqueueMissingThumbnails: (
      ctx: Parameters<typeof actual.enqueueMissingThumbnails>[0],
      dir: string,
    ) => {
      if (faults.enqueue) {
        faults.enqueue = false
        throw new Error('injected derivative-enqueue failure')
      }
      return actual.enqueueMissingThumbnails(ctx, dir)
    },
  }
})

vi.mock('./dispatcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dispatcher')>()
  return {
    ...actual,
    Dispatcher: class extends actual.Dispatcher {
      constructor(...args: ConstructorParameters<typeof actual.Dispatcher>) {
        if (faults.dispatcher) {
          faults.dispatcher = false
          // Legal to throw before super() — nothing touches `this`.
          throw new Error('injected dispatcher failure')
        }
        super(...args)
      }
    },
  }
})

let dir: string

afterEach(() => {
  faults.migrate = false
  faults.enqueue = false
  faults.dispatcher = false
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function seedProject(): string {
  dir = mkdtempSync(join(tmpdir(), 'ew-ctor-guard-'))
  const projectDir = join(dir, 'p')
  const handle = createProject(projectDir, 'Guard Test')
  handle.close()
  return projectDir
}

/** The lock is released on a failed open iff no lock file remains. */
function lockPath(projectDir: string): string {
  return join(projectDir, LOCK_FILENAME)
}

describe('service construction guard (CA-002)', () => {
  it('recovery throw: unreadable artifact fails the open, repair reopens (no lock wedge)', () => {
    const projectDir = seedProject()

    // Plant an unreadable recovery artifact: the import-temp ROOT as a
    // file, so recovery's sweepImportTemp readdirSync throws ENOTDIR
    // after the handle (and its heartbeat) are live.
    const cacheParent = join(projectDir, IMPORT_TMP_DIR, '..')
    mkdirSync(cacheParent, { recursive: true })
    const tmpRoot = join(projectDir, IMPORT_TMP_DIR)
    writeFileSync(tmpRoot, 'not a directory')

    expect(() => openProjectService(projectDir)).toThrow()
    // The guard closed the handle: the lock file is gone, not left
    // refreshing under a live heartbeat.
    expect(existsSync(lockPath(projectDir))).toBe(false)

    // Repair the cause and retry — must NOT throw ProjectLockedError.
    rmSync(tmpRoot, { force: true })
    const service = openProjectService(projectDir)
    try {
      expect(service.recovery().integrityErrors).toEqual([])
      expect(service.query('getProject').ok).toBe(true)
    } finally {
      service.close()
    }
    expect(existsSync(join(projectDir, DB_FILENAME))).toBe(true)
  })

  it('migration throw: failed migrate releases the lock, retry reopens', () => {
    const projectDir = seedProject()

    faults.migrate = true
    expect(() => openProjectService(projectDir)).toThrow('injected migration failure')
    expect(existsSync(lockPath(projectDir))).toBe(false)

    const service = openProjectService(projectDir)
    try {
      expect(service.query('getProject').ok).toBe(true)
    } finally {
      service.close()
    }
  })

  it('derivative-enqueue throw: releases the lock, retry reopens', () => {
    const projectDir = seedProject()

    faults.enqueue = true
    expect(() => openProjectService(projectDir)).toThrow('injected derivative-enqueue failure')
    expect(existsSync(lockPath(projectDir))).toBe(false)

    const service = openProjectService(projectDir)
    try {
      expect(service.query('getProject').ok).toBe(true)
    } finally {
      service.close()
    }
  })

  it('post-acquire failure never leaves a stale lock across repeated retries', () => {
    // Two consecutive faulted opens must each release — a second wedge
    // would still surface as ProjectLockedError on the third attempt.
    const projectDir = seedProject()

    faults.migrate = true
    expect(() => openProjectService(projectDir)).toThrow()
    expect(existsSync(lockPath(projectDir))).toBe(false)

    faults.enqueue = true
    expect(() => openProjectService(projectDir)).toThrow()
    expect(existsSync(lockPath(projectDir))).toBe(false)

    const service = openProjectService(projectDir)
    try {
      expect(service.query('getProject').ok).toBe(true)
    } finally {
      service.close()
    }
  })

  it('read-only open: a construction throw still closes the Db (no lock is held)', () => {
    const projectDir = seedProject()

    // A read-only open holds no lock, so recovery and enqueue are
    // skipped; the Dispatcher is still constructed inside the guard.
    faults.dispatcher = true
    expect(() => openProjectService(projectDir, { readOnly: true })).toThrow(
      'injected dispatcher failure',
    )
    // No lock file was ever written for a read-only open.
    expect(existsSync(lockPath(projectDir))).toBe(false)

    // The Db handle was closed by the guard, so a fresh read-only open
    // succeeds.
    const service = openProjectService(projectDir, { readOnly: true })
    try {
      expect(service.readOnly).toBe(true)
      expect(service.query('getProject').ok).toBe(true)
    } finally {
      service.close()
    }
  })
})
