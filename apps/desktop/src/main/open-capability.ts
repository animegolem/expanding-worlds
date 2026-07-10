import { randomUUID } from 'node:crypto'

export interface OpenCapabilitySender {
  readonly id: number
  once(event: 'destroyed', listener: () => void): unknown
}

interface OpenCapability {
  senderId: number
  dir: string
}

/**
 * Main-owned, one-use authority to open a project that main just
 * materialized. The renderer may display the directory, but only this
 * opaque token can drive relaunch, and only from the renderer that
 * received it.
 */
export class MaterializedProjectOpenRegistry {
  readonly #entries = new Map<string, OpenCapability>()
  readonly #nextToken: () => string

  constructor(nextToken: () => string = randomUUID) {
    this.#nextToken = nextToken
  }

  issue(sender: OpenCapabilitySender, dir: string): string {
    const token = this.#nextToken()
    this.#entries.set(token, { senderId: sender.id, dir })
    sender.once('destroyed', () => this.#entries.delete(token))
    return token
  }

  consume(sender: Pick<OpenCapabilitySender, 'id'>, token: unknown): string | null {
    if (typeof token !== 'string') return null
    const entry = this.#entries.get(token)
    if (!entry || entry.senderId !== sender.id) return null
    this.#entries.delete(token)
    return entry.dir
  }
}
