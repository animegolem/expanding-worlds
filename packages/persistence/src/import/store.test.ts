import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  blobPath,
  blobRelativePath,
  cleanImportTemp,
  ensureLayout,
  importTempDir,
  moveIntoStore,
} from './store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-store-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const HASH = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12'

describe('import store', () => {
  it('creates the §11.2 layout on demand, idempotently', async () => {
    await ensureLayout(dir)
    await ensureLayout(dir) // second call must not throw
    for (const sub of ['assets', join('derivatives', 'thumbnails'), join('cache', 'import-tmp')]) {
      expect((await stat(join(dir, sub))).isDirectory()).toBe(true)
    }
  })

  it('shards content-addressed paths by the first two hash chars', () => {
    expect(blobRelativePath(HASH)).toBe(join('assets', 'ab', HASH))
    expect(blobPath(dir, HASH)).toBe(join(dir, 'assets', 'ab', HASH))
  })

  it('gives each import its own temp dir under cache/import-tmp', () => {
    expect(importTempDir(dir, 'imp-1')).toBe(join(dir, 'cache', 'import-tmp', 'imp-1'))
    expect(importTempDir(dir, 'imp-2')).not.toBe(importTempDir(dir, 'imp-1'))
  })

  it('moves a staged file into the store via rename', async () => {
    await ensureLayout(dir)
    const temp = join(importTempDir(dir, 'imp-1'), 'original')
    await mkdir(importTempDir(dir, 'imp-1'), { recursive: true })
    await writeFile(temp, 'payload-bytes')

    const result = await moveIntoStore(dir, temp, HASH)
    expect(result).toEqual({ deduplicated: false, storagePath: blobRelativePath(HASH) })
    expect(await readFile(blobPath(dir, HASH), 'utf8')).toBe('payload-bytes')
    // The temp file is gone (renamed, not copied).
    await expect(stat(temp)).rejects.toThrow()
  })

  it('dedupes: keeps the existing blob and drops the temp file', async () => {
    await ensureLayout(dir)
    const stage = async (id: string): Promise<string> => {
      const temp = join(importTempDir(dir, id), 'original')
      await mkdir(importTempDir(dir, id), { recursive: true })
      await writeFile(temp, 'payload-bytes')
      return temp
    }
    await moveIntoStore(dir, await stage('imp-1'), HASH)
    const second = await moveIntoStore(dir, await stage('imp-2'), HASH)

    expect(second).toEqual({ deduplicated: true, storagePath: blobRelativePath(HASH) })
    expect(await readdir(join(dir, 'assets', 'ab'))).toEqual([HASH])
    await expect(stat(join(importTempDir(dir, 'imp-2'), 'original'))).rejects.toThrow()
  })

  it('cleanImportTemp removes the whole staging dir and is forgiving', async () => {
    await ensureLayout(dir)
    await mkdir(importTempDir(dir, 'imp-1'), { recursive: true })
    await writeFile(join(importTempDir(dir, 'imp-1'), 'original'), 'x')
    await cleanImportTemp(dir, 'imp-1')
    await expect(stat(importTempDir(dir, 'imp-1'))).rejects.toThrow()
    await cleanImportTemp(dir, 'imp-1') // already gone: no throw
  })
})
