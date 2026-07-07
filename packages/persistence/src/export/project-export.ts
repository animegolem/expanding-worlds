import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ZipFile } from 'yazl'
import { Db } from '../db'
import { blobRelativePath } from '../import/store'
import { filterActiveOnly } from './active-only'
import {
  DB_ENTRY,
  EXPORT_VERSION,
  MANIFEST_ENTRY,
  type ExportManifest,
  type ManifestEntry,
} from './manifest'

/**
 * The §16 portable export (AI-IMP-157; container ratified rev 0.57):
 * stream one `.ewproj` ZIP — manifest + consistent database copy +
 * readable notes tree + original assets. The caller (the service
 * seam) refreshes the notes tree and checkpoints the WAL FIRST; this
 * module owns the consistent copy, the inventory, and the archive.
 *
 * Memory posture (§16 NFR): the database copy is `VACUUM INTO` (SQLite
 * streams it page-wise), asset entries are STORED file streams (media
 * is already compressed — deflate would burn CPU for nothing), db and
 * notes deflate as streams, and entries are handed to yazl by PATH so
 * it opens one file descriptor at a time however many assets exist.
 */

export interface ExportProgress {
  /** Archive bytes written so far. Because media dominates and enters
   * STORED, written bytes track source bytes closely — the honest
   * progress denominator is the source total. */
  bytesWritten: number
  bytesTotal: number
}

export interface ExportResult {
  /** Final archive size on disk. */
  bytesWritten: number
  entries: number
  notes: number
  assets: number
}

export interface ExportOptions {
  activeOnly: boolean
  onProgress?: (p: ExportProgress) => void
}

interface ProjectRow {
  id: string
  root_node_id: string
  title: string
  schema_version: number
}

const NOTES_DIR = 'notes'

/** sha256 of a file, streamed. */
function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** Every asset hash the archive carries (asset rows keep their trashed
 * lifecycle in a full export per §16; the active-only variant filters
 * the temp copy first — AI-IMP-157 second slice). */
function assetHashes(db: Db): string[] {
  return db
    .all<{ content_hash: string }>('SELECT DISTINCT content_hash FROM asset ORDER BY content_hash')
    .map((r) => r.content_hash)
}

/** Estimate the export's source size for the §16 rev-0.18 live footer:
 * database file + notes tree + asset blobs, by stat — no archive work.
 * Missing files count zero (the export itself fails loudly instead). */
export async function estimateExportSize(handle: { db: Db; dir: string }): Promise<number> {
  const safeSize = async (path: string): Promise<number> => {
    try {
      return (await stat(path)).size
    } catch {
      return 0
    }
  }
  let total = await safeSize(join(handle.dir, 'project.sqlite'))
  try {
    for (const entry of await readdir(join(handle.dir, NOTES_DIR))) {
      if (entry.endsWith('.md')) total += await safeSize(join(handle.dir, NOTES_DIR, entry))
    }
  } catch {
    // No notes tree yet — the export path writes one; the estimate
    // simply omits it (bodies are small beside media).
  }
  for (const hash of assetHashes(handle.db)) {
    total += await safeSize(join(handle.dir, blobRelativePath(hash)))
  }
  return total
}

/**
 * Write the `.ewproj` archive. `handle.db` must be the LIVE connection
 * (the consistent copy is taken through it via VACUUM INTO); the
 * caller has already refreshed `notes/` and checkpointed the WAL.
 */
export async function exportProject(
  handle: { db: Db; dir: string },
  destPath: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const { db, dir } = handle

  // Consistent snapshot of the database — VACUUM INTO writes a fresh,
  // compact copy through SQLite itself. Everything the archive claims
  // (project row, asset set) is read from THIS copy, so the manifest
  // can never disagree with the database it ships beside.
  const tempDir = join(dir, '.tmp-export')
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })
  const tempDb = join(tempDir, DB_ENTRY)

  try {
    db.prepare('VACUUM INTO ?').run(tempDb)
    if (options.activeOnly) filterActiveOnly(tempDb)

    const snapshot = Db.open(tempDb, { readOnly: true })
    const project = snapshot.get<ProjectRow>(
      'SELECT id, root_node_id, title, schema_version FROM project',
    )
    const hashes = assetHashes(snapshot)
    snapshot.close()
    if (!project) throw new Error('export: project row missing')

    // ---- plan the entries -------------------------------------------
    type Planned = { zipPath: string; filePath: string; compress: boolean; bytes: number }
    const planned: Planned[] = []

    planned.push({
      zipPath: DB_ENTRY,
      filePath: tempDb,
      compress: true,
      bytes: statSync(tempDb).size,
    })

    let noteCount = 0
    try {
      const noteFiles = (await readdir(join(dir, NOTES_DIR)))
        .filter((f) => f.endsWith('.md'))
        .sort()
      for (const file of noteFiles) {
        const filePath = join(dir, NOTES_DIR, file)
        planned.push({
          zipPath: `${NOTES_DIR}/${file}`,
          filePath,
          compress: true,
          bytes: (await stat(filePath)).size,
        })
        noteCount += 1
      }
    } catch {
      // No notes directory: a project that never wrote one exports
      // without the tree; the database remains authoritative.
    }

    for (const hash of hashes) {
      const rel = blobRelativePath(hash)
      const filePath = join(dir, rel)
      const size = (await stat(filePath)).size // a missing blob throws — honest failure
      planned.push({ zipPath: rel.replaceAll('\\', '/'), filePath, compress: false, bytes: size })
    }

    // ---- inventory hashes --------------------------------------------
    // Assets skip re-hashing: their store path IS their content hash
    // (verified at import while streaming). The db and notes hash here.
    const inventory: ManifestEntry[] = []
    for (const p of planned) {
      const sha256 = p.compress ? await hashFile(p.filePath) : p.zipPath.split('/').pop()!
      inventory.push({ path: p.zipPath, sha256, bytes: p.bytes })
    }

    const manifest: ExportManifest = {
      exportVersion: EXPORT_VERSION,
      schemaVersion: project.schema_version,
      projectId: project.id,
      rootNodeId: project.root_node_id,
      title: project.title,
      createdAt: new Date().toISOString(),
      activeOnly: options.activeOnly,
      counts: { notes: noteCount, assets: hashes.length },
      inventory,
    }

    // ---- stream the archive ------------------------------------------
    const bytesTotal = planned.reduce((sum, p) => sum + p.bytes, 0)
    mkdirSync(dirname(destPath), { recursive: true })
    const zip = new ZipFile()
    const out = createWriteStream(destPath)
    let bytesWritten = 0
    let lastReport = 0
    zip.outputStream.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length
      // Throttle: report at ~1% steps so a multi-GB export doesn't
      // flood the process seam.
      if (bytesWritten - lastReport >= Math.max(bytesTotal / 100, 1 << 20)) {
        lastReport = bytesWritten
        options.onProgress?.({ bytesWritten, bytesTotal })
      }
    })
    const done = new Promise<void>((resolve, reject) => {
      out.on('error', reject)
      zip.outputStream.on('error', reject)
      zip.outputStream.pipe(out).on('close', resolve)
    })

    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), MANIFEST_ENTRY, {
      compress: true,
    })
    for (const p of planned) {
      // By PATH: yazl stats and opens lazily, one fd at a time.
      zip.addFile(p.filePath, p.zipPath, { compress: p.compress })
    }
    zip.end()
    await done
    options.onProgress?.({ bytesWritten, bytesTotal })

    return {
      bytesWritten: statSync(destPath).size,
      entries: planned.length + 1,
      notes: noteCount,
      assets: hashes.length,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
