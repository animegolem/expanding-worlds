import {
  COMMAND_COMMIT_ASSET_IMPORT,
  DomainError,
  type CommandEnvelope,
  type CommandResult,
  type CommitAssetImportPayload,
} from '@ew/commands'
import { uuidv7 } from '@ew/domain'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from '../db'
import { SNIFF_HEADER_BYTES, sniff, type SniffResult } from './sniff'
import {
  cleanImportTemp,
  ensureLayout,
  importTempDir,
  importTempRelativeDir,
  moveIntoStore,
} from './store'
import { assertManagedPath } from '../path-safety'

/**
 * Staged asset import per RFC-0001 §11.2: copy to temp → sniff and
 * validate → hash → atomic move into content-addressed storage →
 * CommitAssetImport through the dispatcher → derivative enqueue.
 *
 * Each stage is exported so tests (and AI-IMP-016 recovery work) can
 * drive the pipeline partway; pending_imports plus the temp dir fully
 * describe an interrupted import at every stage boundary.
 *
 * File IO and hashing are async and streamed so multi-hundred-MB
 * files never block the service thread for their full duration; the
 * synchronous node:sqlite calls here are all O(1) row writes.
 *
 * Import is NOT undoable in Phase 1 (decision): CommitAssetImport
 * returns inverse: null, because the blob may be byte-shared with
 * other Assets via dedupe and removal is trash/GC territory (§9.8).
 */

export interface ImportInput {
  /** Exactly one of bytes/sourcePath must be provided. */
  bytes?: Uint8Array
  sourcePath?: string
  originalFilename: string
  sourceUrl?: string
}

export interface ImportResult {
  assetId: string
  /** True when identical bytes were already in managed storage; a new
   * Asset record is still created (§4.7 dedupe never merges). */
  deduplicated: boolean
}

/** What the pipeline needs from the composed service. */
export interface ImportDeps {
  db: Db
  projectId: string
  /** Absolute project directory (contains project.sqlite). */
  dir: string
  /** Dispatch a command through the single write path (§10). */
  execute(envelope: CommandEnvelope): CommandResult
  now(): string
}

export interface StagedImport {
  importId: string
  /** Absolute path of the staged temp file. */
  tempFile: string
  originalFilename: string
  sourceUrl: string | undefined
}

const TEMP_BLOB_NAME = 'original'

/**
 * Stage 1: create the pending_imports row ('staging') and copy the
 * bytes into the per-import temp dir. The row is written before the
 * bytes so an interrupted copy is always discoverable by recovery.
 */
