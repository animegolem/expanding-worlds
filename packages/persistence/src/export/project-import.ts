import { createHash, randomUUID } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'
import yauzl from 'yauzl'
import { Db } from '../db'
import { blobRelativePath } from '../import/store'
import { LATEST_SCHEMA_VERSION } from '../migrations/index'
import {
  checkEntryDeclaredSize,
  IMPORT_LIMITS,
  isFiniteNonNegativeInteger,
  type ImportLimits,
} from './import-limits'
import { DB_ENTRY, MANIFEST_ENTRY, parseManifest, type ExportManifest } from './manifest'

/**
 * §16 project import (AI-IMP-158): recreate a project from a
 * `.ewproj` archive in a NEW directory, identities preserved — wiki
 * links, bookmarks, command provenance, and Trash survive because the
 * database itself travels. Import never merges; the imported project
 * coexists with its original (locks scope to the directory).
 *
 * Refusal discipline (the artist's promise cuts both ways): the
 * manifest validates through the central directory BEFORE anything
 * extracts; every entry hash-verifies WHILE it streams; the database
 * sanity-checks before the directory exists under its real name; and
 * any failure removes the partial directory whole. There is no state
 * in which a broken import looks like a project.
 */

export interface ImportRefusal extends Error {
  code: string
}

function refuse(code: string, message: string): ImportRefusal {
  const err = new Error(message) as ImportRefusal
  err.code = code
  return err
}

export interface ImportResult {
  dir: string
  projectId: string
  title: string
  notes: number
  assets: number
}

export const IMPORT_RESERVATION_SUFFIX = '.import-reservation'

export interface ImportDestinationReservation {
  destDir: string
  token: string
}

/** Atomically reserve one final project name before any archive await. */
export function reserveImportDestination(destDir: string): ImportDestinationReservation {
  if (existsSync(destDir)) {
    throw refuse('DEST_EXISTS', `the destination already exists: ${destDir}`)
  }
  const token = randomUUID()
  const reservationPath = `${destDir}${IMPORT_RESERVATION_SUFFIX}`
  try {
    writeFileSync(reservationPath, token, { flag: 'wx', encoding: 'utf8' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw refuse('DEST_BUSY', `the destination is already being imported: ${destDir}`)
    }
    throw error
  }
  // Close the check/create race with an external directory creator.
  if (existsSync(destDir)) {
    releaseImportDestination({ destDir, token })
    throw refuse('DEST_EXISTS', `the destination already exists: ${destDir}`)
  }
  return { destDir, token }
}

/** Pick and reserve the first available `(2)`-suffixed destination. */
export function reserveAvailableImportDestination(
  preferredDestDir: string,
): ImportDestinationReservation {
  for (let n = 1; ; n += 1) {
    const destDir = n === 1 ? preferredDestDir : `${preferredDestDir} (${n})`
    try {
      return reserveImportDestination(destDir)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'DEST_EXISTS' || error.code === 'DEST_BUSY')
      ) {
        continue
      }
      throw error
    }
  }
}

