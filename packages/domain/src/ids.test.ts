import { describe, expect, it } from 'vitest'
import { shortCode, uuidv7 } from './ids'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('produces RFC 9562 version and variant bits', () => {
    for (let i = 0; i < 1000; i++) {
      expect(uuidv7()).toMatch(UUID_RE)
    }
  })

  it('is strictly increasing within one process', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7())
    const sorted = [...ids].sort()
    expect(ids).toEqual(sorted)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('encodes the current time in the leading 48 bits', () => {
    const before = Date.now()
    const id = uuidv7()
    const after = Date.now()
    const ms = parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
    // Same-ms sequence overflow may borrow a leading millisecond.
    expect(ms).toBeGreaterThanOrEqual(before)
    expect(ms).toBeLessThanOrEqual(after + 10)
  })
})

describe('shortCode', () => {
  it('derives from the random tail, never the timestamp prefix', () => {
    // Same tail, different timestamps → same code.
    const tail = '8abc-def012345678'
    const a = shortCode(`00000000-0000-7000-${tail}`)
    const b = shortCode(`ffffffff-ffff-7fff-${tail}`)
    expect(a).toBe(b)
    // Same timestamp, different tails → different codes.
    const c = shortCode('00000000-0000-7000-8abc-def012345678')
    const d = shortCode('00000000-0000-7000-8abc-def012345679')
    expect(c).not.toBe(d)
  })

  it('uses the requested length and unambiguous alphabet', () => {
    const code = shortCode(uuidv7())
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]+$/)
    expect(shortCode(uuidv7(), 11)).toHaveLength(11)
  })

  it('rejects non-UUID input', () => {
    expect(() => shortCode('not-a-uuid')).toThrow()
  })
})
