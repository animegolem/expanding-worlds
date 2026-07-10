import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { MaterializedProjectOpenRegistry } from './open-capability'

class Sender extends EventEmitter {
  constructor(readonly id: number) {
    super()
  }
}

describe('MaterializedProjectOpenRegistry', () => {
  it('binds a one-use token to the renderer that received it', () => {
    const registry = new MaterializedProjectOpenRegistry(() => 'opaque-token')
    const owner = new Sender(1)
    const other = new Sender(2)
    const token = registry.issue(owner, '/main-owned/restored-project')

    expect(registry.consume(other, token)).toBeNull()
    expect(registry.consume(owner, token)).toBe('/main-owned/restored-project')
    expect(registry.consume(owner, token)).toBeNull()
  })

  it('revokes the token when its renderer is destroyed', () => {
    const registry = new MaterializedProjectOpenRegistry(() => 'opaque-token')
    const owner = new Sender(1)
    const token = registry.issue(owner, '/main-owned/imported-project')

    owner.emit('destroyed')

    expect(registry.consume(owner, token)).toBeNull()
  })

  it('never interprets an arbitrary renderer value as a path', () => {
    const registry = new MaterializedProjectOpenRegistry()
    const owner = new Sender(1)

    expect(registry.consume(owner, '/tmp/attacker-chosen')).toBeNull()
    expect(registry.consume(owner, { dir: '/tmp/attacker-chosen' })).toBeNull()
  })
})
