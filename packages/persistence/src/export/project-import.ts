import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import yauzl from 'yauzl'
import { Db } from '../db'
import { blobRelativePath } from '../import/store'
import { LATEST_SCHEMA_VERSION } from '../migrations/index'
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

interface OpenZip {
  zip: yauzl.ZipFile
  entries: Map<string, yauzl.Entry>
}

/** Read the full central directory once; every lookup after this is
 * by name. Rejects duplicate entry names outright (a crafted archive
 * could otherwise shadow a verified file with an unverified twin). */
function openArchive(path: string): Promise<OpenZip> {
  return new Promise((resolve, reject) => {
    // autoClose:false — the default closes the fd when the entry scan
    // ends, killing every later openReadStream; we close explicitly.
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(refuse('BAD_ARCHIVE', 'not a readable .ewproj archive'))
      const entries = new Map<string, yauzl.Entry>()
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith('/')) {
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

function readEntryBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(refuse('BAD_ARCHIVE', 'archive entry unreadable'))
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', () => reject(refuse('BAD_ARCHIVE', 'archive entry unreadable')))
    })
  })
}

/** Stream one entry to disk, hashing as it flows; resolves the hex. */
function extractEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(refuse('BAD_ARCHIVE', 'archive entry unreadable'))
      mkdirSync(dirname(dest), { recursive: true })
      const hash = createHash('sha256')
      const out = createWriteStream(dest)
      stream.on('data', (c: Buffer) => hash.update(c))
      stream.on('error', () => reject(refuse('BAD_ARCHIVE', 'archive entry unreadable')))
      out.on('error', (e) => reject(refuse('WRITE_FAILED', e.message)))
      out.on('close', () => resolve(hash.digest('hex')))
      stream.pipe(out)
    })
  })
}

/** Parse + validate the manifest without extracting anything else.
 * Exposed for the import surface's preflight (show the user what the
 * archive claims before choosing a destination). */
export async function readArchiveManifest(archivePath: string): Promise<ExportManifest> {
  const { zip, entries } = await openArchive(archivePath)
  try {
    const entry = entries.get(MANIFEST_ENTRY)
    if (!entry) throw refuse('BAD_ARCHIVE', 'manifest.json missing from archive')
    let manifest: ExportManifest
    try {
      manifest = parseManifest((await readEntryBuffer(zip, entry)).toString('utf8'))
    } catch (err) {
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
export async function importProject(archivePath: string, destDir: string): Promise<ImportResult> {
  const manifest = await readArchiveManifest(archivePath)
  const partial = `${destDir}.partial`
  rmSync(partial, { recursive: true, force: true })

  const { zip, entries } = await openArchive(archivePath)
  try {
    // Every inventoried entry must exist; nothing outside the
    // inventory extracts (a stowaway entry never reaches disk).
    for (const item of manifest.inventory) {
      if (!entries.has(item.path)) {
        throw refuse('INCOMPLETE_ARCHIVE', `archive is missing ${item.path}`)
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
      const hash = await extractEntry(zip, entry, dest)
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
  } catch (err) {
    rmSync(partial, { recursive: true, force: true })
    throw err
  } finally {
    zip.close()
  }
}
