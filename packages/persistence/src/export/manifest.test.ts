import { describe, expect, it } from 'vitest'
import { EXPORT_VERSION, parseManifest, type ExportManifest } from './manifest'

/**
 * parseManifest is the import side's FIRST gate (before any extraction),
 * so its structural refusals are load-bearing for CA-011: `bytes` must
 * be a real non-negative integer (it is later reconciled against ZIP
 * metadata and the streamed count) and inventory paths must be unique.
 */

function baseManifest(inventory: unknown[]): string {
  const m: Omit<ExportManifest, 'inventory'> & { inventory: unknown[] } = {
    exportVersion: EXPORT_VERSION,
    schemaVersion: 1,
    projectId: 'p',
    rootNodeId: 'r',
    title: 'T',
    createdAt: new Date().toISOString(),
    activeOnly: false,
    counts: { notes: 0, assets: 0 },
    inventory,
  }
  return JSON.stringify(m)
}

describe('parseManifest byte-count and uniqueness gates (CA-011)', () => {
  it('accepts a well-formed inventory', () => {
    const text = baseManifest([{ path: 'notes/a.md', sha256: 'a'.repeat(64), bytes: 12 }])
    expect(() => parseManifest(text)).not.toThrow()
  })

  it('refuses a negative byte count', () => {
    const text = baseManifest([{ path: 'notes/a.md', sha256: 'a'.repeat(64), bytes: -1 }])
    expect(() => parseManifest(text)).toThrow(/invalid byte count/)
  })

  it('refuses a fractional byte count', () => {
    const text = baseManifest([{ path: 'notes/a.md', sha256: 'a'.repeat(64), bytes: 1.5 }])
    expect(() => parseManifest(text)).toThrow(/invalid byte count/)
  })

  it('refuses a byte count beyond the safe-integer range', () => {
    const text = baseManifest([
      { path: 'notes/a.md', sha256: 'a'.repeat(64), bytes: Number.MAX_SAFE_INTEGER + 2 },
    ])
    expect(() => parseManifest(text)).toThrow(/invalid byte count/)
  })

  it('refuses a duplicate inventory path', () => {
    const text = baseManifest([
      { path: 'notes/a.md', sha256: 'a'.repeat(64), bytes: 12 },
      { path: 'notes/a.md', sha256: 'b'.repeat(64), bytes: 34 },
    ])
    expect(() => parseManifest(text)).toThrow(/duplicate path/)
  })
})
