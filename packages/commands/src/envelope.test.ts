import { describe, expect, it } from 'vitest'
import { validateEnvelope, type CommandEnvelope } from './envelope'

const valid: CommandEnvelope = {
  commandId: '01890a5d-ac96-774b-bcce-b302099a8057',
  projectId: '01890a5d-ac96-774b-bcce-b302099a8058',
  commandType: 'CreateNode',
  commandVersion: 1,
  expectedProjectRevision: 0,
  issuedAt: '2026-07-04T12:00:00.000Z',
  payload: { nodeId: '01890a5d-ac96-774b-bcce-b302099a8059' },
}

describe('validateEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    expect(validateEnvelope(valid)).toEqual([])
  })

  it('accepts a missing expectedProjectRevision (§10.1 "when applicable")', () => {
    const rest: Record<string, unknown> = { ...valid }
    delete rest['expectedProjectRevision']
    expect(validateEnvelope(rest)).toEqual([])
  })

  it('rejects non-objects', () => {
    expect(validateEnvelope(null)).toHaveLength(1)
    expect(validateEnvelope('nope')).toHaveLength(1)
  })

  it.each([
    ['commandId', { commandId: 'not-a-uuid' }],
    // Invariant 1: a syntactically valid UUIDv4 command id rejects.
    ['commandId', { commandId: 'a2f6f854-9c39-4d8f-9d40-16cf0f0a1a2b' }],
    ['projectId', { projectId: '' }],
    ['commandType', { commandType: '' }],
    ['commandVersion', { commandVersion: 0 }],
    ['commandVersion', { commandVersion: 1.5 }],
    ['expectedProjectRevision', { expectedProjectRevision: -1 }],
    ['issuedAt', { issuedAt: 'yesterday-ish' }],
  ])('flags a bad %s', (field, override) => {
    const errors = validateEnvelope({ ...valid, ...override })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join(' ')).toContain(field)
  })

  it('requires a payload key', () => {
    const rest: Record<string, unknown> = { ...valid }
    delete rest['payload']
    expect(validateEnvelope(rest).join(' ')).toContain('payload')
  })
})
