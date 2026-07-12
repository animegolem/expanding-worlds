// Single-winner probe worker (AI-IMP-226). Joins a file barrier so all
// siblings race ProjectLock.acquire at the same instant (no wall-clock
// guessing — a straggler that started late would otherwise acquire after
// the winner released and count as a spurious second winner), then reports
// the outcome on stdout: WIN (took the lock), LOCKED (refused), or ERR.
// A winner HOLDS the lock past every sibling's attempt so a fast release
// cannot hand a second WIN to a loser — the probe asserts exactly one
// winner is live per round.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers'

const [dir, staleStr, barrierDir, holdStr, delayAfterGoStr = '0'] = process.argv.slice(2)
const { ProjectLock, ProjectLockedError } = await import('../dist/index.js')

const staleAfterMs = Number(staleStr)
const holdMs = Number(holdStr)
const delayAfterGoMs = Number(delayAfterGoStr)
const settledPath = join(barrierDir, 'settled')

function markAttempted() {
  writeFileSync(join(barrierDir, `attempted.${process.pid}`), '')
}

function pathState(path) {
  try {
    return `present(ageMs=${Math.round(Date.now() - statSync(path).mtimeMs)})`
  } catch (err) {
    return `absent(${err?.code ?? 'unknown'})`
  }
}

function lockState(path) {
  try {
    const ageMs = Math.round(Date.now() - statSync(path).mtimeMs)
    const holder = JSON.parse(readFileSync(path, 'utf8'))
    return (
      `present(ageMs=${ageMs},holderPid=${String(holder?.pid)},` +
      `token=${String(holder?.token)})`
    )
  } catch (err) {
    return `unavailable(${err?.code ?? err?.name ?? 'unknown'})`
  }
}

// Announce readiness, then spin until the parent drops the "go" file —
// the parent only drops it once every worker is ready.
writeFileSync(join(barrierDir, `ready.${process.pid}`), '')
const goPath = join(barrierDir, 'go')
while (!existsSync(goPath)) {
  await new Promise((r) => setTimeout(r, 2))
}
if (delayAfterGoMs > 0) await new Promise((r) => setTimeout(r, delayAfterGoMs))

const acquireStartedAtMs = Date.now()
try {
  const lock = ProjectLock.acquire(dir, { staleAfterMs, heartbeatMs: 1000 })
  const acquiredAtMs = Date.now()
  markAttempted()
  // A fixed hold alone is not a barrier: a loaded CI runner may deschedule a
  // worker after "go" for longer than the hold, allowing a sequential second
  // winner. Keep the winner live until every sibling has completed its one
  // acquire attempt; retain the minimum hold to exercise live contention.
  await Promise.all([
    new Promise((r) => setTimeout(r, holdMs)),
    (async () => {
      while (!existsSync(settledPath)) await new Promise((r) => setTimeout(r, 2))
    })(),
  ])
  const releaseStartedAtMs = Date.now()
  lock.release()
  const releaseCompletedAtMs = Date.now()
  process.stdout.write(
    `WIN workerPid=${process.pid} ` +
      `acquireStartedAtMs=${acquireStartedAtMs} acquiredAtMs=${acquiredAtMs} ` +
      `releaseStartedAtMs=${releaseStartedAtMs} releaseCompletedAtMs=${releaseCompletedAtMs} ` +
      `postReleaseLock=${lockState(join(dir, 'project.lock'))} ` +
      `guard=${pathState(join(dir, 'project.lock.reclaim'))}\n`,
  )
  process.exit(0)
} catch (err) {
  markAttempted()
  const completedAtMs = Date.now()
  if (err instanceof ProjectLockedError) {
    process.stdout.write(
      `LOCKED workerPid=${process.pid} ` +
        `acquireStartedAtMs=${acquireStartedAtMs} completedAtMs=${completedAtMs} ` +
        `lock=${lockState(join(dir, 'project.lock'))} ` +
        `guard=${pathState(join(dir, 'project.lock.reclaim'))}\n`,
    )
    process.exit(3)
  }
  process.stdout.write(`ERR ${err?.stack ?? err}\n`)
  process.exit(1)
}
