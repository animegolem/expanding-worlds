import {
  COMMAND_ASSIGN_TAG_TO_NODE,
  COMMAND_CREATE_NODE,
  COMMAND_CREATE_TAG,
  COMMAND_DELETE_DRAFT_NODE,
  COMMAND_SET_NODE_APPEARANCE,
  DomainError,
  type AssignTagToNodePayload,
  type CommittedResult,
  type CreateNodePayload,
  type CreateTagPayload,
  type DeleteDraftNodePayload,
  type SetNodeAppearancePayload,
} from '@ew/commands'
import { nameKey, uuidv7 } from '@ew/domain'
import { existsSync } from 'node:fs'
import type { Db } from '../db'
import { importAsset, type ImportDeps } from './pipeline'
import { blobPath } from './store'
import { assertManagedPath } from '../path-safety'

/**
 * Cross-project ingest-by-copy (RFC-0001 §14.4, AI-IMP-090):
 * "projects source, never reference". Bytes cross the border through
 * the ordinary staged pipeline (§11.2) — hash dedupe included — into
 * an UNPLACED node with image appearance (§14.1's stashed-material
 * shape), and tags cross only by the session's border decision,
 * merging with destination tags by name_key (§4.8 normalization is
 * shared code, so keys agree across projects).
 *
 * The destination never holds a reference to the source: the blob is
 * copied, the asset row is the destination's own, and carried tags
 * are destination records — export self-containment (§16) is
 * preserved by construction.
 */

/** Read handle onto the source project; the ingest only ever reads
 * from it (SELECTs + one blob read), so a §11.1 read-only open
 * satisfies it. */
export interface IngestSource {
  db: Db
  dir: string
}

/** §14.4 tag border: carry none, all, or a picked set of tag NAMES
 * (matched against the item's own tags by name_key — the pick is
 * session-scoped, so a picked tag simply may not apply to an item). */
export type IngestBorder = 'none' | 'all' | string[]

export interface IngestInput {
  /** SHA-256 (lowercase hex) identifying the source asset's bytes. */
  contentHash: string
  border: IngestBorder
}

export interface IngestResult {
  /** The new UNPLACED destination node (image appearance). */
  nodeId: string
  /** The destination's own Asset record (§4.7: dedupe never merges,
   * so this is a fresh row even when the bytes already existed). */
  assetId: string
  /** True when the destination already held the bytes — no recopy. */
  deduplicated: boolean
  /** §14.4 provenance: the source project's id. The asset row already
   * records source_url (the pipeline's existing column); the source
   * PROJECT id has no schema home in Phase 1, so it travels in the
   * result for the caller to surface. */
  sourceProjectId: string
}

interface SourceTag {
  name: string
  name_key: string
  color: string | null
  icon: string | null
}

/** Dispatch one command into the destination or throw typed. */
function run(dest: ImportDeps, commandType: string, payload: unknown): CommittedResult {
  const result = dest.execute({
    commandId: uuidv7(),
    projectId: dest.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: dest.now(),
    payload,
  })
  if (result.status !== 'committed') {
    const message = result.status === 'error' ? result.message : 'stale expected_project_revision'
    const code = result.status === 'error' ? result.code : 'CONFLICT'
    throw new DomainError(code, `${commandType} failed during ingest: ${message}`)
  }
  return result
}

/** The source item's tags: every active tag on any active node whose
 * image appearance points at an active asset carrying this hash,
 * deduplicated by name_key (dedupe may hold several asset rows for
 * one blob; their curation facts union). */
function readSourceTags(db: Db, contentHash: string): SourceTag[] {
  const rows = db.all<SourceTag>(
    `SELECT DISTINCT t.name, t.name_key, t.color, t.icon
     FROM asset a
     JOIN node n ON n.appearance_asset_id = a.id AND n.lifecycle_state = 'active'
     JOIN tag_assignment ta ON ta.node_id = n.id
     JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
     WHERE a.content_hash = ? AND a.lifecycle_state = 'active'
     ORDER BY t.name_key`,
    contentHash,
  )
  const byKey = new Map<string, SourceTag>()
  for (const row of rows) if (!byKey.has(row.name_key)) byKey.set(row.name_key, row)
  return [...byKey.values()]
}