/** Remove only the reservation carrying this request's token. */
export function releaseImportDestination(reservation: ImportDestinationReservation): void {
  const path = `${reservation.destDir}${IMPORT_RESERVATION_SUFFIX}`
  try {
    if (readFileSync(path, 'utf8') === reservation.token) unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

interface OpenZip {
  zip: yauzl.ZipFile
  entries: Map<string, yauzl.Entry>
}

/** Read the full central directory once; every lookup after this is
 * by name. Rejects duplicate entry names outright (a crafted archive
 * could otherwise shadow a verified file with an unverified twin).
 *
 * CA-011: the central directory is attacker-declared, so every budget
 * we can check from it is checked HERE, during the scan, before the
 * entry map is fully built and before a single byte extracts — entry
 * count, per-entry uncompressed size, compression ratio, and the
 * running aggregate. The first violation aborts the scan; nothing has
 * touched disk. `validateEntrySizes` (yauzl default true) additionally
 * asserts the local-header sizes agree with the central directory as
 * each entry inflates, and the importer stream-counts on top of that. */
function openArchive(path: string, limits: ImportLimits): Promise<OpenZip> {
  return new Promise((resolve, reject) => {
    // autoClose:false — the default closes the fd when the entry scan
    // ends, killing every later openReadStream; we close explicitly.
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(refuse('BAD_ARCHIVE', 'not a readable .ewproj archive'))
      const entries = new Map<string, yauzl.Entry>()
      let count = 0
      let aggregate = 0
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith('/')) {
          count += 1
          if (count > limits.maxEntries) {
            zip.close()
            return reject(
              refuse(
                'TOO_MANY_ENTRIES',
                `this archive has more entries than can be imported (limit ${limits.maxEntries})`,
              ),
            )
          }
          const violation = checkEntryDeclaredSize(
            entry.fileName,
            entry.uncompressedSize,
            entry.compressedSize,
            limits,
          )
          if (violation) {
            zip.close()
            return reject(refuse(violation.code, violation.message))
          }
          aggregate += entry.uncompressedSize
          if (aggregate > limits.maxAggregateUncompressedBytes) {
            zip.close()
            return reject(
              refuse(
                'ARCHIVE_TOO_LARGE',
                `this archive expands to more than can be imported ` +
                  `(over ${limits.maxAggregateUncompressedBytes} bytes)`,
              ),
            )
          }
          if (entries.has(entry.fileName)) {
            zip.close()
            return reject(refuse('BAD_ARCHIVE', `duplicate entry: ${entry.fileName}`))
          }
          entries.set(entry.fileName, entry)
        }
        zip.readEntry()
      })
      zip.on('end', () => resolve({ zip, entries }))
      zip.on('error', () => reject(refuse('BAD_ARCHIVE', 'archive read failed')))
      zip.readEntry()
    })
  })
}

/** Buffer one entry into memory, aborting the moment the streamed byte
 * count passes `maxBytes` (CA-011: a lying manifest entry could declare
 * a small size and then inflate past it — the buffer must never grow
 * unbounded, even if `validateEntrySizes` would eventually catch it). */
function readEntryBuffer(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(refuse('BAD_ARCHIVE', 'archive entry unreadable'))
      const chunks: Buffer[] = []
      let seen = 0
      stream.on('data', (c: Buffer) => {
        seen += c.length
        if (seen > maxBytes) {
          stream.destroy()
          reject(refuse('ENTRY_TOO_LARGE', 'an archive entry is larger than declared'))
          return
        }
        chunks.push(c)
      })
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', () => reject(refuse('BAD_ARCHIVE', 'archive entry unreadable')))
    })
  })
}

/** Stream one entry to disk, hashing and counting as it flows. Aborts
 * immediately if the streamed byte count passes the entry's declared
 * uncompressed size (CA-011: the declared size was budget-validated at
 * scan time, so streaming past it means the entry lied — abort before
 * the extra bytes reach disk). Resolves the hex hash and the actual
 * byte count for the caller's declared-vs-actual reconciliation. */
function extractEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  dest: string,
): Promise<{ hash: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(refuse('BAD_ARCHIVE', 'archive entry unreadable'))
      mkdirSync(dirname(dest), { recursive: true })
      const hash = createHash('sha256')
      const out = createWriteStream(dest)
      let seen = 0
      let aborted = false
      stream.on('data', (c: Buffer) => {
        if (aborted) return
        seen += c.length
        if (seen > entry.uncompressedSize) {
          aborted = true
          stream.destroy()
          out.destroy()
          reject(
            refuse(
              'SIZE_MISMATCH',
              `${entry.fileName} streamed more bytes than it declared — the archive is damaged`,
            ),
          )
          return
        }
        hash.update(c)
      })
      stream.on('error', () => {
        if (!aborted) reject(refuse('BAD_ARCHIVE', 'archive entry unreadable'))
      })
      out.on('error', (e) => {
        if (!aborted) reject(refuse('WRITE_FAILED', e.message))
      })
      out.on('close', () => {
        if (!aborted) resolve({ hash: hash.digest('hex'), bytes: seen })
      })
      stream.pipe(out)
    })
  })
}

