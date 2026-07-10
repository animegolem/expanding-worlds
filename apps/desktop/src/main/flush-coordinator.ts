import { randomUUID } from 'node:crypto'

export type FlushOutcome = 'ok' | 'failed' | 'timeout'

export interface FlushTarget {
  readonly id: number
  isDestroyed(): boolean
  send(channel: 'app:flush', request: { requestId: string }): void
}

export interface FlushAcknowledgement {
  requestId: string
  ok: boolean
}

interface PendingFlush {
  senderId: number
  timer: ReturnType<typeof setTimeout>
  resolve: (outcome: FlushOutcome) => void
}

/** Correlated, sender-bound, per-renderer serialized flush requests. */
export class RendererFlushCoordinator {
  readonly #pending = new Map<string, PendingFlush>()
  readonly #tails = new Map<number, Promise<FlushOutcome>>()
  readonly #timeoutMs: number
  readonly #nextId: () => string

  constructor(timeoutMs = 2_000, nextId: () => string = randomUUID) {
    this.#timeoutMs = timeoutMs
    this.#nextId = nextId
  }

  flush(target: FlushTarget): Promise<FlushOutcome> {
    const prior = this.#tails.get(target.id)
    const queued = prior ? prior.then(() => this.#request(target)) : this.#request(target)
    this.#tails.set(target.id, queued)
    void queued.then(() => {
      if (this.#tails.get(target.id) === queued) this.#tails.delete(target.id)
    })
    return queued
  }

  acknowledge(senderId: number, acknowledgement: unknown): boolean {
    if (!isAcknowledgement(acknowledgement)) return false
    const pending = this.#pending.get(acknowledgement.requestId)
    if (!pending || pending.senderId !== senderId) return false
    this.#pending.delete(acknowledgement.requestId)
    clearTimeout(pending.timer)
    pending.resolve(acknowledgement.ok ? 'ok' : 'failed')
    return true
  }

  #request(target: FlushTarget): Promise<FlushOutcome> {
    if (target.isDestroyed()) return Promise.resolve('timeout')
    const requestId = this.#nextId()
    return new Promise<FlushOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId)
        resolve('timeout')
      }, this.#timeoutMs)
      this.#pending.set(requestId, { senderId: target.id, timer, resolve })
      try {
        target.send('app:flush', { requestId })
      } catch {
        clearTimeout(timer)
        this.#pending.delete(requestId)
        resolve('timeout')
      }
    })
  }
}

function isAcknowledgement(value: unknown): value is FlushAcknowledgement {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FlushAcknowledgement>
  return typeof candidate.requestId === 'string' && typeof candidate.ok === 'boolean'
}
