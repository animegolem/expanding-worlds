import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  SNAPSHOT_MODE_KEY,
  SNAPSHOT_REMOTE_KEY,
  type ProjectRequest,
  type ProjectResponse,
  type SnapshotEntry,
  type SnapshotMode,
  type SnapshotPushState,
  type SnapshotStatus,
  type SnapshotTestConnectionResult,
} from '@ew/protocol'
import { assertManagedPath } from '@ew/persistence'

export type SnapshotMaterializeResult =
  | { ok: true; dir: string }
  | { ok: false; code: string; message: string }

/**
 * Session snapshot engine (RFC-0001 §11.4, AI-IMP-120). Lives in the
 * MAIN process beside the window/lifecycle wiring: it owns the git
 * mechanics (filesystem + shell-out) and the idle timer, while the
 * single-writer discipline is honored by delegating every DB touch —
 * the WAL checkpoint and the notes-tree write — to the utility's
 * project service (§11.4). Main never opens a second SQLite handle.
 *
 * Engine decision (benchmarked, AI-IMP-120): system git, feature-
 * detected once at runtime. On a ~430 MB / 150-file synthetic project
 * git's index makes the common path — the incremental and empty-diff
 * commits that every idle checkpoint and end-session produces — an
 * order of magnitude cheaper (inc ≈ 0.9 s, empty ≈ 0.02 s) than
 * isomorphic-git (inc ≈ 4 s, empty ≈ 3.5 s: it re-hashes the whole
 * working tree every time, so its cost scales with PROJECT size, not
 * CHANGE size — the wrong shape for a multi-GB reference board). When
 * system git is absent the setting degrades with a visible note rather
 * than shipping a fallback that becomes unusable at exactly the scale
 * backups matter; the engine boundary keeps a JS fallback a drop-in if
 * that call is revisited (AI-IMP-122+).
 */

const execFileAsync = promisify(execFile)

/** ~10 minutes without a command (RFC-0001 §11.4 "tunable"). The env
 * override exists for integration tests — they must not wait ten
 * minutes; 0 disables the idle path. */
const IDLE_MS = (() => {
  const raw = process.env['EW_SNAPSHOT_IDLE_MS']
  if (raw === undefined) return 10 * 60 * 1000
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 10 * 60 * 1000
})()

/** A `.git/index.lock` older than this is an orphan from an abandoned
 * commit (safe to sweep); a younger one may be a LIVE git operation and
 * defers the snapshot instead (AI-IMP-218). ~10 min is generous over any
 * real commit — even a first-ever multi-GB one finishes well inside it —
 * so an orphan always ages past the gate. */
const STALE_LOCK_MS = 10 * 60 * 1000

/** The lock/heartbeat, WAL/journal sidecars, and regenerable
 * derivative/cache trees never belong in history — a snapshot commits
 * project.sqlite (checkpointed), assets/, and notes/ only.
 *
 * The block is delimited by explicit BEGIN/END sentinels carrying a
 * version (AI-IMP-223 / Sol CA-010): {@link seedGitignore} rewrites the
 * managed block in place when it finds an older version, so EXISTING
 * projects gain new exclusions — a template edit alone left them
 * unmigrated because the old seed early-returned on the marker. Bump
 * {@link GITIGNORE_VERSION} whenever the managed lines change. */
const GITIGNORE_VERSION = 'v2'
const GITIGNORE_BEGIN = `# >>> Expanding Worlds — session snapshots (managed ${GITIGNORE_VERSION}) >>>`
const GITIGNORE_END = '# <<< Expanding Worlds — session snapshots (managed) <<<'
const GITIGNORE_BODY = `${GITIGNORE_BEGIN}
# RFC-0001 §11.4 — regenerated on every seed; edit ABOVE or BELOW the
# markers, never between them (this block is rewritten on version bump).
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
${GITIGNORE_END}
`