/** Parse + validate the manifest without extracting anything else.
 * Exposed for the import surface's preflight (show the user what the
 * archive claims before choosing a destination). */
export async function readArchiveManifest(
  archivePath: string,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<ExportManifest> {
  const { zip, entries } = await openArchive(archivePath, limits)
  try {
    const entry = entries.get(MANIFEST_ENTRY)
    if (!entry) throw refuse('BAD_ARCHIVE', 'manifest.json missing from archive')
    // The manifest gets a TIGHTER cap than a generic entry: it is held
    // whole in memory and parsed as JSON, so bound it to maxManifestBytes
    // by its declared size before buffering and by the streamed count
    // while buffering (CA-011).
    if (
      !isFiniteNonNegativeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize > limits.maxManifestBytes
    ) {
      throw refuse('MANIFEST_TOO_LARGE', 'manifest.json is too large to trust')
    }
    let manifest: ExportManifest
    try {
      manifest = parseManifest(
        (await readEntryBuffer(zip, entry, limits.maxManifestBytes)).toString('utf8'),
      )
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as ImportRefusal).code === 'ENTRY_TOO_LARGE') {
        throw refuse('MANIFEST_TOO_LARGE', 'manifest.json is too large to trust')
      }
      throw refuse('BAD_MANIFEST', err instanceof Error ? err.message : String(err))
    }
    if (manifest.schemaVersion !== LATEST_SCHEMA_VERSION) {
      throw refuse(
        'SCHEMA_MISMATCH',
        `this archive was exported at schema ${manifest.schemaVersion}; ` +
          `this build reads schema ${LATEST_SCHEMA_VERSION}`,
      )
    }
    return manifest
  } finally {
    zip.close()
  }
}

/**
 * Materialize the archive into `destDir` (which must not exist).
 * Everything lands in `<destDir>.partial` first and renames into
 * place only after the last verification passes.
 */
