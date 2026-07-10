import { createHash, randomUUID } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { cp, open, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import yauzl from 'yauzl'
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

/**
 * Test-only seams. Kept off {@link ExportOptions} so the public,
 * service-forwarded options never carry them: the service seam calls
 * {@link exportProject} with three arguments, so in production `hooks`
 * stays `{}`.
 */
export interface ExportHooks {
  /** Awaited after the inventory is hashed and sealed, immediately
   * before the archive streams its entries. AI-IMP-179 uses it to
   * rewrite the LIVE notes tree at exactly the between-hash-and-stream
   * moment and prove the stream reads the frozen staging copy, never the
   * mutated live file. */
  beforeStream?: () => void | Promise<void>
  /** Awaited after the partial is written, fsynced, and verified but
   * BEFORE the atomic rename into place. AI-IMP-229 throws here to
   * prove a promotion failure leaves the prior backup untouched and
   * removes only the partial. */
  beforeRename?: () => void | Promise<void>
}

interface ProjectRow {
  id: string
  root_node_id: string
  title: string
  schema_version: number
}

const NOTES_DIR = 'notes'

/** The OS-temp prefix for a single export's private staging dir
 * (AI-IMP-223). Distinct from the persistence tests' own `ew-export-`
 * fixture dirs so the orphan sweep below never mistakes a fixture (or a
 * project) for staging. */
const STAGING_PREFIX = 'ew-export-stage-'

/** Staging older than this is an orphan a crashed export left behind
 * before its `finally` could clean it; the next export sweeps it. A day
 * is generous over any real export (even a multi-GB archive finishes in
 * minutes) yet safely above a CONCURRENT export's fresh staging — that
 * isolation is the whole point (Sol CA-010 / Terra P3). */
const STAGING_ORPHAN_MS = 24 * 60 * 60 * 1000

/** Reclaim aged staging dirs from exports that crashed past their
 * `finally`. Best-effort: a dir that vanishes mid-walk or resists
 * removal is skipped, never fatal to the export about to run. Only dirs
 * older than {@link STAGING_ORPHAN_MS} are eligible, so a concurrent
 * export's live staging is never touched. */
function sweepOrphanStagingDirs(): void {
  const root = tmpdir()
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return
  }
  const cutoff = Date.now() - STAGING_ORPHAN_MS
  for (const name of names) {
    if (!name.startsWith(STAGING_PREFIX)) continue
    const path = join(root, name)
    try {
      if (statSync(path).mtimeMs < cutoff) rmSync(path, { recursive: true, force: true })
    } catch {
      // Raced away or unreadable — nothing to reclaim here.
    }
  }
}

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

/** Open a written archive's central directory for verification. Lazy
 * entries + explicit close: yauzl's default fd-autoclose fires when the
 * entry scan ends and would kill every later `openReadStream`. */
function openZipForVerify(
  path: string,
): Promise<{ zip: yauzl.ZipFile; entries: Map<string, yauzl.Entry> }> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('export verify: archive unreadable'))
      const entries = new Map<string, yauzl.Entry>()
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith('/')) entries.set(entry.fileName, entry)
        zip.readEntry()
      })
      zip.on('end', () => resolve({ zip, entries }))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

/** sha256 of one archive entry, streamed. yauzl checks the entry CRC as
 * it inflates, so a truncated or corrupt write rejects here too. */
function hashZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('export verify: entry unreadable'))
      const hash = createHash('sha256')
      stream.on('data', (c: Buffer) => hash.update(c))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  })
}

/**
 * Re-read the just-written archive and prove every manifest entry is
 * present and matches the sha256 sealed before streaming. This is what
 * makes the atomic rename meaningful (CA-009): a full-but-corrupt write
 * (short write, disk error, bad CRC) is caught here and the partial is
 * discarded instead of promoted over a prior good backup. Assets are
 * STORED under their content hash as their name, so this re-confirms
 * them as well as the deflated db and notes entries.
 */
