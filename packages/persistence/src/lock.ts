import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

/**
 * Single-writer project lock per RFC-0001 §11.1: at most one
 * authoritative writer service per project directory.
 *
 * Ownership is decided by ONE single-winner primitive — an `O_EXCL`
 * create of the owner file (`writeFileSync(..., { flag: 'wx' })`). The
 * kernel guarantees exactly one creator when the file is absent, so an
 * uncontended acquire and every acquire that follows a reclaim have a
 * single winner by construction (AI-IMP-226, replacing the AI-IMP-058
 * rename-over-then-verify reclaim, which admitted multiple live writers
 * under contention — a 32-process probe produced 2-3 winners per round).
 *
 * A crashed holder's owner file must still be reclaimable, but the
 * removal of a stale owner file is NOT itself single-winner (a blind
 * unlink can delete a fresh winner another contender just created). So
 * the reclaim path is serialized behind an atomic `mkdir` guard
 * directory: exactly one contender may remove the owner file at a time,
 * and it only does so after re-confirming, under the guard, that the
 * file is still a reclaimable corpse — which cannot turn live under it,
 * because `O_EXCL` create is blocked while the corpse occupies the path
 * and a provably-dead holder issues no heartbeat. After removal every
 * contender re-races the `O_EXCL` create, so the winner is again unique.
 *
 * The owner file also carries a heartbeat, refreshed on a timer, purely
 * for observability and for the cross-host staleness policy below.
 */

export const LOCK_FILENAME = 'project.lock'

/**
 * Reclaim serializer (AI-IMP-226): a `mkdir`-created directory beside the
 * owner file. `mkdir` is atomic and single-winner on every filesystem, so
 * it grants at most one reclaimer the right to remove a stale owner file.
 */
export const RECLAIM_GUARD_DIRNAME = 'project.lock.reclaim'

/**
 * A reclaimer holds the guard for a handful of non-blocking syscalls
 * (microseconds). If one crashes mid-swap the guard directory leaks; a
 * guard older than this is treated as abandoned and stolen. The window is
 * generous versus the real critical section so a live reclaim is never
 * stolen, and the steal itself re-arbitrates through `mkdir`.
 */
const RECLAIM_GUARD_STALE_MS = 10_000

/**
 * An owner file that will not parse is ambiguous: it may be a torn read
 * of a LIVE holder mid-`O_EXCL`-write (resolves in microseconds), or a
 * genuinely corrupt zero-byte leftover from a crash between create and
 * write. We only reclaim the corrupt case, distinguished by the file
 * having stayed unreadable longer than any in-flight write could last —
 * unlinking a torn-but-live file would split-brain the writer.
 */
const UNREADABLE_GRACE_MS = 1_000

/**
 * A failed Windows unlink/rmdir can leak the reclaim guard. Retrying by a
 * small attempt count then gives up before the guard's stale lease expires,
 * so a stale corpse can leave every contender locked out. Keep retrying long
 * enough to re-take one abandoned guard, with a small margin for the winning
 * reclaimer to clear the owner file.
 */
const RECLAIM_RETRY_WINDOW_MS = RECLAIM_GUARD_STALE_MS + 2_000

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
    const guardPath = join(projectDir, RECLAIM_GUARD_DIRNAME)
    const token = crypto.randomUUID()

    const retryDeadline = Date.now() + RECLAIM_RETRY_WINDOW_MS
    for (let attempt = 0; Date.now() <= retryDeadline; attempt++) {
      // 1. Single-winner acquisition: O_EXCL create of the owner file.
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

      // 2. Owner file present. A holder we cannot justify removing wins.
      const holder = readHolder(path)
      if (holder && !isReclaimable(holder, staleAfterMs)) {
        throw new ProjectLockedError(holder)
      }

      // 3. Corpse (or an unreadable/torn file): remove it under the guard,
      //    then loop to re-race the O_EXCL create. If the guard is
      //    contended, or a racer reinstalled a live holder, back off and
      //    re-evaluate from the top (a reinstalled live holder is refused
      //    on the next pass).
      if (!reclaimUnderGuard(path, guardPath, staleAfterMs)) {
        backoff(attempt)
      }
    }

    throw new ProjectLockedError(readHolder(path) ?? synthHolder(token))
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

/**
 * Reclaim policy (AI-IMP-226, tightening AI-IMP-053/058). A lock is taken
 * from its recorded holder only when we can justify the holder is gone —
 * never merely because its heartbeat looks old:
 *
 *  - provably-dead same-host pid: reclaim now (crash recovery, any age);
 *  - LIVE same-host pid: NEVER reclaim, even with a stale heartbeat. A
 *    >staleAfterMs event-loop stall (a huge synchronous import, SIGSTOP,
 *    a suspended laptop) would otherwise evict a writer whose SQLite
 *    handle is still open — two live writers, split-brain. The deliberate
 *    trade: a hung-but-alive holder blocks new writers until it is
 *    killed. That is the honest cost of a real single-writer lock;
 *  - foreign-host holder: liveness is unknowable across hosts, so keep the
 *    Phase 1 policy — reclaim once the heartbeat ages past staleAfterMs
 *    (cross-host semantics are explicitly out of scope for AI-IMP-226).
 */
