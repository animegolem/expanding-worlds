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

type HolderRead =
  | { kind: 'holder'; holder: LockHolder }
  | { kind: 'absent' }
  | { kind: 'invalid'; error: Error }
  | { kind: 'error'; error: NodeJS.ErrnoException }

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
  /** Test seam only: shrink the acquire retry window so persistent-
   * failure regressions run in milliseconds. Production callers never
   * pass it — the default is shaped to outlive a leaked guard lease. */
  retryWindowMs?: number
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

    // A transient Windows EPERM (DELETE_PENDING) retries — but if the
    // SAME retryable error persists through the whole window, it was
    // never contention: it is a real filesystem/permission condition,
    // and reporting it as ProjectLockedError (worse: one synthesized
    // from our own token) fabricates a diagnosis. Remember the last
    // retryable error so the timeout can tell the truth.
    let lastTransient: NodeJS.ErrnoException | null = null

    const retryDeadline = Date.now() + (options.retryWindowMs ?? RECLAIM_RETRY_WINDOW_MS)
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
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EPERM') {
          // Windows can reject an O_EXCL create for a just-released file
          // while the previous process's handle is still draining. We own
          // nothing in that state and must not inspect or reclaim the path;
          // a bounded backoff lets the kernel settle before re-racing it.
          lastTransient = err as NodeJS.ErrnoException
          backoff(attempt)
          continue
        }
        if (code !== 'EEXIST') throw err
      }

      // 2. Owner file present. A holder we cannot justify removing wins.
      const owner = readHolder(path)
      if (owner.kind === 'error') {
        if (!isRetryableFilesystemError(owner.error)) throw owner.error
        lastTransient = owner.error
        backoff(attempt)
        continue
      }
      if (owner.kind === 'absent') continue
      if (owner.kind === 'holder' && !isReclaimable(owner.holder, staleAfterMs)) {
        throw new ProjectLockedError(owner.holder)
      }
      // Reaching here means the path is genuinely contended (a corpse
      // exists), not permission-broken: any earlier transient is stale.
      lastTransient = null

      // 3. Corpse (or an unreadable/torn file): remove it under the guard,
      //    then loop to re-race the O_EXCL create. If the guard is
      //    contended, or a racer reinstalled a live holder, back off and
      //    re-evaluate from the top (a reinstalled live holder is refused
      //    on the next pass).
      const reclaim = reclaimUnderGuard(path, guardPath, staleAfterMs)
      if (reclaim.transient) lastTransient = reclaim.transient
      if (!reclaim.removed) backoff(attempt)
    }

    // Window exhausted. Diagnosis order: a LIVE holder is the truth
    // regardless of any transient noise; a persisting retryable error
    // is the honest answer otherwise (a dead corpse we could not
    // reclaim BECAUSE of that error is a permission problem, not a
    // lock problem); a reclaimable corpse with no error is unresolved
    // contention; the synthesized holder is the last resort.
    const finalOwner = readHolder(path)
    if (finalOwner.kind === 'error') throw finalOwner.error
    if (finalOwner.kind === 'holder' && !isReclaimable(finalOwner.holder, staleAfterMs)) {
      throw new ProjectLockedError(finalOwner.holder)
    }
    if (lastTransient) throw lastTransient
    throw new ProjectLockedError(
      finalOwner.kind === 'holder' ? finalOwner.holder : synthHolder(token),
    )
  }

  #beat(): void {
    if (this.#released) return
    const owner = readHolder(this.#path)
    if (owner.kind === 'error') throw owner.error
    // Never clobber a lock someone else reclaimed after judging ours
    // stale (e.g. this process was suspended past the stale window).
    if (owner.kind !== 'holder' || owner.holder.token !== this.#token) return
    const holder = owner.holder
    holder.heartbeatAt = new Date().toISOString()
    const tmp = `${this.#path}.${this.#token}.tmp`
    writeFileSync(tmp, JSON.stringify(holder))
    renameSync(tmp, this.#path)
  }

  release(): void {
    if (this.#released) return
    let lastTransient: NodeJS.ErrnoException | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const owner = readHolder(this.#path)
      if (owner.kind === 'error') throw owner.error
      if (owner.kind === 'invalid') throw owner.error
      if (owner.kind === 'absent' || owner.holder.token !== this.#token) {
        this.#finishRelease()
        return
      }
      try {
        unlinkSync(this.#path)
        this.#finishRelease()
        return
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          this.#finishRelease()
          return
        }
        if (!isRetryableRemovalError(err)) throw err
        lastTransient = err as NodeJS.ErrnoException
        backoff(attempt)
      }
    }
    throw lastTransient!
  }

  #finishRelease(): void {
    this.#released = true
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
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
 * Serialized stale-lock removal. The outcome says whether the owner file
 * was cleared and may preserve a transient filesystem error for truthful
 * timeout diagnosis. A false result asks the caller to back off and retry.
 */
function reclaimUnderGuard(
  path: string,
  guardPath: string,
  staleAfterMs: number,
): { removed: boolean; transient?: NodeJS.ErrnoException } {
  try {
    mkdirSync(guardPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EBUSY') {
      // Windows DELETE_PENDING at the guard: a mkdir racing another
      // process's rmdir of the same path reports EPERM/EBUSY rather
      // than EEXIST (AI-IMP-249 round 4 — the same kernel semantics
      // the O_EXCL create hit in round 3). We created nothing and own
      // nothing; the disposition is identical to guard-held — report
      // no progress, PRESERVING the error so a PERSISTENT permission
      // condition can surface truthfully at the window's end instead
      // of masquerading as a lock holder.
      return { removed: false, transient: err as NodeJS.ErrnoException }
    }
    if (code !== 'EEXIST') throw err
    // Guard is held. If it is itself abandoned (a reclaimer crashed
    // mid-swap), steal it; mkdir re-arbitrates the retake next pass.
    const guard = inspectGuard(guardPath)
    if (guard.kind === 'error') {
      if (isRetryableFilesystemError(guard.error)) {
        return { removed: false, transient: guard.error }
      }
      throw guard.error
    }
    if (guard.kind === 'stale') removeGuard(guardPath)
    return { removed: false }
  }
  try {
    // Under the guard, re-read: a racer may have reclaimed already, or a
    // foreign holder may have refreshed its heartbeat, or the holder may
    // have exited.
    const owner = readHolder(path)
    if (owner.kind === 'error') {
      if (isRetryableFilesystemError(owner.error)) {
        return { removed: false, transient: owner.error }
      }
      throw owner.error
    }
    if (owner.kind === 'holder') {
      if (!isReclaimable(owner.holder, staleAfterMs)) return { removed: false }
    } else if (owner.kind === 'invalid' && !unreadableLongEnough(path)) {
      // Torn read of a live holder mid-write: leave it, retry a read.
      return { removed: false }
    }
    // The owner file cannot turn live under us here: O_EXCL create is
    // blocked while the corpse occupies the path, and a provably-dead
    // holder issues no heartbeat, so this removes exactly the file we
    // judged (a confirmed corpse, or a durably-unreadable corrupt file).
    try {
      unlinkSync(path)
      return { removed: true }
    } catch (err) {
      // A concurrent release makes the O_EXCL create race open. A Windows
      // EPERM/EBUSY leaves the owner in place, so reporting "cleared" here
      // would burn the retry budget without making any progress.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { removed: true }
      if (isRetryableRemovalError(err))
        return { removed: false, transient: err as NodeJS.ErrnoException }
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
function removeGuard(guardPath: string): void {
  let lastTransient: NodeJS.ErrnoException | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmdirSync(guardPath)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      if (!isRetryableRemovalError(err)) throw err
      lastTransient = err as NodeJS.ErrnoException
      backoff(attempt)
    }
  }
  throw lastTransient!
}

function isRetryableFilesystemError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EBUSY'
}

function isRetryableRemovalError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY'
}

function inspectGuard(
  guardPath: string,
): { kind: 'stale' | 'present' | 'absent' } | { kind: 'error'; error: NodeJS.ErrnoException } {
  try {
    return Date.now() - statSync(guardPath).mtimeMs >= RECLAIM_GUARD_STALE_MS
      ? { kind: 'stale' }
      : { kind: 'present' }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' }
    return { kind: 'error', error: err as NodeJS.ErrnoException }
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

function readHolder(path: string): HolderRead {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' }
    return { kind: 'error', error: err as NodeJS.ErrnoException }
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!isLockHolder(value)) throw new Error('project lock holder has an invalid shape')
    return { kind: 'holder', holder: value }
  } catch (err) {
    return { kind: 'invalid', error: err as Error }
  }
}

function isLockHolder(value: unknown): value is LockHolder {
  if (typeof value !== 'object' || value === null) return false
  const holder = value as Record<string, unknown>
  return (
    typeof holder.pid === 'number' &&
    Number.isSafeInteger(holder.pid) &&
    holder.pid > 0 &&
    typeof holder.hostname === 'string' &&
    holder.hostname.length > 0 &&
    typeof holder.token === 'string' &&
    holder.token.length > 0 &&
    typeof holder.acquiredAt === 'string' &&
    Number.isFinite(Date.parse(holder.acquiredAt)) &&
    typeof holder.heartbeatAt === 'string' &&
    Number.isFinite(Date.parse(holder.heartbeatAt))
  )
}

/** A placeholder holder for otherwise-unresolved retry exhaustion. */
function synthHolder(token: string): LockHolder {
  const now = new Date().toISOString()
  return { pid: process.pid, hostname: hostname(), token, acquiredAt: now, heartbeatAt: now }
}
