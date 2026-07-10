/**
 * The `.ewproj` export manifest (RFC-0001 §16, container ratified at
 * rev 0.57 — one ZIP: manifest + checkpointed database + readable
 * notes tree + original assets). The manifest is the import side's
 * FIRST read: it validates through the ZIP central directory before
 * anything extracts, so its shape is the compatibility contract and
 * every change to it bumps EXPORT_VERSION.
 */

/** Bumped when the manifest shape or archive layout changes. Import
 * refuses a newer exportVersion than it knows (AI-IMP-158). */
export const EXPORT_VERSION = 1

/** The archive entry name of the manifest itself. */
export const MANIFEST_ENTRY = 'manifest.json'

/** The archive entry name of the database copy. */
export const DB_ENTRY = 'project.sqlite'

/** One archive entry the import side must find and may verify.
 * `sha256` is null only for the manifest's own entry (it cannot hash
 * itself); assets carry their content hash, which is also their
 * store path — hashing is free at export and verification streams at
 * import. */
export interface ManifestEntry {
  /** Zip-internal path, forward slashes (`assets/ab/abcdef…`). */
  path: string
  sha256: string
  bytes: number
}

export interface ExportManifest {
  exportVersion: typeof EXPORT_VERSION
  /** The project database's migration level at export time; import
   * refuses a mismatch against its own LATEST_SCHEMA_VERSION in
   * Phase 1 (a versioned adapter is future §4.7 work). */
  schemaVersion: number
  projectId: string
  rootNodeId: string
  title: string
  createdAt: string
  activeOnly: boolean
  counts: { notes: number; assets: number }
  inventory: ManifestEntry[]
}

/** Parse + structurally validate manifest bytes (the import side's
 * first gate; also the export self-check). Throws with a human
 * message naming the defect — the caller wraps it into a typed
 * refusal. */
export function parseManifest(text: string): ExportManifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('manifest.json is not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('manifest.json is not an object')
  const m = raw as Record<string, unknown>
  if (m['exportVersion'] !== EXPORT_VERSION) {
    throw new Error(
      `unsupported exportVersion ${String(m['exportVersion'])} (this build reads ${EXPORT_VERSION})`,
    )
  }
  if (typeof m['schemaVersion'] !== 'number') throw new Error('manifest schemaVersion missing')
  for (const key of ['projectId', 'rootNodeId', 'title', 'createdAt'] as const) {
    if (typeof m[key] !== 'string' || m[key] === '') throw new Error(`manifest ${key} missing`)
  }
  if (typeof m['activeOnly'] !== 'boolean') throw new Error('manifest activeOnly missing')
  if (!Array.isArray(m['inventory'])) throw new Error('manifest inventory missing')
  const seenPaths = new Set<string>()
  for (const entry of m['inventory'] as unknown[]) {
    const e = entry as Record<string, unknown>
    if (typeof e['path'] !== 'string' || typeof e['sha256'] !== 'string') {
      throw new Error('manifest inventory entry malformed')
    }
    // `bytes` (CA-011): the manifest is attacker-writable, so a bare
    // `typeof === 'number'` is not enough — a NaN, fraction, negative,
    // or 2^53-overflowing value must never be trusted as a byte count
    // (it is later reconciled against the ZIP metadata and the streamed
    // count, and those comparisons are only meaningful for a real int).
    if (
      typeof e['bytes'] !== 'number' ||
      !Number.isSafeInteger(e['bytes']) ||
      (e['bytes'] as number) < 0
    ) {
      throw new Error('manifest inventory entry has an invalid byte count')
    }
    if (e['path'].startsWith('/') || (e['path'] as string).split('/').includes('..')) {
      throw new Error(`manifest inventory path escapes the archive: ${String(e['path'])}`)
    }
    // Unique paths (CA-011): a repeated inventory path could bind the
    // same allowed entry twice or shadow a verified row with an
    // unverified twin; the inventory is a set of distinct members.
    if (seenPaths.has(e['path'])) {
      throw new Error(`manifest inventory has a duplicate path: ${e['path']}`)
    }
    seenPaths.add(e['path'])
    // THE BINDING INVARIANT (Codex round 3, P1): an asset entry's
    // manifest hash must EQUAL its content-addressed basename. The
    // manifest is attacker-writable; the DB's content_hash is what the
    // project will actually dereference — requiring sha256 === basename
    // makes extraction's stream-hash bind bytes → basename → DB hash,
    // so swapped blob bytes with a "corrected" manifest still refuse.
    const path = e['path'] as string
    if (path.startsWith('assets/')) {
      const basename = path.split('/').pop() ?? ''
      if (!/^[0-9a-f]{64}$/.test(basename) || e['sha256'] !== basename) {
        throw new Error(`asset entry hash does not match its content address: ${path}`)
      }
    }
  }
  return raw as ExportManifest
}
