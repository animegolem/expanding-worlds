/** Asset command payloads (§4.7, §11.2). Grown by AI-IMP-014. */

/**
 * Internal command issued by the import pipeline once bytes are
 * hashed, sniffed, and moved into content-addressed storage. Commits
 * the Asset record through the dispatcher so revision, command_log,
 * and project-changed events behave like any mutation (§11.2).
 *
 * Not user-invertible: importing is not undoable in Phase 1 (the
 * blob is already in managed storage and dedupe may share it), so the
 * handler returns inverse: null. Removal goes through trash/GC (§9.8).
 */
export interface CommitAssetImportPayload {
  /** Pipeline-generated UUIDv7 for the new Asset row. */
  assetId: string
  /** Phase 1 imports only raster images (§4.7). */
  kind: 'image'
  /** SHA-256 of the file bytes, lowercase hex. */
  contentHash: string
  originalFilename: string
  mimeType: string
  /** Pixel dimensions from header sniffing; null when unparsed. */
  width: number | null
  height: number | null
  /** Blob location relative to the project directory (§11.2). */
  storagePath: string
  sourceUrl?: string
}

export const COMMAND_COMMIT_ASSET_IMPORT = 'CommitAssetImport'
