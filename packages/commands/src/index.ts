/** @ew/commands — command envelope, results, and payload types (RFC-0001 §10). */
export const PACKAGE_NAME = '@ew/commands' as const

export {
  DomainError,
  validateEnvelope,
  type AffectedRecord,
  type CommandEnvelope,
  type CommandResult,
  type CommittedResult,
  type ConflictResult,
  type ErrorResult,
  type InverseCommand,
  type ProjectChangedEvent,
} from './envelope'
export {
  CommandRegistry,
  type CommandHandler,
  type HandlerOutcome,
  type ResolvedCommand,
  type Upcaster,
} from './registry'
export * from './payloads/nodes'
export * from './payloads/notes'
export * from './payloads/assets'
export * from './payloads/structure'
export * from './payloads/lifecycle'