function isReclaimable(holder: LockHolder, staleAfterMs: number): boolean {
  if (holderIsDead(holder)) return true
  const heartbeatAged = Date.now() - Date.parse(holder.heartbeatAt) >= staleAfterMs
  if (!heartbeatAged) return false
  // Aged heartbeat but the holder is not provably dead.
  if (holder.hostname === hostname()) return false // live-or-stalled same host
  return true // foreign + aged: Phase 1 cross-host policy
}

/**
 * Serialized stale-lock removal. Returns true when the owner file has been
 * cleared (caller should re-race the O_EXCL create) and false when the
 * caller should back off and retry — because the guard is held by another
 * reclaimer, or because a racer already reinstalled a live holder (which
 * the caller then refuses on its next pass).
 */
function reclaimUnderGuard(path: string, guardPath: string, staleAfterMs: number): boolean {
  try {
    mkdirSync(guardPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    // Guard is held. If it is itself abandoned (a reclaimer crashed
    // mid-swap), steal it; mkdir re-arbitrates the retake next pass.
    if (guardIsStale(guardPath)) removeGuard(guardPath)
    return false
  }
  try {
    // Under the guard, re-read: a racer may have reclaimed already, or a
    // foreign holder may have refreshed its heartbeat, or the holder may
    // have exited.
    const holder = readHolder(path)
    if (holder) {
      if (!isReclaimable(holder, staleAfterMs)) return false
    } else if (!unreadableLongEnough(path)) {
      // Torn read of a live holder mid-write: leave it, retry a read.
      return false
    }
    // The owner file cannot turn live under us here: O_EXCL create is
    // blocked while the corpse occupies the path, and a provably-dead
    // holder issues no heartbeat, so this removes exactly the file we
    // judged (a confirmed corpse, or a durably-unreadable corrupt file).
    try {
      unlinkSync(path)
      return true
    } catch (err) {
      // A concurrent release makes the O_EXCL create race open. A Windows
      // EPERM/EBUSY leaves the owner in place, so reporting "cleared" here
      // would burn the retry budget without making any progress.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true
      if (isRetryableRemovalError(err)) return false
      throw err
    }
  } finally {
    // A transient Windows EPERM may leave this guard behind. Its eventual
    // stale takeover is safe, and acquire() waits through that lease.
    removeGuard(guardPath)
  }
}

/**
 * Remove an empty reclaim guard without pretending a failed removal worked.
 * A concurrent releaser/stealer is harmless (`ENOENT`); Windows may briefly
 * reject a directory removal while its own handles drain, so give that a few
 * jittered retries. Other filesystem failures are real and must surface.
 */
function removeGuard(guardPath: string): boolean {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmdirSync(guardPath)
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true
      if (!isRetryableRemovalError(err)) throw err
      backoff(attempt)
    }
  }
  return false
}

function isRetryableRemovalError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY'
}

function guardIsStale(guardPath: string): boolean {
  try {
    return Date.now() - statSync(guardPath).mtimeMs >= RECLAIM_GUARD_STALE_MS
  } catch {
    return true // vanished — treat as stealable; the mkdir retake decides.
  }
}

/**
 * True once an unreadable owner file has stayed put long enough that any
 * in-flight write would have finished — i.e. it is corrupt, not a torn
 * read of a live holder. A live holder rewriting its heartbeat pushes the
 * mtime forward, so this stays false for it.
 */
function unreadableLongEnough(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs >= UNREADABLE_GRACE_MS
  } catch {
    return false // vanished mid-check; let the create race decide.
  }
}

// A shared int32 for sub-millisecond synchronous backoff without a busy
// spin. acquire() runs at process/window init, so the brief block is
// acceptable, and Atomics.wait yields the CPU to contending processes.
const BACKOFF_SLOT = new Int32Array(new SharedArrayBuffer(4))

function backoff(attempt: number): void {
  // Small jittered sleep so contenders desynchronize rather than lockstep.
  const ms = 1 + ((attempt + Math.floor(Math.random() * 5)) % 6)
  Atomics.wait(BACKOFF_SLOT, 0, 0, ms)
}

/**
 * Same-host corpse detection (AI-IMP-053): a crashed holder's heartbeat
 * stays "fresh" for staleAfterMs, which made every relaunch inside that
 * window fail with PROJECT_LOCKED (and blocked automatic utility-process
 * recovery). When the recorded holder is on THIS host and its pid provably
 * no longer exists, the lock is reclaimable immediately. PID reuse errs
 * safe: a recycled pid looks alive, so we fall back to the heartbeat.
 */
function holderIsDead(holder: LockHolder): boolean {
  if (holder.hostname !== hostname()) return false
  try {
    process.kill(holder.pid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function readHolder(path: string): LockHolder | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LockHolder
  } catch {
    return null
  }
}

/** A placeholder holder for the (unreached) retry-exhaustion error. */
function synthHolder(token: string): LockHolder {
  const now = new Date().toISOString()
  return { pid: process.pid, hostname: hostname(), token, acquiredAt: now, heartbeatAt: now }
}
