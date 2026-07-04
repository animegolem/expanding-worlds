import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

/**
 * Single-writer project lock per RFC-0001 §11.1: at most one
 * authoritative writer service per project directory. A JSON lock
 * file beside project.sqlite carries holder identity and a heartbeat;
 * a heartbeat older than staleAfterMs marks a crashed holder and the
 * lock may be reclaimed. Two processes racing a stale reclaim resolve
 * by atomic rename (last writer wins) — acceptable for Phase 1 since
 * reclaim only follows a crash.
 */

export const LOCK_FILENAME = 'project.lock'

export interface LockHolder {
  pid: number
  hostname: string
  token: string
  acquiredAt: string
  heartbeatAt: string
}

export class ProjectLockedError extends Error {
  readonly code = 'PROJECT_LOCKED'
  constructor(readonly holder: LockHolder) {
    super(
      `project is locked by pid ${holder.pid} on ${holder.hostname} ` +
        `(heartbeat ${holder.heartbeatAt})`,
    )
    this.name = 'ProjectLockedError'
  }
}

export interface LockOptions {
  heartbeatMs?: number
  staleAfterMs?: number
}

export class ProjectLock {
  #path: string
  #token: string
  #timer: ReturnType<typeof setInterval> | null = null
  #released = false

  private constructor(path: string, token: string, heartbeatMs: number) {
    this.#path = path
    this.#token = token
    this.#timer = setInterval(() => this.#beat(), heartbeatMs)
    this.#timer.unref?.()
  }

  static acquire(projectDir: string, options: LockOptions = {}): ProjectLock {
    const heartbeatMs = options.heartbeatMs ?? 5_000
    const staleAfterMs = options.staleAfterMs ?? 30_000
    const path = join(projectDir, LOCK_FILENAME)
    const token = crypto.randomUUID()
    const now = new Date().toISOString()
    const payload: LockHolder = {
      pid: process.pid,
      hostname: hostname(),
      token,
      acquiredAt: now,
      heartbeatAt: now,
    }

    try {
      writeFileSync(path, JSON.stringify(payload), { flag: 'wx' })
      return new ProjectLock(path, token, heartbeatMs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }

    const holder = readHolder(path)
    if (holder && Date.now() - Date.parse(holder.heartbeatAt) < staleAfterMs) {
      throw new ProjectLockedError(holder)
    }
    // Stale (or unreadable) lock: reclaim via atomic replace.
    const tmp = `${path}.${token}.tmp`
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, path)
    return new ProjectLock(path, token, heartbeatMs)
  }

  #beat(): void {
    if (this.#released) return
    const holder = readHolder(this.#path)
    // Never clobber a lock someone else reclaimed after judging ours
    // stale (e.g. this process was suspended past the stale window).
    if (!holder || holder.token !== this.#token) return
    holder.heartbeatAt = new Date().toISOString()
    const tmp = `${this.#path}.${this.#token}.tmp`
    writeFileSync(tmp, JSON.stringify(holder))
    renameSync(tmp, this.#path)
  }

  release(): void {
    if (this.#released) return
    this.#released = true
    if (this.#timer) clearInterval(this.#timer)
    const holder = readHolder(this.#path)
    if (holder && holder.token === this.#token) {
      try {
        unlinkSync(this.#path)
      } catch {
        // Already gone; releasing is idempotent.
      }
    }
  }
}

function readHolder(path: string): LockHolder | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LockHolder
  } catch {
    return null
  }
}
