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
export { registerAssetHandlers, registerAssetQueries } from './handlers/assets'
export {
  openProjectService,
  type ProjectInfo,
  type ProjectService,
  type ServiceOptions,
} from './service'
export {
  commitStaged,
  hashStaged,
  importAsset,
  sniffStaged,
  stageImport,
  type ImportDeps,
  type ImportInput,
  type ImportResult,
  type StagedImport,
} from './import/pipeline'
export {
  ASSETS_DIR,
  IMPORT_TMP_DIR,
  THUMBNAILS_DIR,
  blobPath,
  blobRelativePath,
  cleanImportTemp,
  ensureLayout,
  importTempDir,
  importTempRelativeDir,
  moveIntoStore,
} from './import/store'
export { SNIFF_HEADER_BYTES, sniff, type SniffResult, type SniffedFormat } from './import/sniff'
export {
  NoopThumbnailGenerator,
  claimNextJob,
  enqueueThumbnail,
  markJobDone,
  markJobFailed,
  processNextJob,
  type DerivativeCtx,
  type DerivativeGenerator,
  type DerivativeJob,
} from './import/derivatives'
