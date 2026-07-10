import { describe, expect, it } from 'vitest'
import { DomainError } from './envelope'
import { CommandRegistry, type HandlerOutcome } from './registry'

const outcome: HandlerOutcome = { affected: [], inverse: null }

describe('CommandRegistry', () => {
  it('resolves an exact (type, version) match', () => {
    const registry = new CommandRegistry<null>()
    registry.register('CreateNode', 1, () => outcome)
    const resolved = registry.resolve('CreateNode', 1)
    expect(resolved.targetVersion).toBe(1)
    expect(resolved.upcast({ a: 1 })).toEqual({ a: 1 })
    expect(() => resolved.validate({ a: 1 })).not.toThrow()
    expect(() => resolved.validate(null)).toThrowError(DomainError)
  })

  it('upcasts an old payload version to the handler version', () => {
    const registry = new CommandRegistry<null>()
    registry.register('MovePlacement', 3, () => outcome)
    registry.registerUpcaster('MovePlacement', 1, (p) => ({
      ...(p as object),
      rotation: 0,
    }))
    registry.registerUpcaster('MovePlacement', 2, (p) => ({
      ...(p as object),
      scale: 1,
    }))

    const resolved = registry.resolve('MovePlacement', 1)
    expect(resolved.targetVersion).toBe(3)
    expect(resolved.upcast({ x: 5 })).toEqual({ x: 5, rotation: 0, scale: 1 })
  })

  it('runs a command-specific validator after upcasting', () => {
    const registry = new CommandRegistry<null>()
    registry.register('MovePlacement', 2, () => outcome, (payload) => {
      if ((payload as { scale?: unknown }).scale !== 1) {
        throw new DomainError('VALIDATION_FAILED', 'scale required')
      }
    })
    registry.registerUpcaster('MovePlacement', 1, (payload) => ({
      ...(payload as object),
      scale: 1,
    }))
    const resolved = registry.resolve('MovePlacement', 1)
    const payload = resolved.upcast({ x: 2 })
    expect(() => resolved.validate(payload)).not.toThrow()
  })

  it('throws UNKNOWN_COMMAND for an unregistered type', () => {
    const registry = new CommandRegistry<null>()
    expect(() => registry.resolve('Nope', 1)).toThrowError(DomainError)
    try {
      registry.resolve('Nope', 1)
    } catch (err) {
      expect((err as DomainError).code).toBe('UNKNOWN_COMMAND')
    }
  })

  it('throws UNKNOWN_COMMAND_VERSION when the upcast chain has a gap', () => {
    const registry = new CommandRegistry<null>()
    registry.register('CreateNode', 3, () => outcome)
    registry.registerUpcaster('CreateNode', 2, (p) => p)
    try {
      registry.resolve('CreateNode', 1)
      expect.unreachable()
    } catch (err) {
      expect((err as DomainError).code).toBe('UNKNOWN_COMMAND_VERSION')
    }
  })

  it('rejects duplicate registrations', () => {
    const registry = new CommandRegistry<null>()
    registry.register('CreateNode', 1, () => outcome)
    expect(() => registry.register('CreateNode', 1, () => outcome)).toThrow(/duplicate/)
    registry.registerUpcaster('CreateNode', 1, (p) => p)
    expect(() => registry.registerUpcaster('CreateNode', 1, (p) => p)).toThrow(/duplicate/)
  })
})
