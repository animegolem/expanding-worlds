import { uuidv7 } from '@ew/domain'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProjectService, type ProjectService } from '../service'
import { blobPath } from './store'

/**
 * §14.4 ingest-by-copy (AI-IMP-090): bytes hash-copy through the
 * staged pipeline into an unplaced node; tags cross by the border
 * decision, merging by name_key; provenance names the source; the
 * destination references nothing outside itself (§16).
 */

// Minimal valid PNG (parsers covered in sniff.test.ts).
function pngBytes(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'latin1')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8
  ihdr[17] = 6
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    iend,
  ])
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function execute(service: ProjectService, commandType: string, payload: unknown): void {
  const result = service.execute({
    commandId: uuidv7(),
    projectId: service.info().projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
  if (result.status !== 'committed') {
    throw new Error(`${commandType} did not commit: ${JSON.stringify(result)}`)
  }
}

function nodeTags(service: ProjectService, nodeId: string): { id: string; name: string }[] {
  const response = service.query('listNodeTags', { nodeId })
  if (!response.ok) throw new Error('listNodeTags failed')
  return response.result as { id: string; name: string }[]
}

/** Import bytes into a project and hang a tagged image node on them
 * — the library-entry shape §14.4 describes. */
async function seedTaggedImage(
  service: ProjectService,
  bytes: Buffer,
  filename: string,
  tags: { name: string; color?: string }[],
  sourceUrl?: string,
): Promise<{ assetId: string; nodeId: string }> {
  const { assetId } = await service.importAsset({
    bytes,
    originalFilename: filename,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  })
  const nodeId = uuidv7()
  execute(service, 'CreateNode', { nodeId })
  execute(service, 'SetNodeAppearance', {
    nodeId,
    appearance: { kind: 'image', assetId, crop: null },
  })
  for (const tag of tags) {
    const tagId = uuidv7()
    execute(service, 'CreateTag', { tagId, name: tag.name, color: tag.color ?? null })
    execute(service, 'AssignTagToNode', { tagId, nodeId })
  }
  return { assetId, nodeId }
}

describe('ingestFromSource (§14.4 ingest-by-copy with the tag border)', () => {
  let sourceDir: string
  let destDir: string
  let sourceOwner: ProjectService
  let source: ProjectService
  let dest: ProjectService
  const bytes = pngBytes(64, 48)
  const hash = sha256(bytes)

  beforeEach(async () => {
    sourceDir = mkdtempSync(join(tmpdir(), 'ew-ingest-src-'))
    destDir = mkdtempSync(join(tmpdir(), 'ew-ingest-dst-'))
    sourceOwner = openProjectService(sourceDir, { createIfMissing: true, title: 'Library' })
    await seedTaggedImage(
      sourceOwner,
      bytes,
      'coast.png',
      [{ name: 'Coastal Towns', color: '#3af' }, { name: 'reference' }],
      'https://example.com/coast.png',
    )
    // Ingest reads through a §11.1 read-only open, as AI-IMP-091 will.
    source = openProjectService(sourceDir, { readOnly: true })
    dest = openProjectService(destDir, { createIfMissing: true, title: 'World' })
  })

  afterEach(() => {
    dest.close()
    source.close()
    sourceOwner.close()
    rmSync(sourceDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    rmSync(destDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })

  it('border=all: copies bytes, creates an unplaced image node, recreates tags, records provenance', async () => {
    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: 'all',
    })
    expect(result.deduplicated).toBe(false)
    // §14.4 provenance: the source project's identity in the result…
    expect(result.sourceProjectId).toBe(sourceOwner.info().projectId)

    // Bytes live in the DESTINATION's managed store.
    expect(existsSync(blobPath(destDir, hash))).toBe(true)

    const db = dest.ingestSource().db
    // …and the source URL on the destination's own asset row.
    const asset = db.get<{ content_hash: string; source_url: string | null; project_id: string }>(
      'SELECT content_hash, source_url, project_id FROM asset WHERE id = ?',
      result.assetId,
    )!
    expect(asset.content_hash).toBe(hash)
    expect(asset.source_url).toBe('https://example.com/coast.png')
    expect(asset.project_id).toBe(dest.info().projectId)

    // The node carries the image appearance and is UNPLACED (§14.1).
    const node = db.get<{ appearance_kind: string; appearance_asset_id: string }>(
      'SELECT appearance_kind, appearance_asset_id FROM node WHERE id = ?',
      result.nodeId,
    )!
    expect(node.appearance_kind).toBe('image')
    expect(node.appearance_asset_id).toBe(result.assetId)
    const placements = db.get<{ n: number }>(
      'SELECT count(*) AS n FROM placement WHERE node_id = ?',
      result.nodeId,
    )!
    expect(placements.n).toBe(0)

    // Tags recreated in the destination and assigned to the new node.
    expect(nodeTags(dest, result.nodeId).map((t) => t.name).sort()).toEqual([
      'Coastal Towns',
      'reference',
    ])
  })

  it('border=none: the node lands with zero tags and no tag records are created', async () => {
    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: 'none',
    })
    expect(nodeTags(dest, result.nodeId)).toHaveLength(0)
    const tagCount = dest
      .ingestSource()
      .db.get<{ n: number }>('SELECT count(*) AS n FROM tag')!
    expect(tagCount.n).toBe(0)
  })

  it('border=pick: carries only the picked names, matched by name_key', async () => {
    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: ['  coastal   TOWNS '], // a sloppy pick still matches by name_key
    })
    expect(nodeTags(dest, result.nodeId).map((t) => t.name)).toEqual(['Coastal Towns'])
  })

  it('merges with an existing destination tag by name_key instead of creating a duplicate', async () => {
    const existingTagId = uuidv7()
    execute(dest, 'CreateTag', { tagId: existingTagId, name: 'coastal towns', color: '#000' })

    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: ['Coastal Towns'],
    })

    const assigned = nodeTags(dest, result.nodeId)
    expect(assigned).toHaveLength(1)
    // The EXISTING destination tag was assigned; its display name
    // (and identity) untouched by the merge.
    expect(assigned[0]!.id).toBe(existingTagId)
    expect(assigned[0]!.name).toBe('coastal towns')
    const tagCount = dest
      .ingestSource()
      .db.get<{ n: number }>('SELECT count(*) AS n FROM tag')!
    expect(tagCount.n).toBe(1)
  })

  it('dedupe: bytes already in the destination skip the recopy but the node still lands', async () => {
    await dest.importAsset({ bytes, originalFilename: 'already-here.png' })

    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: 'all',
    })
    expect(result.deduplicated).toBe(true)
    // §4.7: dedupe never merges — a fresh Asset row exists anyway,
    // and both rows share the one blob.
    const db = dest.ingestSource().db
    const assets = db.get<{ n: number }>(
      'SELECT count(*) AS n FROM asset WHERE content_hash = ?',
      hash,
    )!
    expect(assets.n).toBe(2)
    expect(existsSync(blobPath(destDir, hash))).toBe(true)
    expect(nodeTags(dest, result.nodeId)).toHaveLength(2)
  })

  it('unknown hash fails typed, leaving the destination untouched', async () => {
    const before = dest.info().revision
    await expect(
      dest.ingestFrom(source.ingestSource(), { contentHash: 'f'.repeat(64), border: 'all' }),
    ).rejects.toMatchObject({ code: 'INGEST_UNKNOWN_HASH' })
    expect(dest.info().revision).toBe(before)
  })

  it('a read-only destination refuses with EW_READ_ONLY', async () => {
    await expect(
      source.ingestFrom(dest.ingestSource(), { contentHash: hash, border: 'all' }),
    ).rejects.toMatchObject({ code: 'EW_READ_ONLY' })
  })

  it('§16 self-containment: after ingest the destination references nothing outside itself', async () => {
    const result = await dest.ingestFrom(source.ingestSource(), {
      contentHash: hash,
      border: 'all',
    })
    // Remove the source entirely: the destination must stand alone.
    source.close()
    sourceOwner.close()
    rmSync(sourceDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    sourceOwner = openProjectService(sourceDir, { createIfMissing: true, title: 'placeholder' })
    source = openProjectService(sourceDir, { readOnly: true }) // keep afterEach's handles live

    const db = dest.ingestSource().db
    // The asset's storage path resolves INSIDE the destination dir.
    const asset = db.get<{ storage_path: string }>(
      'SELECT storage_path FROM asset WHERE id = ?',
      result.assetId,
    )!
    expect(asset.storage_path.startsWith('..')).toBe(false)
    expect(join(destDir, asset.storage_path).startsWith(destDir)).toBe(true)
    expect(existsSync(join(destDir, asset.storage_path))).toBe(true)

    // Node appearance and tags all resolve within the destination db.
    const dangling = db.get<{ n: number }>(
      `SELECT count(*) AS n FROM node
       WHERE appearance_asset_id IS NOT NULL
         AND appearance_asset_id NOT IN (SELECT id FROM asset)`,
    )!
    expect(dangling.n).toBe(0)
    expect(nodeTags(dest, result.nodeId)).toHaveLength(2)
  })
})
