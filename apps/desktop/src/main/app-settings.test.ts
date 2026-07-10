import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadAppSettingsFile, writeAppSettingsFile } from './app-settings'

// CA-015 (AI-IMP-237): a crash/full-disk mid-write used to leave
// truncated JSON that the next launch silently treated as empty
// settings. These specs cover the fix: atomic writes never leave a
// half-written file at the real path, and a load that DOES find a
// broken file (e.g. from before this fix shipped) recovers loudly —
// defaults, plus the bad file preserved beside itself, plus a
// `recovered: true` the caller can announce.

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-app-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadAppSettingsFile', () => {
  it('returns empty settings, not recovered, when no file exists', () => {
    const result = loadAppSettingsFile(join(dir, 'app-settings.json'))
    expect(result).toEqual({ settings: {}, recovered: false })
  })

  it('parses a well-formed file as not recovered', () => {
    const path = join(dir, 'app-settings.json')
    writeFileSync(path, JSON.stringify({ theme: 'light' }))
    const result = loadAppSettingsFile(path)
    expect(result).toEqual({ settings: { theme: 'light' }, recovered: false })
  })

  it('recovers loudly from a truncated file: defaults, preserved original, recovered flag', () => {
    const path = join(dir, 'app-settings.json')
    // A write cut off mid-object — exactly the shape a crash mid
    // JSON.stringify/write used to leave under the old in-place
    // rewrite.
    writeFileSync(path, '{"theme":"dark","charmCor')

    const result = loadAppSettingsFile(path)

    expect(result.recovered).toBe(true)
    expect(result.settings).toEqual({})
    // The original bad file must not simply vanish — it's preserved
    // beside the good path for inspection.
    const entries = readdirSync(dir)
    const corrupt = entries.find((name) => name.startsWith('app-settings.json.corrupt-'))
    expect(corrupt).toBeDefined()
    expect(readFileSync(join(dir, corrupt!), 'utf8')).toBe('{"theme":"dark","charmCor')
    // Nothing left at the original path claiming to be valid.
    expect(entries).not.toContain('app-settings.json')
  })

  it('recovers loudly from a non-object JSON value', () => {
    const path = join(dir, 'app-settings.json')
    writeFileSync(path, '[1,2,3]')
    const result = loadAppSettingsFile(path)
    expect(result).toEqual({ settings: {}, recovered: true })
  })
})

describe('writeAppSettingsFile', () => {
  it('persists settings readable back via loadAppSettingsFile', () => {
    const path = join(dir, 'app-settings.json')
    writeAppSettingsFile(path, { theme: 'glass', windowOpacity: 0.8 })
    expect(loadAppSettingsFile(path)).toEqual({
      settings: { theme: 'glass', windowOpacity: 0.8 },
      recovered: false,
    })
  })

  it('never leaves a temp file behind on a successful write', () => {
    const path = join(dir, 'app-settings.json')
    writeAppSettingsFile(path, { theme: 'dark' })
    const entries = readdirSync(dir)
    expect(entries).toEqual(['app-settings.json'])
  })

  it('overwrites a previous value atomically (old value never partially visible)', () => {
    const path = join(dir, 'app-settings.json')
    writeAppSettingsFile(path, { theme: 'dark' })
    writeAppSettingsFile(path, { theme: 'light' })
    expect(loadAppSettingsFile(path)).toEqual({
      settings: { theme: 'light' },
      recovered: false,
    })
    // The rename target is the only thing at the real path — no
    // leftover .tmp-<pid> sibling from either write.
    expect(readdirSync(dir)).toEqual(['app-settings.json'])
  })

  it('creates the parent directory if missing', () => {
    const path = join(dir, 'nested', 'config', 'app-settings.json')
    writeAppSettingsFile(path, { theme: 'dark' })
    expect(loadAppSettingsFile(path).settings).toEqual({ theme: 'dark' })
  })
})
