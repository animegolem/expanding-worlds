// Kill-during-import fixture (AI-IMP-016): creates a project in
// argv[2], drives the staged import pipeline through the 'hashed'
// state, prints HASHED, then holds until killed — leaving the exact
// interruption state startup recovery must reconcile.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const { createProject, stageImport, hashStaged } = await import('../dist/index.js')

const handle = createProject(dir, 'Crash Import')
const deps = {
  db: handle.db,
  projectId: handle.projectId,
  dir: handle.dir,
  execute: () => {
    throw new Error('fixture never commits')
  },
  now: () => new Date().toISOString(),
}

// A real source file large enough to be honest, small enough to be fast.
const source = join(dir, 'source.png')
writeFileSync(source, randomBytes(1024 * 1024))

const staged = await stageImport(deps, { sourcePath: source, originalFilename: 'source.png' })
await hashStaged(deps, staged)
console.log('HASHED')

// Hold the project open (and the lock heartbeat alive) until SIGKILL.
setInterval(() => {}, 1000)
