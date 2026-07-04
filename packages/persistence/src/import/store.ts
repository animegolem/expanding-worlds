import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Managed project file layout per RFC-0001 §11.2, created beside
 * project.sqlite:
 *
 *   assets/                content-addressed originals, sharded by
 *                          the first two hash characters
 *   derivatives/thumbnails regenerable derivatives
 *   cache/import-tmp/<id>/ per-import staging directories
 *
 * All paths handed to the database are relative to the project
 * directory so a moved project stays coherent; helpers here take the
 * absolute project dir and return absolute paths for IO.
 */

export const ASSETS_DIR = 'assets'
export const THUMBNAILS_DIR = join('derivatives', 'thumbnails')
export const IMPORT_TMP_DIR = join('cache', 'import-tmp')

/** Creates the §11.2 directory layout on demand (idempotent). */
export async function ensureLayout(dir: string): Promise<void> {
  await mkdir(join(dir, ASSETS_DIR), { recursive: true })
  await mkdir(join(dir, THUMBNAILS_DIR), { recursive: true })
  await mkdir(join(dir, IMPORT_TMP_DIR), { recursive: true })
}

/** Blob location relative to the project dir: assets/<h[0:2]>/<hash>. */
export function blobRelativePath(hash: string): string {
  return join(ASSETS_DIR, hash.slice(0, 2), hash)
}

/** Absolute content-addressed path for a hash. */
export function blobPath(dir: string, hash: string): string {
  return join(dir, blobRelativePath(hash))
}

/** Per-import staging dir relative to the project dir. */
export function importTempRelativeDir(importId: string): string {
  return join(IMPORT_TMP_DIR, importId)
}

/** Absolute per-import staging dir. */
export function importTempDir(dir: string, importId: string): string {
  return join(dir, importTempRelativeDir(importId))
}

/**
 * Moves a fully staged temp file into content-addressed storage with
 * an atomic rename (same volume: temp lives under the project dir).
 * If the blob already exists the move is skipped and the temp file
 * removed — byte-level dedupe keeps one blob while callers still
 * create a distinct Asset record per import (§4.7).
 */
export async function moveIntoStore(
  dir: string,
  tempFile: string,
  hash: string,
): Promise<{ deduplicated: boolean; storagePath: string }> {
  const storagePath = blobRelativePath(hash)
  const target = join(dir, storagePath)
  const exists = await stat(target).then(
    () => true,
    () => false,
  )
  if (exists) {
    await rm(tempFile, { force: true })
    return { deduplicated: true, storagePath }
  }
  await mkdir(dirname(target), { recursive: true })
  await rename(tempFile, target)
  return { deduplicated: false, storagePath }
}

/** Removes an import's staging directory and everything in it. */
export async function cleanImportTemp(dir: string, importId: string): Promise<void> {
  await rm(importTempDir(dir, importId), { recursive: true, force: true })
}
