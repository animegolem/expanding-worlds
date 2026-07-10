// Single-winner probe worker (AI-IMP-226). Joins a file barrier so all
// siblings race ProjectLock.acquire at the same instant (no wall-clock
// guessing — a straggler that started late would otherwise acquire after
// the winner released and count as a spurious second winner), then reports
// the outcome on stdout: WIN (took the lock), LOCKED (refused), or ERR.
// A winner HOLDS the lock past every sibling's attempt so a fast release
// cannot hand a second WIN to a loser — the probe asserts exactly one
// winner is live per round.
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers'

const [dir, staleStr, barrierDir, holdStr] = process.argv.slice(2)
const { ProjectLock, ProjectLockedError } = await import('../dist/index.js')

const staleAfterMs = Number(staleStr)
const holdMs = Number(holdStr)

function pathState(path) {
  try {
    return `present(ageMs=${Math.round(Date.now() - statSync(path).mtimeMs)})`
  } catch (err) {
    return `absent(${err?.code ?? 'unknown'})`
  }
}

// Announce readiness, then spin until the parent drops the "go" file —
// the parent only drops it once every worker is ready.
writeFileSync(join(barrierDir, `ready.${process.pid}`), '')
const goPath = join(barrierDir, 'go')
while (!existsSync(goPath)) {
  await new Promise((r) => setTimeout(r, 2))
}

try {
  const lock = ProjectLock.acquire(dir, { staleAfterMs, heartbeatMs: 1000 })
  process.stdout.write('WIN\n')
  await new Promise((r) => setTimeout(r, holdMs))
  lock.release()
  process.exit(0)
} catch (err) {
  if (err instanceof ProjectLockedError) {
    process.stdout.write(
      `LOCKED lock=${pathState(join(dir, 'project.lock'))} ` +
        `guard=${pathState(join(dir, 'project.lock.reclaim'))}\n`,
    )
    process.exit(3)
  }
  process.stdout.write(`ERR ${err?.stack ?? err}\n`)
  process.exit(1)
}