async function verifyArchive(archivePath: string, manifest: ExportManifest): Promise<void> {
  const { zip, entries } = await openZipForVerify(archivePath)
  try {
    if (!entries.has(MANIFEST_ENTRY)) {
      throw new Error('export verify: manifest.json missing from the written archive')
    }
    for (const item of manifest.inventory) {
      const entry = entries.get(item.path)
      if (!entry) throw new Error(`export verify: ${item.path} missing from the written archive`)
      const actual = await hashZipEntry(zip, entry)
      if (actual !== item.sha256) {
        throw new Error(`export verify: ${item.path} does not match its manifest hash`)
      }
    }
  } finally {
    zip.close()
  }
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
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  const { db, dir } = handle

  // Consistent snapshot of the database — VACUUM INTO writes a fresh,
  // compact copy through SQLite itself. Everything the archive claims
  // (project row, asset set) is read from THIS copy, so the manifest
  // can never disagree with the database it ships beside.
  //
  // Staging is a PER-REQUEST dir in OS temp, OUTSIDE the project
  // entirely (AI-IMP-223). Two concurrent exports get distinct mkdtemp
  // dirs, so neither can rm+recreate the other's frozen copy mid-write
  // (Terra P3); and a snapshot's `git add` can never sweep staging that
  // no longer lives inside the project dir (Sol CA-010). VACUUM INTO and
  // the notes `cp` below are real SQLite/filesystem WRITES, not renames,
  // so staging on a different filesystem than the project is fine — the
  // atomic `.partial` rename that finalizes the archive (AI-IMP-229)
  // still lands beside destPath, unaffected. The `finally` removes this
  // dir; a crash that skips the `finally` is reclaimed by the orphan
  // sweep at the next export start.
  sweepOrphanStagingDirs()
  const tempDir = mkdtempSync(join(tmpdir(), STAGING_PREFIX))
  const tempDb = join(tempDir, DB_ENTRY)

  // Set once the partial archive exists; cleared only after it is
  // atomically renamed into place. The finally removes any leftover, so
  // a failed export never promotes a partial over a prior good backup.
  let partialPath: string | null = null

  try {
    db.prepare('VACUUM INTO ?').run(tempDb)
    if (options.activeOnly) filterActiveOnly(tempDb)

    // Freeze the notes tree the same way the database is frozen: copy it
    // into the export's private staging dir and hash+stream that COPY.
    // A concurrent snapshot `writeNotesTree` rewrites the LIVE tree only,
    // so it can never make the archived bytes disagree with the manifest
    // hash (AI-IMP-179 — the export-vs-snapshot race). VACUUM INTO already
    // gives project.sqlite this immunity; the copy extends it to notes.
    const frozenNotesDir = join(tempDir, NOTES_DIR)
    try {
      await cp(join(dir, NOTES_DIR), frozenNotesDir, { recursive: true })
    } catch {
      // No notes tree to freeze — the planning loop below tolerates its
      // absence and the database stays authoritative.
    }

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
      // Read the FROZEN copy, never the live tree — both the hash pass
      // and the stream below resolve through these paths.
      const noteFiles = (await readdir(frozenNotesDir))
        .filter((f) => f.endsWith('.md'))
        .sort()
      for (const file of noteFiles) {
        const filePath = join(frozenNotesDir, file)
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

    // Test-only: the inventory is now hashed and sealed. A snapshot that
    // rewrites the live notes tree here (before a single entry streams)
    // must not change the archive — the entries below read the frozen
    // copy (AI-IMP-179).
    await hooks.beforeStream?.()

    // ---- stream the archive to a unique partial sibling --------------
    // CA-009: write to `${dest}.partial-<uuid>`, fsync, verify against
    // the sealed manifest, then atomically rename into place. Until the
    // rename the prior file at destPath is untouched; any failure below
    // discards only the partial (the finally).
    const bytesTotal = planned.reduce((sum, p) => sum + p.bytes, 0)
    mkdirSync(dirname(destPath), { recursive: true })
    partialPath = `${destPath}.partial-${randomUUID()}`
    const zip = new ZipFile()
    const out = createWriteStream(partialPath)
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

    // Durability: force the archive bytes to stable storage before we
    // promote it. fsync is per-inode, so a fresh read handle suffices.
    const fh = await open(partialPath, 'r')
    try {
      await fh.sync()
    } finally {
      await fh.close()
    }

    // Prove the finished archive matches the manifest it carries — a
    // full-but-corrupt write must never be renamed over a good backup.
    await verifyArchive(partialPath, manifest)

    // Test seam: fail AFTER the partial is written, fsynced, and
    // verified but BEFORE the promote, so a spec can prove the prior
    // backup survives a rename/crash at exactly this moment (AI-IMP-229).
    await hooks.beforeRename?.()

    // Atomic promote: the only line that touches destPath.
    renameSync(partialPath, destPath)
    const finalSize = statSync(destPath).size
    partialPath = null

    return {
      bytesWritten: finalSize,
      entries: planned.length + 1,
      notes: noteCount,
      assets: hashes.length,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
    if (partialPath) rmSync(partialPath, { force: true })
  }
}