export async function importProject(
  archivePath: string,
  destDir: string,
  limits: ImportLimits = IMPORT_LIMITS,
  reservedToken?: string,
): Promise<ImportResult> {
  const reservation =
    reservedToken === undefined
      ? reserveImportDestination(destDir)
      : { destDir, token: reservedToken }
  const reservationPath = `${destDir}${IMPORT_RESERVATION_SUFFIX}`
  const partial = `${destDir}.partial-${randomUUID()}`
  let zip: yauzl.ZipFile | null = null
  try {
    try {
      if (readFileSync(reservationPath, 'utf8') !== reservation.token) {
        throw refuse('DEST_BUSY', `the destination reservation is not owned by this import`)
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'DEST_BUSY') throw error
      throw refuse('DEST_BUSY', `the destination reservation is not available`)
    }
    // Request-owned staging. Pre-create it exclusively before the first
    // await so no other import can delete or write this tree.
    mkdirSync(partial)
    const manifest = await readArchiveManifest(archivePath, limits)
    const opened = await openArchive(archivePath, limits)
    zip = opened.zip
    const { entries } = opened
    // Every inventoried entry must exist AND must be one of the budget-
    // validated entries the scan admitted (CA-011: bind the inventory to
    // the allowed set, and reconcile each declared manifest size against
    // the central-directory size before extraction — the streamed count
    // is then reconciled against both after).
    for (const item of manifest.inventory) {
      const entry = entries.get(item.path)
      if (!entry) {
        throw refuse('INCOMPLETE_ARCHIVE', `archive is missing ${item.path}`)
      }
      if (item.bytes !== entry.uncompressedSize) {
        throw refuse(
          'SIZE_MISMATCH',
          `${item.path} disagrees with the archive on its size — the archive is damaged`,
        )
      }
    }
    for (const item of manifest.inventory) {
      const entry = entries.get(item.path)!
      // parseManifest already rejected absolute/.. paths; join stays
      // inside by construction.
      const dest = join(partial, ...item.path.split('/'))
      if (!dest.startsWith(partial + sep)) {
        throw refuse('BAD_MANIFEST', `entry path escapes the project: ${item.path}`)
      }
      const { hash, bytes } = await extractEntry(zip, entry, dest)
      // Reconcile the actual streamed count against the declared size —
      // extractEntry already aborted on an overrun, so this closes the
      // remaining gap: a SHORT entry (fewer bytes than declared).
      if (bytes !== item.bytes) {
        throw refuse(
          'SIZE_MISMATCH',
          `${item.path} does not match its declared size — the archive is damaged`,
        )
      }
      if (hash !== item.sha256) {
        throw refuse(
          'HASH_MISMATCH',
          `${item.path} does not match its manifest hash — the archive is damaged`,
        )
      }
    }

    // The database must be a working, internally consistent copy of
    // the project the manifest claims, at the schema this build reads
    // — checked BEFORE the rename, so a crafted or damaged archive
    // never becomes a directory that looks like a project (Codex
    // review round 2: hash verification binds archive↔manifest, but
    // only these checks bind manifest↔database↔blobs).
    const dbPath = join(partial, DB_ENTRY)
    let projectRow: { id: string; title: string; schema_version: number } | undefined
    try {
      const db = Db.open(dbPath, { readOnly: true })
      try {
        projectRow = db.get('SELECT id, title, schema_version FROM project')
        const quick = db.get<{ quick_check: string }>('PRAGMA quick_check(1)')
        if (quick?.quick_check !== 'ok') {
          throw refuse('BAD_DATABASE', 'the archived database fails its integrity check')
        }
        const fkViolations = db.all('PRAGMA foreign_key_check')
        if (fkViolations.length > 0) {
          throw refuse('BAD_DATABASE', 'the archived database has broken references')
        }
        // Every asset row must have its blob on disk in the partial —
        // a database that references media the archive never carried
        // would import as a project full of holes.
        const hashes = db
          .all<{ content_hash: string }>('SELECT DISTINCT content_hash FROM asset')
          .map((r) => r.content_hash)
        for (const hash of hashes) {
          // A non-canonical hash could dereference outside the store
          // or dodge the manifest's sha256===basename binding.
          if (!/^[0-9a-f]{64}$/.test(hash)) {
            throw refuse('BAD_DATABASE', 'the archived database has a malformed content hash')
          }
          const blob = join(partial, blobRelativePath(hash))
          if (!existsSync(blob)) {
            throw refuse('BAD_DATABASE', `the archive is missing media the project references`)
          }
        }
      } finally {
        db.close()
      }
    } catch (err) {
      if (err instanceof Error && 'code' in err) throw err
      throw refuse('BAD_DATABASE', 'the archived database does not open')
    }
    if (!projectRow) throw refuse('BAD_DATABASE', 'the archived database has no project row')
    if (projectRow.id !== manifest.projectId) {
      throw refuse('BAD_DATABASE', 'the archived database disagrees with the manifest')
    }
    if (projectRow.schema_version !== manifest.schemaVersion) {
      throw refuse('BAD_DATABASE', 'the archived database schema disagrees with the manifest')
    }

    renameSync(partial, destDir)
    return {
      dir: destDir,
      projectId: manifest.projectId,
      title: manifest.title,
      notes: manifest.counts.notes,
      assets: manifest.counts.assets,
    }
  } finally {
    zip?.close()
    rmSync(partial, { recursive: true, force: true })
    releaseImportDestination(reservation)
  }
}