function carriedTags(border: IngestBorder, sourceTags: SourceTag[]): SourceTag[] {
  if (border === 'none') return []
  if (border === 'all') return sourceTags
  const pickedKeys = new Set(border.map((name) => nameKey(name)))
  return sourceTags.filter((tag) => pickedKeys.has(tag.name_key))
}

/**
 * Ingest one asset (plus its node facts) from a source project into
 * the destination. Steps: resolve the source asset row by hash → read
 * its tags → staged import of the source blob into the destination
 * (dedupe by hash comes free) → CreateNode + image appearance
 * (unplaced) → apply the tag border via find-or-create by name_key.
 *
 * Command shape (no compound command exists until AI-IMP-086): one
 * ingest commits CreateNode, SetNodeAppearance, and per carried tag
 * optionally CreateTag plus AssignTagToNode — each its own history
 * entry, so undoing an ingest is several undos. CommitAssetImport is
 * not undoable at all (§11.2).
 */
export async function ingestFromSource(
  dest: ImportDeps,
  source: IngestSource,
  input: IngestInput,
): Promise<IngestResult> {
  if (typeof input.contentHash !== 'string' || input.contentHash.length === 0) {
    throw new DomainError('VALIDATION_FAILED', 'ingest requires a contentHash')
  }
  const border = input.border
  const borderValid =
    border === 'none' ||
    border === 'all' ||
    (Array.isArray(border) && border.every((name) => typeof name === 'string'))
  if (!borderValid) {
    throw new DomainError(
      'VALIDATION_FAILED',
      "ingest border must be 'none', 'all', or an array of tag names",
    )
  }

  const srcAsset = source.db.get<{
    id: string
    project_id: string
    original_filename: string
    source_url: string | null
  }>(
    `SELECT id, project_id, original_filename, source_url FROM asset
     WHERE content_hash = ? AND lifecycle_state = 'active'
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    input.contentHash,
  )
  if (!srcAsset) {
    throw new DomainError(
      'INGEST_UNKNOWN_HASH',
      `the source project holds no active asset with hash ${input.contentHash}`,
    )
  }
  const blob = assertManagedPath(source.dir, blobPath(source.dir, input.contentHash))
  if (!existsSync(blob)) {
    throw new DomainError(
      'INGEST_BLOB_MISSING',
      `the source project's managed store is missing the blob for ${input.contentHash}`,
    )
  }
  const tags = carriedTags(border, readSourceTags(source.db, input.contentHash))

  // Ordinary staged import (§11.2): copy, sniff, re-hash, dedupe.
  // source_url provenance rides the pipeline's existing column.
  const { assetId, deduplicated } = await importAsset(dest, {
    sourcePath: blob,
    originalFilename: srcAsset.original_filename,
    ...(srcAsset.source_url !== null ? { sourceUrl: srcAsset.source_url } : {}),
  })

  const nodeId = uuidv7()
  run(dest, COMMAND_CREATE_NODE, { nodeId } satisfies CreateNodePayload)
  try {
    run(dest, COMMAND_SET_NODE_APPEARANCE, {
      nodeId,
      appearance: { kind: 'image', assetId, crop: null },
    } satisfies SetNodeAppearancePayload)
  } catch (err) {
    // Leave no bare draft node behind; the committed asset stays (it
    // is real material either way, and import is not undoable).
    try {
      run(dest, COMMAND_DELETE_DRAFT_NODE, { nodeId } satisfies DeleteDraftNodePayload)
    } catch {
      // The draft node survives; recovery/trash territory, not ours.
    }
    throw err
  }

  for (const tag of tags) {
    const existing = dest.db.get<{ id: string; lifecycle_state: string }>(
      'SELECT id, lifecycle_state FROM tag WHERE project_id = ? AND name_key = ?',
      dest.projectId,
      tag.name_key,
    )
    // A TRASHED destination tag still owns its name_key (§4.8 unique
    // index): it can be neither recreated nor assigned, so this tag
    // does not cross the border. Restoring trashed tags is a user act.
    if (existing && existing.lifecycle_state !== 'active') continue
    let tagId: string
    if (existing) {
      tagId = existing.id
    } else {
      tagId = uuidv7()
      run(dest, COMMAND_CREATE_TAG, {
        tagId,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      } satisfies CreateTagPayload)
    }
    run(dest, COMMAND_ASSIGN_TAG_TO_NODE, { tagId, nodeId } satisfies AssignTagToNodePayload)
  }

  return { nodeId, assetId, deduplicated, sourceProjectId: srcAsset.project_id }
}