export async function stageImport(deps: ImportDeps, input: ImportInput): Promise<StagedImport> {
  if ((input.bytes === undefined) === (input.sourcePath === undefined)) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'importAsset requires exactly one of bytes or sourcePath',
    )
  }
  if (typeof input.originalFilename !== 'string' || input.originalFilename.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'importAsset requires originalFilename')
  }

  await ensureLayout(deps.dir)
  const importId = uuidv7()
  const tempRelative = join(importTempRelativeDir(importId), TEMP_BLOB_NAME)
  const tempFile = assertManagedPath(deps.dir, join(deps.dir, tempRelative))
  const now = deps.now()
  deps.db.run(
    `INSERT INTO pending_imports
       (id, project_id, state, original_filename, temp_path, created_at, updated_at)
     VALUES (?, ?, 'staging', ?, ?, ?, ?)`,
    importId,
    deps.projectId,
    input.originalFilename,
    tempRelative,
    now,
    now,
  )

  const staged: StagedImport = {
    importId,
    tempFile,
    originalFilename: input.originalFilename,
    sourceUrl: input.sourceUrl,
  }
  try {
    const tempDir = assertManagedPath(deps.dir, importTempDir(deps.dir, importId))
    await mkdir(tempDir, { recursive: true })
    assertManagedPath(deps.dir, tempFile)
    if (input.bytes !== undefined) {
      await writeFile(tempFile, input.bytes)
    } else {
      await copyFile(input.sourcePath!, tempFile)
    }
  } catch (err) {
    await abandonStaged(deps, staged)
    throw new DomainError(
      'IMPORT_IO_FAILED',
      `could not stage ${input.originalFilename}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return staged
}

/**
 * Stage 2: sniff by magic bytes, never extension (§4.7). Unsupported
 * or unrecognized bytes reject with a structured notice and leave
 * zero records: temp cleaned, pending row deleted.
 */
export async function sniffStaged(deps: ImportDeps, staged: StagedImport): Promise<SniffResult> {
  const handle = await open(assertManagedPath(deps.dir, staged.tempFile), 'r')
  let header: Buffer
  try {
    const buffer = Buffer.alloc(SNIFF_HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_HEADER_BYTES, 0)
    header = buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  const result = sniff(header)
  if (!result) {
    await abandonStaged(deps, staged)
    throw new DomainError(
      'IMPORT_UNSUPPORTED_TYPE',
      `"${staged.originalFilename}" is not a supported raster image (PNG, JPEG, WebP, GIF, AVIF)`,
      { originalFilename: staged.originalFilename },
    )
  }
  return result
}

/**
 * Stage 3: streaming SHA-256 over the temp file, then advance the
 * pending row to 'hashed'. From here the import is fully described by
 * (pending row, temp file) — AI-IMP-016 recovery can resume or drop it.
 */
export async function hashStaged(deps: ImportDeps, staged: StagedImport): Promise<string> {
  const digest = createHash('sha256')
  try {
    for await (const chunk of createReadStream(assertManagedPath(deps.dir, staged.tempFile))) {
      digest.update(chunk as Buffer)
    }
  } catch (err) {
    await abandonStaged(deps, staged)
    throw new DomainError(
      'IMPORT_IO_FAILED',
      `could not hash ${staged.originalFilename}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const hash = digest.digest('hex')
  deps.db.run(
    `UPDATE pending_imports SET state = 'hashed', content_hash = ?, updated_at = ? WHERE id = ?`,
    hash,
    deps.now(),
    staged.importId,
  )
  return hash
}

/**
 * Stage 4: atomic move into content-addressed storage (skipped when
 * the blob already exists — dedupe keeps one blob, §4.7), then commit
 * the Asset row via CommitAssetImport through the dispatcher (which
 * also enqueues the thumbnail job in the same transaction), mark the
 * pending row 'committed', and clean the temp dir.
 *
 * If the dispatch fails after the move, the pending row stays at
 * 'hashed' for recovery and the moved blob is unreferenced —
 * GC-eligible via mark-and-sweep (§9.8), never a dangling Asset row.
 */
export async function commitStaged(
  deps: ImportDeps,
  staged: StagedImport,
  sniffed: SniffResult,
  hash: string,
): Promise<ImportResult> {
  const { deduplicated, storagePath } = await moveIntoStore(deps.dir, staged.tempFile, hash)

  const assetId = uuidv7()
  const payload: CommitAssetImportPayload = {
    assetId,
    kind: 'image',
    contentHash: hash,
    originalFilename: staged.originalFilename,
    mimeType: sniffed.mimeType,
    width: sniffed.width,
    height: sniffed.height,
    storagePath,
    ...(staged.sourceUrl !== undefined ? { sourceUrl: staged.sourceUrl } : {}),
  }
  const result = deps.execute({
    commandId: uuidv7(),
    projectId: deps.projectId,
    commandType: COMMAND_COMMIT_ASSET_IMPORT,
    commandVersion: 1,
    issuedAt: deps.now(),
    payload,
  })
  if (result.status !== 'committed') {
    const message =
      result.status === 'error' ? result.message : 'stale expected_project_revision'
    const code = result.status === 'error' ? result.code : 'CONFLICT'
    throw new DomainError(code, `CommitAssetImport failed: ${message}`)
  }

  deps.db.run(
    `UPDATE pending_imports SET state = 'committed', updated_at = ? WHERE id = ?`,
    deps.now(),
    staged.importId,
  )
  await cleanImportTemp(deps.dir, staged.importId)
  return { assetId, deduplicated }
}

/** Full pipeline; the ProjectService importAsset entry point. */
export async function importAsset(deps: ImportDeps, input: ImportInput): Promise<ImportResult> {
  const staged = await stageImport(deps, input)
  const sniffed = await sniffStaged(deps, staged)
  const hash = await hashStaged(deps, staged)
  return commitStaged(deps, staged, sniffed, hash)
}

/** Rejection cleanup: zero records, zero files (§4.7). */
async function abandonStaged(deps: ImportDeps, staged: StagedImport): Promise<void> {
  deps.db.run('DELETE FROM pending_imports WHERE id = ?', staged.importId)
  await cleanImportTemp(deps.dir, staged.importId)
}
