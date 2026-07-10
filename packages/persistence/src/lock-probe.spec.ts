import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Multi-process single-winner probe (AI-IMP-226, porting Sol's CA-001
 * repro). N child processes barrier-race ProjectLock.acquire against a
 * pre-planted stale corpse; exactly one must ever hold a live lock per
 * round. Runs at BOTH staleAfterMs 0 (every heartbeat is instantly
 * "stale" — maximal reclaim contention) and 30000 (production), across
 * several rounds. The pre-AI-IMP-226 rename-verify reclaim produced 2-3
 * live winners per round here; this asserts one.
 *
 * The worker fixture imports the built dist, so this needs `pnpm -r
 * build` first (every validation chain does that); esbuild bundles the
 * package source into a runnable .mjs, matching process.spec.ts.
 */

const WORKERS = 16
const ROUNDS = 5
// The winner holds well past every loser's convergence to LOCKED, so a
// release can never hand off a spurious second WIN.
const HOLD_MS = 400

const FIXTURES = join(import.meta.dirname, '..', 'test-fixtures')

let bundleDir: string
let workerBundle: string

beforeAll(async () => {
  bundleDir = mkdtempSync(join(tmpdir(), 'ew-probe-bundle-'))
  workerBundle = join(bundleDir, 'lock-probe-worker.mjs')
  await build({
    entryPoints: [join(FIXTURES, 'lock-probe-worker.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: workerBundle,
    external: ['node:*'],
    banner: {
      js: "import { createRequire as __ewCreateRequire } from 'node:module'; const require = __ewCreateRequire(import.meta.url);",
    },
  })
})

afterAll(() => {
  rmSync(bundleDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

/** A guaranteed-dead same-host pid: a child that has already exited. */
function deadSameHostPid(): number {
  const child = spawnSync(process.execPath, ['-e', ''])
  return child.pid!
}

function plantCorpse(dir: string, deadPid: number): void {
  const old = new Date(Date.now() - 120_000).toISOString()
  writeFileSync(
    join(dir, 'project.lock'),
    JSON.stringify({
      pid: deadPid,
      hostname: hostname(),
      token: 'probe-corpse',
      acquiredAt: old,
      heartbeatAt: old,
    }),
  )
}

type WorkerOutcome = { kind: 'WIN' | 'LOCKED'; diagnostic: string }

function runWorker(dir: string, staleAfterMs: number, barrierDir: string): Promise<WorkerOutcome> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [workerBundle, dir, String(staleAfterMs), barrierDir, String(HOLD_MS)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    proc.stdout.on('data', (c: Buffer) => (out += c.toString()))
    proc.stderr.on('data', (c: Buffer) => (err += c.toString()))
    proc.on('error', reject)
    // `exit` can arrive before the stdout/stderr pipes finish draining.
    // Under Linux CI's 16-process contention burst that raced this callback
    // ahead of a worker's final WIN/LOCKED write, producing a false empty
    // outcome. `close` follows stream closure, so it is the first point at
    // which the collected protocol line is authoritative.
    proc.on('close', () => {
      const line = out.trim().split('\n').pop() ?? ''
      if (line === 'WIN') resolve({ kind: 'WIN', diagnostic: line })
      else if (line.startsWith('LOCKED ')) resolve({ kind: 'LOCKED', diagnostic: line })
      else reject(new Error(`worker produced "${out.trim()}" (stderr: ${err.trim()})`))
    })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runRound(dir: string, staleAfterMs: number, deadPid: number): Promise<WorkerOutcome[]> {
  plantCorpse(dir, deadPid)
  const barrierDir = mkdtempSync(join(tmpdir(), 'ew-lock-barrier-'))
  try {
    const outcomes = Promise.all(
      Array.from({ length: WORKERS }, () => runWorker(dir, staleAfterMs, barrierDir)),
    )
    // Release the barrier only once every worker is ready, so the race is
    // truly simultaneous and no straggler acquires after the winner frees.
    const deadline = Date.now() + 30_000
    while (readdirSync(barrierDir).filter((f) => f.startsWith('ready.')).length < WORKERS) {
      if (Date.now() > deadline) throw new Error('workers never reached the barrier')
      await sleep(5)
    }
    writeFileSync(join(barrierDir, 'go'), '')
    return await outcomes
  } finally {
    rmSync(barrierDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

describe('single-writer lock under multi-process contention (AI-IMP-226 / CA-001)', () => {
  for (const staleAfterMs of [0, 30_000]) {
    it(
      `admits exactly one live winner per round at staleAfterMs ${staleAfterMs}`,
      async () => {
        const dir = mkdtempSync(join(tmpdir(), 'ew-lock-probe-'))
        const deadPid = deadSameHostPid()
        try {
          for (let round = 0; round < ROUNDS; round++) {
            const outcomes = await runRound(dir, staleAfterMs, deadPid)
            const winners = outcomes.filter((outcome) => outcome.kind === 'WIN').length
            expect(
              winners,
              `round ${round} at staleAfterMs ${staleAfterMs}: ${outcomes
                .map((outcome) => outcome.diagnostic)
                .join(' | ')}`,
            ).toBe(1)
          }
        } finally {
          rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        }
      },
      120_000,
    )
  }
})
