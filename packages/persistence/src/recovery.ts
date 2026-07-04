import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './db'
import { blobPath, IMPORT_TMP_DIR } from './import/store'
import { rebuildSearchIndex } from './search'

/**
 * Startup recovery per RFC-0001 §11.4, run when a project opens and
 * before the API accepts commands. Every check is safe on a clean
 * project (the report simply stays empty), so recovery runs on every
 * open rather than trying to detect uncleanliness.
 *
 * Repairs remove only reconcilable debris: interrupted pending
 * imports, their temp files, and orphan blobs no Asset row references
 * (§11.2/§9.8 age-transaction-reference logic collapses to
 * "reference" here because pending_imports rows ARE the transaction
 * record). Missing regenerable derivatives rebuild lazily and are not
 * an error; a missing canonical original is a visible integrity error
 * and never repaired silently (§11.4).
 */

export interface RecoveryReport {
  checksRun: string[]
  repairs: string[]
  integrityErrors: string[]
}

export interface RecoveryCtx {
  db: Db
  projectId: string
  /** Absolute project directory. */
  dir: string
}

export function runRecovery(ctx: RecoveryCtx): RecoveryReport {
  const report: RecoveryReport = { checksRun: [], repairs: [], integrityErrors: [] }

  checkDatabaseIntegrity(ctx, report)
  reconcilePendingImports(ctx, report)
  sweepImportTemp(ctx, report)
  verifyCanonicalBlobs(ctx, report)
  removeOrphanBlobs(ctx, report)
  verifySearchIndex(ctx, report)

  return report
}

/** PRAGMA quick_check + foreign_key_check (§11.4 "verify … foreign keys"). */
function checkDatabaseIntegrity(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('database-integrity')
  const quick = ctx.db.all<Record<string, unknown>>('PRAGMA quick_check')
  const quickOk = quick.length === 1 && Object.values(quick[0]!)[0] === 'ok'
  if (!quickOk) {
    report.integrityErrors.push(`quick_check: ${JSON.stringify(quick)}`)
  }
  const fk = ctx.db.all<Record<string, unknown>>('PRAGMA foreign_key_check')
  if (fk.length > 0) {
    report.integrityErrors.push(`foreign_key_check: ${fk.length} violation(s)`)
  }
}

/**
 * §11.2: an import is fully described by its pending_imports row and
 * temp dir. Any row not 'committed' is an interrupted import — the
 * user never saw an Asset, so the whole attempt is dropped (row, temp
 * files, and — via removeOrphanBlobs — a blob that moved before the
 * commit). Committed rows are bookkeeping already reflected in Asset
 * rows and are pruned.
 */
function reconcilePendingImports(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('pending-imports')
  const rows = ctx.db.all<{ id: string; state: string }>(
    'SELECT id, state FROM pending_imports WHERE project_id = ?',
    ctx.projectId,
  )
  for (const row of rows) {
    const temp = join(ctx.dir, IMPORT_TMP_DIR, row.id)
    if (existsSync(temp)) {
      rmSync(temp, { recursive: true, force: true })
    }
    ctx.db.run('DELETE FROM pending_imports WHERE id = ?', row.id)
    report.repairs.push(
      row.state === 'committed'
        ? `pruned committed pending_imports row ${row.id}`
        : `dropped interrupted import ${row.id} (state ${row.state})`,
    )
  }
}

/** Temp dirs with no pending row (crash between fs and db writes). */
function sweepImportTemp(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('import-temp-sweep')
  const tmpRoot = join(ctx.dir, IMPORT_TMP_DIR)
  if (!existsSync(tmpRoot)) return
  // All pending rows were just reconciled away, so anything left in
  // the staging root is orphaned by definition.
  for (const entry of readdirSync(tmpRoot)) {
    rmSync(join(tmpRoot, entry), { recursive: true, force: true })
    report.repairs.push(`swept orphaned import temp ${entry}`)
  }
}

/** §11.4: a missing canonical original is a visible integrity error. */
function verifyCanonicalBlobs(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('canonical-blobs')
  const hashes = ctx.db.all<{ content_hash: string }>(
    'SELECT DISTINCT content_hash FROM asset WHERE project_id = ?',
    ctx.projectId,
  )
  for (const { content_hash } of hashes) {
    if (!existsSync(blobPath(ctx.dir, content_hash))) {
      report.integrityErrors.push(`missing canonical original for hash ${content_hash}`)
    }
  }
}

/**
 * Blobs in content-addressed storage that no Asset row references —
 * debris from imports interrupted after the atomic move. Blobs with
 * Asset rows are never touched here, even when GC-eligible; file
 * deletion for those follows Empty Trash flows, not recovery.
 */
function removeOrphanBlobs(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('orphan-blobs')
  const assetsRoot = join(ctx.dir, 'assets')
  if (!existsSync(assetsRoot)) return
  const referenced = new Set(
    ctx.db
      .all<{ content_hash: string }>('SELECT DISTINCT content_hash FROM asset')
      .map((r) => r.content_hash),
  )
  for (const shard of readdirSync(assetsRoot)) {
    const shardDir = join(assetsRoot, shard)
    let entries: string[]
    try {
      entries = readdirSync(shardDir)
    } catch {
      continue // a stray file, not a shard directory
    }
    for (const hash of entries) {
      if (!referenced.has(hash)) {
        rmSync(join(shardDir, hash), { force: true })
        report.repairs.push(`removed orphan blob ${hash}`)
      }
    }
  }
}

/**
 * fts5 integrity-check per corpus; any failure rebuilds all four from
 * the base tables (regenerable derivatives, §11.2).
 */
function verifySearchIndex(ctx: RecoveryCtx, report: RecoveryReport): void {
  report.checksRun.push('search-index')
  const externalContent = ['note_fts', 'tag_fts', 'asset_fts']
  let healthy = true
  for (const table of externalContent) {
    try {
      // rank=1 verifies the index against the external content table;
      // the bare form only checks internal index structure.
      ctx.db.run(`INSERT INTO ${table}(${table}, rank) VALUES ('integrity-check', 1)`)
    } catch {
      healthy = false
      break
    }
  }
  if (!healthy) {
    rebuildSearchIndex({ db: ctx.db })
    report.repairs.push('rebuilt search index (integrity-check failed)')
  }
}
