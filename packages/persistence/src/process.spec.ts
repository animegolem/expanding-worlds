import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { IMPORT_TMP_DIR } from './import/store'
import { createProject } from './project'
import { openProjectService } from './service'

/**
 * Real-process integration tests (AI-IMP-016 / epic success metrics
 * 3–4). Fixtures under test-fixtures/ import the built dist; raw Node
 * cannot resolve dist's extensionless ESM imports, so each fixture is
 * esbuild-bundled (with the real package code) into a runnable .mjs
 * before spawning. Requires `pnpm -r build` first — every validation
 * chain does that.
 */

const FIXTURES = join(import.meta.dirname, '..', 'test-fixtures')

let bundleDir: string
const bundled = new Map<string, string>()

beforeAll(async () => {
  bundleDir = mkdtempSync(join(tmpdir(), 'ew-fixture-bundles-'))
  for (const script of ['lock-contender.mjs', 'import-crasher.mjs']) {
    const outfile = join(bundleDir, script)
    await build({
      entryPoints: [join(FIXTURES, script)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile,
      external: ['node:*'],
    })
    bundled.set(script, outfile)
  }
})

afterAll(() => {
  rmSync(bundleDir, { recursive: true, force: true })
})

let dir: string
let child: ChildProcess | null = null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-process-'))
})

afterEach(() => {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  child = null
  rmSync(dir, { recursive: true, force: true })
})

function runFixture(script: string, arg: string): ChildProcess {
  child = spawn(process.execPath, [bundled.get(script)!, arg], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return child
}

function waitForLine(proc: ChildProcess, marker: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = ''
    let err = ''
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for "${marker}"; stdout=${out} stderr=${err}`)),
      timeoutMs,
    )
    proc.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes(marker)) {
        clearTimeout(timer)
        resolve(out)
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    proc.on('exit', (code) => {
      if (!out.includes(marker)) {
        clearTimeout(timer)
        reject(new Error(`fixture exited ${code} before "${marker}"; stdout=${out} stderr=${err}`))
      }
    })
  })
}

function waitForExit(proc: ChildProcess, timeoutMs = 20_000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for exit')), timeoutMs)
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

describe('single-writer lock across OS processes (§11.1)', () => {
  it('refuses a second process while held and admits it after close', async () => {
    const projectDir = join(dir, 'p')
    const handle = createProject(projectDir, 'Lock Test')
    try {
      const contender = runFixture('lock-contender.mjs', projectDir)
      const output = await waitForLine(contender, 'LOCKED')
      expect(output).toContain(`LOCKED pid=${process.pid}`)
      expect(await waitForExit(contender)).toBe(3)
    } finally {
      handle.close()
    }

    const admitted = runFixture('lock-contender.mjs', projectDir)
    await waitForLine(admitted, 'OPENED')
    expect(await waitForExit(admitted)).toBe(0)
  })
})

describe('kill during import, then recovery (§11.4)', () => {
  it('reconciles the interrupted import on reopen with no partial records', async () => {
    const projectDir = join(dir, 'p')
    const crasher = runFixture('import-crasher.mjs', projectDir)
    await waitForLine(crasher, 'HASHED')
    crasher.kill('SIGKILL')
    await waitForExit(crasher)

    // The dead holder's heartbeat has stopped; reclaim its lock fast.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const service = openProjectService(projectDir, { lock: { staleAfterMs: 200 } })
    try {
      const report = service.recovery()
      expect(report.repairs.join(' ')).toMatch(/dropped interrupted import/)
      expect(report.integrityErrors).toEqual([])

      // No dangling records or files from the aborted attempt.
      const pending = service.query('getProject') // service is functional
      expect(pending.ok).toBe(true)
      const rows = readdirSync(join(projectDir, IMPORT_TMP_DIR))
      expect(rows).toEqual([])
      const assets = service.query('listAssets')
      expect(assets).toMatchObject({ ok: true, result: [] })

      // A fresh identical import now succeeds end to end.
      const redo = await service.importAsset({
        bytes: pngFixture(),
        originalFilename: 'retry.png',
      })
      expect(redo.assetId).toBeTruthy()
    } finally {
      service.close()
    }
    expect(existsSync(join(projectDir, 'project.sqlite'))).toBe(true)
  })
})

/** Minimal valid 1×1 PNG. */
function pngFixture(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB' +
        'h6FO1AAAAABJRU5ErkJggg==',
      'base64',
    ),
  )
}
