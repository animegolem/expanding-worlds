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
// §7.8 metadata block (AI-IMP-119): the lazy-refresh entry point ships
// here for EPIC-008's export/backup call sites; the live read model and
// config reader are exported for reuse and tests.
export {
  computeNoteMetadata,
  readMetadataConfig,
  refreshNoteMetadataBlock,
  sectionsFor,
  metadataNoteKey,
  METADATA_DEFAULTS_KEY,
  type MetadataConfig,
  type NoteMetadataBoard,
  type NoteMetadataProvenance,
  type NoteMetadataView,
} from './note-metadata-db'
export { getProjectSetting, setProjectSetting } from './settings'
export {
  assertManagedPath,
  assertManagedProjectLayout,
  assertManagedTree,
  UnsafeManagedPathError,
} from './path-safety'
// §16/§11.4 readable notes tree for session snapshots (AI-IMP-120).
export {
  writeNotesTree,
  safeNoteBaseName,
  assignNoteFilename,
  type NotesTreeResult,
} from './notes-tree'
// §16 portable export (AI-IMP-157; container rev 0.57).
export {
  exportProject,
  estimateExportSize,
  type ExportOptions,
  type ExportProgress,
  type ExportResult,
} from './export/project-export'
export {
  parseManifest,
  EXPORT_VERSION,
  MANIFEST_ENTRY,
  DB_ENTRY,
  type ExportManifest,
  type ManifestEntry,
} from './export/manifest'
// §16 project import (AI-IMP-158): the roundtrip's other half.
// (ImportResult is the asset pipeline's name — this one is aliased.)
export {
  importProject,
  readArchiveManifest,
  releaseImportDestination,
  reserveAvailableImportDestination,
  reserveImportDestination,
  IMPORT_RESERVATION_SUFFIX,
  type ImportDestinationReservation,
  type ImportResult as ProjectImportResult,
  type ImportRefusal,
} from './export/project-import'
// CA-011 import resource budgets (AI-IMP-234).
export { IMPORT_LIMITS, type ImportLimits } from './export/import-limits'
export { registerAssetHandlers, registerAssetQueries } from './handlers/assets'
export { registerCanvasHandlers } from './handlers/canvases'
export { registerPlacementHandlers, releaseConnectorAnchors } from './handlers/placements'
export { registerTagHandlers } from './handlers/tags'
export { registerDecorationHandlers } from './handlers/decorations'
export { registerPinHandlers } from './handlers/pin'
// AI-IMP-233: the barrel omitted bookmarks (service.ts imports it
// directly); the undo policy-matrix registry-diff test needs every
// command-handler group reachable from the package root to enumerate
// the authoritative command set.
export { registerBookmarkHandlers } from './handlers/bookmarks'
export {
  compareOrder,
  nextRenderOrder,
  orderBetween,
  orderedCanvasContent,
  rebalanceCanvas,
  RENDER_ORDER_GAP,
  type OrderedItem,
} from './render-order'
export {
  registerStructureQueries,
  type BoardFilmstrip,
  type BoardFilmstripItem,
  type CanvasContentItem,
  type OutlineCanvasRow,
  type OutlineChildRow,
  type OutlineFacetCounts,
  type OutlinePlace,
  type OutlinePreview,
  type OutlinePreviewTarget,
} from './queries-structure'
export { registerFrameHandlers } from './handlers/frames'
export {
  registerFrameQueries,
  type FrameTransitiveMembers,
  type FrameTree,
  type FrameTreeNode,
} from './queries-frames'
export {
  registerGalleryQueries,
  type GalleryIndexEntry,
  type GalleryItem,
  type GalleryKind,
} from './queries-gallery'
export { ftsMatchExpression, rebuildSearchIndex } from './search'
export {
  registerSearchQueries,
  type AssetSearchResult,
  type CanvasTextSearchResult,
  type NoteSearchResult,
  type QuickOpenEntry,
  type SearchResults,
  type TagSearchResult,
} from './queries-search'
export { registerLifecycleHandlers } from './handlers/lifecycle'
export {
  registerLifecycleQueries,
  type CanvasImpact,
  type EmptyTrashEntry,
  type NodeImpact,
  type NoteImpact,
  type TrashEntry,
  type TrashView,
} from './queries-lifecycle'
export {
  GC_GRACE_MS,
  GC_MANIFEST_PATH,
  acquireExportLease,
  computeGcEligibleBlobs,
  exportLeaseGuardedHashes,
  gcStatus,
  runGcSweep,
  type GcStatus,
  type GcSweepReport,
} from './gc'
export { runTrashRetention, type RetentionPurgeItem, type RetentionPurgeReport } from './retention'
export { runRecovery, type RecoveryCtx, type RecoveryReport } from './recovery'
export {
  openProjectService,
  type ProjectInfo,
  type ProjectService,
  type ServiceOptions,
} from './service'
export {
  ingestFromSource,
  type IngestBorder,
  type IngestInput,
  type IngestResult,
  type IngestSource,
} from './import/ingest'
export {
  applyTagSync,
  deleteTagByNameKey,
  planTagSync,
  syncTags,
  TagSyncWriteError,
  type DeleteTagByNameKeyResult,
  type PlannedTagSync,
  type TagSyncPlan,
  type TagSyncResult,
} from './tag-sync'
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
  thumbnailPath,
  thumbnailRelativePath,
} from './import/store'
export { SNIFF_HEADER_BYTES, sniff, type SniffResult, type SniffedFormat } from './import/sniff'
export {
  NoopThumbnailGenerator,
  claimNextJob,
  claimNextThumbnailJob,
  completeThumbnailJob,
  enqueueMissingThumbnails,
  enqueueThumbnail,
  markJobDone,
  markJobFailed,
  processNextJob,
  type DerivativeCtx,
  type DerivativeGenerator,
  type DerivativeJob,
  type ThumbnailJob,
} from './import/derivatives'
