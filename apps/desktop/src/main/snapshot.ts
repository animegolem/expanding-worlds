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
import type {
  ProjectRequest,
  ProjectResponse,
  RestoreResult,
  SnapshotEntry,
  SnapshotMode,
  SnapshotStatus,
} from '@ew/protocol'
import { SNAPSHOT_MODE_KEY } from '@ew/protocol'

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

/** The lock/heartbeat, WAL/journal sidecars, and regenerable
 * derivative/cache trees never belong in history — a snapshot commits
 * project.sqlite (checkpointed), assets/, and notes/ only. */
const GITIGNORE_BODY = `# Expanding Worlds — session snapshots (RFC-0001 §11.4)
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

const GITIGNORE_MARKER = '# Expanding Worlds — session snapshots'

export interface SnapshotDeps {
  /** Round-trips a request through main → utility → project service. */
  callUtility: (payload: ProjectRequest) => Promise<ProjectResponse>
  /** Asks every renderer to commit pending editor buffers, bounded. */
  flushRenderers: () => Promise<void>
  /** The active project directory (env-overridable in tests). */
  projectDir: () => string
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
  restore: (sha: string) => Promise<RestoreResult>
  /** Run one snapshot moment: flush buffers, (when enabled) regenerate
   * the notes tree, checkpoint the WAL, then commit. Always resolves;
   * a git or checkpoint failure is logged, never thrown — a backup
   * hiccup must never trap quit or the user. */
  runSnapshot: (trigger: SnapshotTrigger) => Promise<void>
  dispose: () => void
}

export function createSnapshotEngine(deps: SnapshotDeps): SnapshotEngine {
  let gitProbe: Promise<boolean> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  // Serialize snapshots: a quit snapshot must not race an idle one.
  let inFlight: Promise<void> = Promise.resolve()

  function gitAvailable(): Promise<boolean> {
    if (process.env['EW_SNAPSHOT_NO_GIT'] === '1') return Promise.resolve(false)
    if (!gitProbe) {
      gitProbe = execFileAsync('git', ['--version'])
        .then(() => true)
        .catch(() => false)
    }
    return gitProbe
  }

  async function git(dir: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: dir,
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout
  }

  function seedGitignore(dir: string): void {
    const path = join(dir, '.gitignore')
    try {
      if (existsSync(path)) {
        // Respect a user-authored ignore; append our block once.
        const existing = readFileSync(path, 'utf8')
        if (existing.includes(GITIGNORE_MARKER)) return
        const sep = existing.endsWith('\n') ? '\n' : '\n\n'
        writeFileSync(path, existing + sep + GITIGNORE_BODY, 'utf8')
        return
      }
      writeFileSync(path, GITIGNORE_BODY, 'utf8')
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

  /** A quit that abandons an in-flight `git add`/`commit` (the ritual
   * is time-bounded; a first-ever multi-GB commit can exceed it) orphans
   * `.git/index.lock`, after which every later snapshot fails with only a
   * logged error — the worst failure mode for a backup. The engine
   * serializes its OWN git ops and the project dir is app-managed, so a
   * lock present at snapshot start is stale by construction: sweep it
   * (carried from the AI-IMP-120 review). */
  function sweepStaleIndexLock(dir: string): void {
    const lock = join(dir, '.git', 'index.lock')
    if (!existsSync(lock)) return
    try {
      rmSync(lock)
      console.warn('[snapshot] removed a stale .git/index.lock before committing')
    } catch (err) {
      console.error('[snapshot] failed to remove stale index.lock:', err)
    }
  }

  async function ensureGitReady(dir: string): Promise<void> {
    seedGitignore(dir)
    if (existsSync(join(dir, '.git'))) sweepStaleIndexLock(dir)
    if (!existsSync(join(dir, '.git'))) {
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
  }

  function commitMessage(trigger: SnapshotTrigger, notes: number, assets: number): string {
    const label =
      trigger === 'idle' ? 'idle checkpoint' : trigger === 'end-session' ? 'end session' : 'checkpoint'
    const when = new Date().toISOString()
    return `Snapshot: ${label} — ${notes} note${notes === 1 ? '' : 's'}, ${assets} asset${
      assets === 1 ? '' : 's'
    } — ${when}`
  }

  async function commitIfChanged(
    dir: string,
    trigger: SnapshotTrigger,
    notes: number,
    assets: number,
  ): Promise<void> {
    await git(dir, ['add', '-A'])
    // Empty-diff guard: a checkpoint with nothing new since the last
    // snapshot creates NO commit (RFC-0001 §11.4).
    const status = await git(dir, ['status', '--porcelain'])
    if (status.trim().length === 0) return
    await git(dir, ['commit', '-q', '-m', commitMessage(trigger, notes, assets)])
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
    await deps.callUtility({ type: 'checkpoint-wal' })
    if (!enabled || !hasGit) return

    const dir = deps.projectDir()
    await ensureGitReady(dir)
    await commitIfChanged(dir, trigger, notes, assets)
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
    if (!existsSync(gitDir)) return { gitAvailable: hasGit, sizeBytes: null }
    const size = dirSize(gitDir) + (hasGit ? await workingDelta(dir) : 0)
    return { gitAvailable: hasGit, sizeBytes: size }
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

  async function restore(sha: string): Promise<RestoreResult> {
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
    runSnapshot,
    dispose,
  }
}