/** The v1 managed block (no sentinels) as older projects carry it, for
 * detection and one-time replacement during migration. Its first line
 * is also the substring that identifies an unmigrated block. */
const GITIGNORE_V1_MARKER = '# Expanding Worlds — session snapshots (RFC-0001 §11.4)'
const GITIGNORE_BODY_V1 = `# Expanding Worlds — session snapshots (RFC-0001 §11.4)
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

/** The ONLY top-level entries a snapshot commits (RFC-0001 §11.2 +
 * §11.4): the checkpointed database, the readable notes tree, the
 * content-addressed originals, and the managed ignore file itself.
 * Staged explicitly instead of via `git add -A` (Sol CA-010) — the
 * blanket add could sweep an in-progress export's staging or any stray a
 * tool/stopgap dropped in the project dir into history, duplicating the
 * whole project inside its own backup. */
const SNAPSHOT_ALLOWLIST = ['project.sqlite', 'notes', 'assets', '.gitignore'] as const

/** Top-level entries that legitimately exist beside the allowlist and
 * must be neither committed (they are gitignored) nor flagged as strays:
 * the git dir, the lock, the SQLite sidecars, and the regenerable
 * derivative/cache trees. Anything ELSE is logged as unexpected. */
const SNAPSHOT_EXPECTED_UNCOMMITTED = new Set([
  '.git',
  'project.lock',
  'project.sqlite-wal',
  'project.sqlite-shm',
  'project.sqlite-journal',
  'derivatives',
  'cache',
])

export interface SnapshotDeps {
  /** Round-trips a request through main → utility → project service. */
  callUtility: (payload: ProjectRequest) => Promise<ProjectResponse>
  /** Asks every renderer to commit pending editor buffers, bounded. */
  flushRenderers: () => Promise<void>
  /** The active project directory (env-overridable in tests). */
  projectDir: () => string
  /** §11.4/§8.6 remote push (AI-IMP-122): broadcast the background
   * push's state to the renderers for the ongoing-push perch and the
   * once-per-episode failure toast. Optional — absent in unit contexts
   * that don't exercise push. */
  onPushState?: (state: SnapshotPushState) => void
}

export type SnapshotTrigger = 'idle' | 'rest' | 'end-session'

export interface SnapshotEngine {
  gitAvailable: () => Promise<boolean>
  /** §11.4 git-ready projects: drop the ignore file so a project is
   * commit-safe regardless of the setting. Idempotent. */
  seedGitignore: (dir: string) => void
  /** The Settings readout: git presence + backup disk size. */
  status: () => Promise<SnapshotStatus>
  /** Reset the idle timer — called on every committed change. */
  noteActivity: () => void
  /** §11.4 restore (AI-IMP-121): the dated snapshot list, newest first,
   * over `git log` — empty when snapshots are off / no repo / no
   * commits yet. Read-only: never writes, never touches the index. */
  listSnapshots: () => Promise<SnapshotEntry[]>
  /** §11.4 restore (AI-IMP-121): materialize the chosen commit into a
   * NEW sibling directory `<project>-restored-<date>` (collision-
   * suffixed), never in-place, then validate the extracted db opens.
   * The source project directory is never written. */
  restore: (sha: string) => Promise<SnapshotMaterializeResult>
  /** §11.4 remote push (AI-IMP-122): the deliberate Test connection
   * action — `git ls-remote <url>` with the terminal prompt disabled so
   * a missing credential fails fast instead of hanging on a hidden
   * prompt. The ONLY network call the user triggers by hand; never runs
   * ambiently. */
  testConnection: (url: string) => Promise<SnapshotTestConnectionResult>
  /** Run one snapshot moment: flush buffers, (when enabled) regenerate
   * the notes tree, checkpoint the WAL, then commit. Always resolves;
   * a git or checkpoint failure is logged, never thrown — a backup
   * hiccup must never trap quit or the user. When mode is `commit-push`
   * and a remote URL is set, a push is SCHEDULED (not awaited) after the
   * commit — the returned promise resolves on local success so the
   * session ritual never waits on the network. */
  runSnapshot: (trigger: SnapshotTrigger) => Promise<void>
  dispose: () => void
}

export function createSnapshotEngine(deps: SnapshotDeps): SnapshotEngine {
  let gitProbe: Promise<boolean> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  // Serialize snapshots: a quit snapshot must not race an idle one.
  let inFlight: Promise<void> = Promise.resolve()
  // §11.4 push (AI-IMP-122): a SEPARATE chain from `inFlight`. Pushes
  // serialize among themselves (two concurrent pushes to one remote can
  // race), but the snapshot chain NEVER awaits this one — the session
  // ritual finishes on local commit and the push rides the background.
  let pushChain: Promise<void> = Promise.resolve()
  // The dedicated remote name for the app's backup mirror — never
  // `origin`, so a user's own remote in a project they also track by
  // hand is left untouched.
  const REMOTE_NAME = 'ew-snapshots'
  // The tracking ref `git push` updates on success — the anchor the
  // unpushed-debt count measures HEAD against.
  const TRACKING_REF = `refs/remotes/${REMOTE_NAME}/main`

  function gitAvailable(): Promise<boolean> {
    if (process.env['EW_SNAPSHOT_NO_GIT'] === '1') return Promise.resolve(false)
    if (!gitProbe) {
      gitProbe = execFileAsync('git', ['--version'])
        .then(() => true)
        .catch(() => false)
    }
    return gitProbe
  }

  async function git(dir: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: dir,
      maxBuffer: 64 * 1024 * 1024,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    })
    return stdout
  }

  /** GIT_TERMINAL_PROMPT=0 turns a missing credential into a fast
   * failure instead of a hidden interactive prompt that would hang an
   * unattended push/probe forever (the app has no terminal to answer
   * it). Auth stays the system's — ssh agent / credential helper. We
   * never store or pass a secret. */
  const NO_PROMPT_ENV: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0' }

  function seedGitignore(dir: string): void {
    const path = assertManagedPath(dir, join(dir, '.gitignore'))
    try {
      if (!existsSync(path)) {
        writeFileSync(path, GITIGNORE_BODY, 'utf8')
        return
      }
      const existing = readFileSync(path, 'utf8')
      // Already carries the CURRENT managed block — nothing to do.
      if (existing.includes(GITIGNORE_BEGIN)) return
      // An older managed block (v1: no sentinels) — rewrite it in place
      // so EXISTING projects gain the versioned exclusions (Sol CA-010).
      if (existing.includes(GITIGNORE_V1_MARKER)) {
        // Strip the exact v1 body wherever it sits (whole-file, or
        // appended after user-authored content), collapse the seam, and
        // re-append the current block; user lines outside it are kept.
        let userPart = existing.split(GITIGNORE_BODY_V1).join('')
        userPart = userPart.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
        writeFileSync(path, userPart.length === 0 ? GITIGNORE_BODY : `${userPart}\n\n${GITIGNORE_BODY}`, 'utf8')
        return
      }
      // Purely user-authored — append our block once.
      const sep = existing.endsWith('\n') ? '\n' : '\n\n'
      writeFileSync(path, existing + sep + GITIGNORE_BODY, 'utf8')
    } catch (err) {
      console.error('[snapshot] failed to seed .gitignore:', err)
    }
  }

  async function readMode(): Promise<SnapshotMode> {
    const response = await deps.callUtility({ type: 'run-query', name: 'getSettings' })
    if ('type' in response && response.type === 'run-query' && response.ok) {
      const mode = (response.result as Record<string, unknown>)[SNAPSHOT_MODE_KEY]
      if (mode === 'commit' || mode === 'commit-push') return mode
    }
    return 'off'
  }

  /** The per-project remote URL, trimmed, or '' when unset (§11.5: the
   * absent case means NOTHING network-shaped runs). */
  async function readRemote(): Promise<string> {
    const response = await deps.callUtility({ type: 'run-query', name: 'getSettings' })
    if ('type' in response && response.type === 'run-query' && response.ok) {
      const url = (response.result as Record<string, unknown>)[SNAPSHOT_REMOTE_KEY]
      if (typeof url === 'string') return url.trim()
    }
    return ''
  }

  /** A quit that abandons an in-flight `git add`/`commit` (the ritual
   * is time-bounded; a first-ever multi-GB commit can exceed it) orphans
   * `.git/index.lock`, after which every later snapshot fails with only a
   * logged error — the worst failure mode for a backup.
   *
   * AI-IMP-120's original rationale — "the engine serializes its OWN git
   * ops and the project dir is app-managed, so a lock at snapshot start
   * is stale by construction" — holds ONLY while nothing external touches
   * the repo. But snapshot-push invites exactly that: a user inspecting
   * the backup repo, a GUI git tool pointed at it. Sweeping a LIVE lock
   * would permit a concurrent index write — corruption in the one place
   * it must never reach (AI-IMP-218). So the sweep is AGE-GATED: a lock
   * older than {@link STALE_LOCK_MS} is an orphan (an abandoned commit
   * ages well past it) and is swept; a YOUNGER lock DEFERS this snapshot
   * (returns false — the next episode retries once it ages out). The lead
   * ruled the age-gate plus its documented RESIDUAL RISK acceptable: a
   * genuinely wedged lock younger than the threshold stalls backups for
   * up to STALE_LOCK_MS before it ages past the gate and is swept — a
   * bounded delay, traded against ever corrupting the backup index.
   * Returns true when the index is free to use, false to defer. */
  function sweepStaleIndexLock(dir: string): boolean {
    const lock = join(dir, '.git', 'index.lock')
    let mtimeMs: number
    try {
      mtimeMs = statSync(lock).mtimeMs
    } catch {
      return true // no lock (ENOENT) — the index is free
    }
    if (Date.now() - mtimeMs < STALE_LOCK_MS) {
      console.warn(
        '[snapshot] .git/index.lock present and fresh; deferring this snapshot ' +
          '(an external git operation may hold it — the next episode retries)',
      )
      return false
    }
    try {
      rmSync(lock)
      console.warn('[snapshot] removed a stale .git/index.lock before committing')
      return true
    } catch (err) {
      // Could not clear it — defer rather than commit against a lock we
      // do not control.
      console.error('[snapshot] failed to remove stale index.lock:', err)
      return false
    }
  }

  /** Prepare the repo and report whether a commit may proceed. A fresh
   * index.lock returns false — the caller logs a skipped episode and the
   * next snapshot retries (AI-IMP-218). */
  async function ensureGitReady(dir: string): Promise<boolean> {
    seedGitignore(dir)
    if (existsSync(join(dir, '.git'))) {
      if (!sweepStaleIndexLock(dir)) return false
    } else {
      await git(dir, ['init', '-q'])
      // A stable default branch name regardless of the machine's
      // init.defaultBranch.
      await git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']).catch(() => undefined)
    }
    // Commits need a committer identity; set a stable app identity
    // LOCALLY only when the repo (and any global config) has none, so a
    // user's own git identity is respected when present.
    const hasEmail = await git(dir, ['config', 'user.email'])
      .then((s) => s.trim().length > 0)
      .catch(() => false)
    if (!hasEmail) {
      await git(dir, ['config', 'user.email', 'snapshots@expanding-worlds.local'])
      await git(dir, ['config', 'user.name', 'Expanding Worlds'])
    }
    // Never let a machine-global commit.gpgsign wedge an unattended
    // snapshot on a passphrase prompt.
    await git(dir, ['config', 'commit.gpgsign', 'false']).catch(() => undefined)
    return true
  }

  function commitMessage(trigger: SnapshotTrigger, notes: number, assets: number): string {
    const label =
      trigger === 'idle' ? 'idle checkpoint' : trigger === 'end-session' ? 'end session' : 'checkpoint'
    const when = new Date().toISOString()
    return `Snapshot: ${label} — ${notes} note${notes === 1 ? '' : 's'}, ${assets} asset${
      assets === 1 ? '' : 's'
    } — ${when}`
  }

  /** Log — never commit — anything in the project dir outside the
   * allowlist and the known regenerable/ignored set. A stray here means a
   * tool or a bug dropped a file among the managed contents; surfacing it
   * (rather than silently sweeping it into history via `git add -A`) is
   * the point of the allowlist (Sol CA-010). Best-effort. */
  function logUnexpectedEntries(dir: string): void {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    const allow = new Set<string>(SNAPSHOT_ALLOWLIST)
    const unexpected = names.filter(
      (n) => !allow.has(n) && !SNAPSHOT_EXPECTED_UNCOMMITTED.has(n),
    )
    if (unexpected.length > 0) {
      console.warn(
        `[snapshot] unexpected project entries left uncommitted: ${unexpected.join(', ')}`,
      )
    }
  }

  async function commitIfChanged(
    dir: string,
    trigger: SnapshotTrigger,
    notes: number,
    assets: number,
  ): Promise<void> {
    // Stage EXACTLY the allowlist, never `git add -A`. Passing each path
    // as a pathspec still records additions, modifications, AND deletions
    // of tracked files under it (a removed note/asset commits), but leaves
    // strays and staging untouched (Sol CA-010).
    const present = SNAPSHOT_ALLOWLIST.filter((entry) => existsSync(join(dir, entry)))
    if (present.length > 0) await git(dir, ['add', '--', ...present])
    logUnexpectedEntries(dir)
    // Empty-diff guard: a checkpoint with nothing new since the last
    // snapshot creates NO commit (RFC-0001 §11.4). Measured on the STAGED
    // set only — an untracked stray must neither be committed nor provoke
    // an empty `git commit` (which exits non-zero and logs a false
    // failure), which a `git status --porcelain` check would have.
    const staged = await git(dir, ['diff', '--cached', '--name-only'])
    if (staged.trim().length === 0) return
    await git(dir, ['commit', '-q', '-m', commitMessage(trigger, notes, assets)])
  }

  function emitPush(state: SnapshotPushState): void {
    deps.onPushState?.(state)
  }

  function refExists(dir: string, ref: string): Promise<boolean> {
    return git(dir, ['rev-parse', '--verify', '--quiet', ref])
      .then(() => true)
      .catch(() => false)
  }

  /** Backup debt: commits on HEAD not yet on the remote. Measured
   * against the tracking ref `git push` last advanced; before the first
   * successful push (no tracking ref) every commit on HEAD is unpushed.
   * Best-effort — a git hiccup reports 0 rather than throwing. */
  async function unpushedCount(dir: string): Promise<number> {
    try {
      if (!(await refExists(dir, 'HEAD'))) return 0
      const range = (await refExists(dir, TRACKING_REF)) ? `${TRACKING_REF}..HEAD` : 'HEAD'
      const out = await git(dir, ['rev-list', '--count', range])
      const n = Number(out.trim())
      return Number.isFinite(n) ? n : 0
    } catch {
      return 0
    }
  }

  /** Point the dedicated backup remote at the configured URL, adding it
   * on first use and re-pointing it when the setting changes. */
  async function ensureRemote(dir: string, url: string): Promise<void> {
    const existing = await git(dir, ['remote', 'get-url', REMOTE_NAME])
      .then((s) => s.trim())
      .catch(() => '')
    if (existing === url) return
    if (existing) await git(dir, ['remote', 'set-url', REMOTE_NAME, url])
    else await git(dir, ['remote', 'add', REMOTE_NAME, url])
  }

  /** The short human tail of a git failure — the last non-empty stderr
   * line (execFile hangs the whole stderr on the error), so a toast /
   * Settings line can explain "Repository not found" rather than dump a
   * stack. */
  function gitErrorMessage(err: unknown): string {
    const stderr = (err as { stderr?: unknown })?.stderr
    if (typeof stderr === 'string' && stderr.trim().length > 0) {
      const lines = stderr.trim().split('\n')
      return lines[lines.length - 1]!.trim()
    }
    return err instanceof Error ? err.message : String(err)
  }

  /** One background push attempt. Runs on `pushChain`, so it is already
   * off the snapshot ritual's critical path. Emits the ongoing-push
   * perch state, then reconciles: success clears the debt (`idle`, 0),
   * failure leaves the debt visible (`error`) with a one-shot message
   * for the once-per-episode toast; the next snapshot retries. */
  async function runPush(dir: string, url: string): Promise<void> {
    try {
      await ensureRemote(dir, url)
    } catch (err) {
      emitPush({ phase: 'error', unpushed: await unpushedCount(dir), message: gitErrorMessage(err) })
      return
    }
    const ahead = await unpushedCount(dir)
    if (ahead === 0) {
      emitPush({ phase: 'idle', unpushed: 0 })
      return
    }
    emitPush({ phase: 'pushing', unpushed: ahead })
    try {
      // Push HEAD to the remote's main; the tracking ref advances on
      // success, which is what the next debt count measures against.
      await git(dir, ['push', REMOTE_NAME, 'HEAD:refs/heads/main'], NO_PROMPT_ENV)
      emitPush({ phase: 'idle', unpushed: await unpushedCount(dir) })
    } catch (err) {
      emitPush({ phase: 'error', unpushed: await unpushedCount(dir), message: gitErrorMessage(err) })
    }
  }

  /** Schedule a push behind any in-flight one. Deliberately returns
   * void: nothing in the snapshot ritual awaits this. */
  function schedulePush(dir: string, url: string): void {
    pushChain = pushChain.catch(() => undefined).then(() => runPush(dir, url))
  }

  async function testConnection(url: string): Promise<SnapshotTestConnectionResult> {
    const trimmed = url.trim()
    if (trimmed.length === 0) return { ok: false, message: 'Enter a remote URL first.' }
    if (!(await gitAvailable())) {
      return { ok: false, message: "git isn't available on this machine." }
    }
    try {
      await git(deps.projectDir(), ['ls-remote', trimmed], NO_PROMPT_ENV)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: gitErrorMessage(err) }
    }
  }

  async function doSnapshot(trigger: SnapshotTrigger): Promise<void> {
    // Always flush editor buffers and checkpoint the WAL (the AI-IMP-096
    // rest-point behavior), whether or not snapshots are enabled.
    await deps.flushRenderers()
    const mode = await readMode()
    const enabled = mode !== 'off'
    const hasGit = enabled ? await gitAvailable() : false

    let notes = 0
    let assets = 0
    if (enabled && hasGit) {
      // Regenerate the readable tree (and refresh §7.8 blocks) BEFORE
      // the checkpoint seals project.sqlite.
      const written = await deps.callUtility({ type: 'snapshot-write-notes' })
      if ('type' in written && written.type === 'snapshot-write-notes' && written.ok) {
        notes = written.notes
        assets = written.assets
      }
    }
    const checkpoint = await deps.callUtility({ type: 'checkpoint-wal' })
    if (
      !('type' in checkpoint) ||
      checkpoint.type !== 'checkpoint-wal' ||
      !checkpoint.ok
    ) {
      const message =
        'message' in checkpoint && typeof checkpoint.message === 'string'
          ? checkpoint.message
          : 'the project database could not be checkpointed'
      throw new Error(`snapshot deferred: ${message}`)
    }
    if (!enabled || !hasGit) return

    const dir = deps.projectDir()
    // A fresh .git/index.lock (a possible LIVE external git op) defers
    // this snapshot — a logged skip; the next episode retries once the
    // lock ages out (AI-IMP-218).
    if (!(await ensureGitReady(dir))) return
    await commitIfChanged(dir, trigger, notes, assets)

    // §11.4 remote push (AI-IMP-122): commit-push mode with a configured
    // URL schedules a push AFTER the commit — and does NOT await it, so
    // doSnapshot (and the session ritual behind it) resolves on local
    // success and never waits on the network. A push is scheduled even
    // when this snapshot made no new commit: an earlier failed episode
    // left debt, and the next snapshot is where the retry rides. With no
    // URL set nothing network-shaped runs (§11.5 deliberate opt-in).
    if (mode === 'commit-push') {
      const remote = await readRemote()
      if (remote) schedulePush(dir, remote)
    }
  }

  function runSnapshot(trigger: SnapshotTrigger): Promise<void> {
    inFlight = inFlight
      .catch(() => undefined)
      .then(() => doSnapshot(trigger))
      .catch((err) => {
        console.error(`[snapshot] ${trigger} snapshot failed:`, err)
      })
    return inFlight
  }

  function noteActivity(): void {
    if (IDLE_MS === 0) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = null
      // Fire once per idle period; the next activity re-arms. An idle
      // snapshot NEVER closes the project or releases the lock — it is
      // just doSnapshot without the close that follows a quit.
      void runSnapshot('idle')
    }, IDLE_MS)
  }

  function dirSize(dir: string): number {
    let total = 0
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return 0
    }
    for (const entry of entries) {
      const p = join(dir, entry.name)
      try {
        if (entry.isDirectory()) total += dirSize(p)
        else if (entry.isFile()) total += statSync(p).size
      } catch {
        // A file vanishing mid-walk is fine — this is an estimate.
      }
    }
    return total
  }

  async function workingDelta(dir: string): Promise<number> {
    let total = 0
    try {
      const status = await git(dir, ['status', '--porcelain'])
      for (const line of status.split('\n')) {
        if (line.length < 4) continue
        // Porcelain: "XY <path>" (rename shows "old -> new").
        const path = line.slice(3).split(' -> ').pop()!.trim().replace(/^"|"$/g, '')
        try {
          const st = statSync(join(dir, path))
          if (st.isFile()) total += st.size
        } catch {
          // deletion or directory — no working-copy bytes to count.
        }
      }
    } catch {
      // no repo / git error — the delta is simply unknown.
    }
    return total
  }

  async function status(): Promise<SnapshotStatus> {
    const hasGit = await gitAvailable()
    const dir = deps.projectDir()
    const gitDir = join(dir, '.git')
    if (!existsSync(gitDir)) return { gitAvailable: hasGit, sizeBytes: null, reclaimableBytes: 0 }
    const size = dirSize(gitDir) + (hasGit ? await workingDelta(dir) : 0)
    return { gitAvailable: hasGit, sizeBytes: size, reclaimableBytes: 0 }
  }

  // Field separator: %x1f is ASCII Unit Separator — it cannot occur in
  // a commit SHA, ISO date, or our generated subject line, so a plain
  // split is unambiguous (a subject could contain any other char).
  const LOG_FORMAT = '%H%x1f%cI%x1f%s'

  async function listSnapshots(): Promise<SnapshotEntry[]> {
    const dir = deps.projectDir()
    if (!existsSync(join(dir, '.git'))) return []
    let out: string
    try {
      out = await git(dir, ['log', `--pretty=format:${LOG_FORMAT}`])
    } catch {
      // No commits yet (git log exits non-zero on an unborn HEAD) or a
      // git error — either way there is no history to list.
      return []
    }
    const entries: SnapshotEntry[] = []
    for (const line of out.split('\n')) {
      if (line.length === 0) continue
      const parts = line.split('\u001f')
      if (parts.length < 3) continue
      entries.push({ sha: parts[0]!, isoDate: parts[1]!, message: parts[2]! })
    }
    return entries
  }

  /** `<project>-restored-<date>` beside the original, suffixed ` (2)`,
   * ` (3)`… on collision (RFC-0001 §11.4 — destroy-nothing: a second
   * restore of the same day never overwrites the first). */
  function pickDestDir(sourceDir: string): string {
    const parent = dirname(sourceDir)
    const date = new Date().toISOString().slice(0, 10)
    const base = `${basename(sourceDir)}-restored-${date}`
    let candidate = join(parent, base)
    let n = 2
    while (existsSync(candidate)) {
      candidate = join(parent, `${base} (${n})`)
      n += 1
    }
    return candidate
  }

  /** The extracted directory must contain a real SQLite database, not a
   * truncated/empty file — the header magic is the cheapest proof the
   * archive materialized a project. The full schema-ahead guard runs for
   * real when the restored project is opened (§11.2 standard open path);
   * this is the pre-open sanity check the picker reports against. */
  function extractedDbOpens(dir: string): boolean {
    const dbPath = join(dir, 'project.sqlite')
    if (!existsSync(dbPath)) return false
    const MAGIC = 'SQLite format 3\u0000'
    let fd: number | null = null
    try {
      fd = openSync(dbPath, 'r')
      const buf = Buffer.alloc(16)
      const read = readSync(fd, buf, 0, 16, 0)
      return read === 16 && buf.toString('latin1') === MAGIC
    } catch {
      return false
    } finally {
      if (fd !== null) closeSync(fd)
    }
  }

  async function restore(sha: string): Promise<SnapshotMaterializeResult> {
    const sourceDir = deps.projectDir()
    if (!existsSync(join(sourceDir, '.git'))) {
      return { ok: false, code: 'NO_HISTORY', message: 'this project has no snapshot history' }
    }
    const dest = pickDestDir(sourceDir)
    // Extraction mechanism (recorded, AI-IMP-121): pure git plumbing —
    // read-tree the chosen commit into a THROWAWAY index (GIT_INDEX_FILE
    // in the OS temp dir, so the source's own index is never touched),
    // then checkout-index --all --prefix=<dest>/ writes exactly that
    // tree into the new directory. No `git archive | tar` (no tar
    // dependency), no `git worktree` (no shared .git, nothing to detach),
    // and HEAD/the working tree of the source are untouched. Only tracked
    // files land — the gitignored lock, WAL, derivatives/ and cache/
    // stay out, so the restored project is clean and rebuilds derivatives
    // lazily on open.
    const gitDir = join(sourceDir, '.git')
    const indexHome = mkdtempSync(join(tmpdir(), 'ew-restore-idx-'))
    const indexFile = join(indexHome, 'index')
    try {
      mkdirSync(dest, { recursive: true })
      const env = { ...process.env, GIT_INDEX_FILE: indexFile }
      await execFileAsync('git', [`--git-dir=${gitDir}`, 'read-tree', sha], {
        env,
        maxBuffer: 64 * 1024 * 1024,
      })
      await execFileAsync(
        'git',
        [`--git-dir=${gitDir}`, 'checkout-index', '--all', '--force', `--prefix=${dest}/`],
        { env, maxBuffer: 64 * 1024 * 1024 },
      )
    } catch (err) {
      // Roll back a partial extraction so a failed restore leaves no
      // half-materialized directory behind.
      try {
        rmSync(dest, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
      return {
        ok: false,
        code: 'EXTRACT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      }
    } finally {
      try {
        rmSync(indexHome, { recursive: true, force: true })
      } catch {
        // the throwaway index is in the OS temp dir; leaking it is benign
      }
    }
    if (!extractedDbOpens(dest)) {
      try {
        rmSync(dest, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
      return {
        ok: false,
        code: 'INVALID_DB',
        message: 'the restored snapshot did not contain a readable project database',
      }
    }
    return { ok: true, dir: dest }
  }

  function dispose(): void {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  return {
    gitAvailable,
    seedGitignore,
    status,
    noteActivity,
    listSnapshots,
    restore,
    testConnection,
    runSnapshot,
    dispose,
  }
}
