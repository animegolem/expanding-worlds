import {
  type AffectedRecord,
  type CommandEnvelope,
  DomainError,
  type InverseCommand,
} from './envelope'

/** What a handler reports back to the dispatcher on success. */
export interface HandlerOutcome {
  affected: AffectedRecord[]
  inverse: InverseCommand | null
}

export type CommandHandler<Ctx, P = unknown> = (
  ctx: Ctx,
  payload: P,
  envelope: CommandEnvelope<P>,
) => HandlerOutcome

/** Translates a payload from `fromVersion` to `fromVersion + 1`. */
export type Upcaster = (payload: unknown) => unknown

export interface ResolvedCommand<Ctx> {
  handler: CommandHandler<Ctx>
  /** The version the handler expects, after upcasting. */
  targetVersion: number
  /** Applies the upcaster chain from the envelope's version. */
  upcast: (payload: unknown) => unknown
}

/**
 * (command_type, command_version) → handler lookup with an upcaster
 * hook per §10.1: older payload versions are translated forward
 * step-by-step until a registered handler version is reached. The
 * registry is IO-free; @ew/persistence instantiates it with its own
 * context type.
 */
export class CommandRegistry<Ctx> {
  #handlers = new Map<string, Map<number, CommandHandler<Ctx>>>()
  #upcasters = new Map<string, Map<number, Upcaster>>()

  register<P>(type: string, version: number, handler: CommandHandler<Ctx, P>): this {
    const versions = this.#handlers.get(type) ?? new Map<number, CommandHandler<Ctx>>()
    if (versions.has(version)) {
      throw new Error(`duplicate handler for ${type} v${version}`)
    }
    versions.set(version, handler as CommandHandler<Ctx>)
    this.#handlers.set(type, versions)
    return this
  }

  registerUpcaster(type: string, fromVersion: number, upcast: Upcaster): this {
    const steps = this.#upcasters.get(type) ?? new Map<number, Upcaster>()
    if (steps.has(fromVersion)) {
      throw new Error(`duplicate upcaster for ${type} v${fromVersion}`)
    }
    steps.set(fromVersion, upcast)
    this.#upcasters.set(type, steps)
    return this
  }

  commandTypes(): string[] {
    return [...this.#handlers.keys()]
  }

  /** Throws DomainError UNKNOWN_COMMAND when no handler is reachable. */
  resolve(type: string, version: number): ResolvedCommand<Ctx> {
    const versions = this.#handlers.get(type)
    if (!versions) {
      throw new DomainError('UNKNOWN_COMMAND', `no handler for command type ${type}`)
    }

    const chain: Upcaster[] = []
    let v = version
    // Walk upcasters until a handler version is found.
    for (;;) {
      const handler = versions.get(v)
      if (handler) {
        return {
          handler,
          targetVersion: v,
          upcast: (payload) => chain.reduce((p, step) => step(p), payload),
        }
      }
      const step = this.#upcasters.get(type)?.get(v)
      if (!step) {
        throw new DomainError(
          'UNKNOWN_COMMAND_VERSION',
          `no handler or upcast path for ${type} v${version}`,
          { commandType: type, commandVersion: version },
        )
      }
      chain.push(step)
      v += 1
    }
  }
}
