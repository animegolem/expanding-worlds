/** @ew/persistence — authoritative SQLite project store (RFC-0001 §11). */
export const PACKAGE_NAME = '@ew/persistence' as const

export { Db, type SqlValue } from './db'
export { migrate } from './migrate'
export { LATEST_SCHEMA_VERSION, MIGRATIONS, type Migration } from './migrations/index'
export {
  LOCK_FILENAME,
  ProjectLock,
  ProjectLockedError,
  type LockHolder,
  type LockOptions,
} from './lock'
export {
  DB_FILENAME,
  createProject,
  openProject,
  type OpenOptions,
  type ProjectHandle,
} from './project'
export { Dispatcher, type CommandContext } from './dispatcher'
export { QueryRegistry, registerCoreQueries, type QueryFn, type QueryResult } from './queries'
export { registerNodeHandlers } from './handlers/nodes'
export { registerNoteHandlers } from './handlers/notes'
export { bindUnresolvedMatching, refreshNoteLinks } from './links'
export {
  registerNoteQueries,
  type PhantomReference,
  type PhantomView,
  type TitleSuggestion,
} from './queries-notes'
export {
  openProjectService,
  type ProjectInfo,
  type ProjectService,
  type ServiceOptions,
} from './service'
