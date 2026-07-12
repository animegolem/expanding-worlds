import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { CommandContext } from './dispatcher'
import type { Db } from './db'
import { blobPath, thumbnailPath } from './import/store'
import { assertManagedPath } from './path-safety'
import {
  GC_ELIGIBILITY_KEY,
  getProjectSetting,
  setProjectSetting,
  type ProjectSettingDecoder,
} from './settings'

export const GC_GRACE_MS = 30 * 86_400_000
export const GC_MANIFEST_PATH = join('cache', 'gc-manifest.jsonl')

interface PendingManifest {
  deletedAt: string
  bytes: number
}

interface GcLedgerEntry {
  firstSeenAt: string
  pendingManifest?: PendingManifest
}

type GcLedger = Record<string, GcLedgerEntry>

export interface GcStatus {
  reclaimableBytes: number
  reclaimableCount: number
}

export interface GcSweepReport extends GcStatus {
  reclaimed: string[]
  failed: string[]
  deferred: number
  stoppedForBudget: boolean
}

interface GcContext {
  db: Db
  projectId: string
  dir: string
}

const exportLeaseCounts = new Map<string, number>()

/** Register a conservative live-export lease; concurrent exports ref-count. */
export function acquireExportLease(hashes: Iterable<string>): () => void {
  const held = [...new Set(hashes)]
  for (const hash of held) exportLeaseCounts.set(hash, (exportLeaseCounts.get(hash) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const hash of held) {
      const next = (exportLeaseCounts.get(hash) ?? 1) - 1
      if (next <= 0) exportLeaseCounts.delete(hash)
      else exportLeaseCounts.set(hash, next)
    }
  }
}

export function exportLeaseGuardedHashes(): Set<string> {
  return new Set(exportLeaseCounts.keys())
}

function referencedHashes(ctx: Pick<GcContext, 'db'>): Set<string> {
  return new Set(
    ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT a.content_hash FROM asset a
         WHERE EXISTS (SELECT 1 FROM node n WHERE n.appearance_asset_id = a.id)
            OR EXISTS (SELECT 1 FROM canvas c WHERE c.background_asset_id = a.id)`,
      )
      .map((row) => row.content_hash),
  )
}

function guardedHashes(ctx: Pick<GcContext, 'db'>): Set<string> {
  return new Set<string>([
    ...ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT content_hash FROM pending_imports
         WHERE state <> 'committed' AND content_hash IS NOT NULL`,
      )
      .map((row) => row.content_hash),
    ...ctx.db
      .all<{ content_hash: string }>(
        `SELECT DISTINCT a.content_hash FROM derivative_jobs j
         JOIN asset a ON a.id = j.asset_id
         WHERE j.state = 'queued'`,
      )
      .map((row) => row.content_hash),
    ...exportLeaseGuardedHashes(),
  ])
}

/** DB-backed hashes that are currently unreferenced and unguarded. */
export function computeGcEligibleBlobs(ctx: Omit<CommandContext, 'now'>): string[] {
  const referenced = referencedHashes(ctx)
  const guarded = guardedHashes(ctx)
  return ctx.db
    .all<{ content_hash: string }>(
      'SELECT DISTINCT content_hash FROM asset WHERE project_id = ? ORDER BY content_hash',
      ctx.projectId,
    )
    .map((row) => row.content_hash)
    .filter((hash) => !referenced.has(hash) && !guarded.has(hash))
}

function filesystemBlobHashes(ctx: GcContext): string[] {
  const root = assertManagedPath(ctx.dir, join(ctx.dir, 'assets'))
  if (!existsSync(root)) return []
  const hashes: string[] = []
  for (const shard of readdirSync(root, { withFileTypes: true })) {
    if (!shard.isDirectory()) continue
    const shardDir = assertManagedPath(ctx.dir, join(root, shard.name))
    for (const entry of readdirSync(shardDir, { withFileTypes: true })) {
      // Canonical originals are SHA-256 named. Unknown debris is not
      // interpreted as a managed blob and remains recovery-visible.
      if (entry.isFile() && /^[a-f0-9]{64}$/i.test(entry.name)) hashes.push(entry.name)
    }
  }
  return hashes
}

function currentCandidates(ctx: GcContext): Set<string> {
  const referenced = referencedHashes(ctx)
  const guarded = guardedHashes(ctx)
  const stored = new Set([
    ...ctx.db
      .all<{ content_hash: string }>('SELECT DISTINCT content_hash FROM asset WHERE project_id = ?', ctx.projectId)
      .map((row) => row.content_hash),
    ...filesystemBlobHashes(ctx),
  ])
  return new Set([...stored].filter((hash) => !referenced.has(hash) && !guarded.has(hash)))
}

const decodeLedger: ProjectSettingDecoder<GcLedger> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const ledger: GcLedger = {}
  for (const [hash, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const firstSeenAt = (value as { firstSeenAt?: unknown }).firstSeenAt
    if (typeof firstSeenAt !== 'string' || Number.isNaN(Date.parse(firstSeenAt))) return undefined
    const pending = (value as { pendingManifest?: unknown }).pendingManifest
    if (pending === undefined) ledger[hash] = { firstSeenAt }
    else {
      if (typeof pending !== 'object' || pending === null || Array.isArray(pending)) return undefined
      const deletedAt = (pending as { deletedAt?: unknown }).deletedAt
      const bytes = (pending as { bytes?: unknown }).bytes
      if (typeof deletedAt !== 'string' || Number.isNaN(Date.parse(deletedAt))) return undefined
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return undefined
      ledger[hash] = { firstSeenAt, pendingManifest: { deletedAt, bytes } }
    }
  }
  return ledger
}

function readLedger(ctx: GcContext): GcLedger {
  return getProjectSetting(ctx.db, ctx.projectId, GC_ELIGIBILITY_KEY, {}, decodeLedger)
}

function writeLedger(ctx: GcContext, ledger: GcLedger): void {
  if (Object.keys(ledger).length === 0) {
    ctx.db.run('DELETE FROM settings WHERE project_id = ? AND key = ?', ctx.projectId, GC_ELIGIBILITY_KEY)
  } else {
    setProjectSetting(ctx.db, ctx.projectId, GC_ELIGIBILITY_KEY, ledger)
  }
}

function bytesAt(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function reclaimableBytes(ctx: GcContext, hash: string): number {
  return bytesAt(assertManagedPath(ctx.dir, blobPath(ctx.dir, hash))) +
    bytesAt(assertManagedPath(ctx.dir, thumbnailPath(ctx.dir, hash)))
}

function matured(entry: GcLedgerEntry, nowMs: number): boolean {
  return nowMs - Date.parse(entry.firstSeenAt) >= GC_GRACE_MS
}

/** Read-only Settings fact: never starts clocks and never mutates. */
export function gcStatus(ctx: GcContext, now = new Date()): GcStatus {
  const ledger = readLedger(ctx)
  const candidates = currentCandidates(ctx)
  let reclaimableBytesTotal = 0
  let reclaimableCount = 0
  for (const [hash, entry] of Object.entries(ledger)) {
    if (entry.pendingManifest || !candidates.has(hash) || !matured(entry, now.getTime())) continue
    reclaimableCount += 1
    reclaimableBytesTotal += reclaimableBytes(ctx, hash)
  }
  return { reclaimableBytes: reclaimableBytesTotal, reclaimableCount }
}

function appendManifest(ctx: GcContext, hash: string, pending: PendingManifest): void {
  const path = assertManagedPath(ctx.dir, join(ctx.dir, GC_MANIFEST_PATH))
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify({ hash, ...pending })}\n`, 'utf8')
}

function removeAssetMetadata(ctx: GcContext, hash: string): boolean {
  return ctx.db.transaction(() => {
    if (referencedHashes(ctx).has(hash) || guardedHashes(ctx).has(hash)) return false
    ctx.db.run(
      `DELETE FROM derivative_jobs WHERE asset_id IN
         (SELECT id FROM asset WHERE project_id = ? AND content_hash = ?)`,
      ctx.projectId,
      hash,
    )
    ctx.db.run('DELETE FROM asset WHERE project_id = ? AND content_hash = ?', ctx.projectId, hash)
    return true
  })
}

/**
 * End Session mark/guard/sweep. The ledger is deliberately losable:
 * absence restarts the grace clock. A deadline stops between hashes;
 * unfinished matured entries remain for the next session.
 */
export function runGcSweep(
  ctx: GcContext,
  options: { now?: Date; deadlineAtMs?: number } = {},
): GcSweepReport {
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const deadline = options.deadlineAtMs ?? Number.POSITIVE_INFINITY
  const report: GcSweepReport = {
    reclaimableBytes: 0,
    reclaimableCount: 0,
    reclaimed: [],
    failed: [],
    deferred: 0,
    stoppedForBudget: false,
  }
  const prior = readLedger(ctx)
  const candidates = currentCandidates(ctx)
  const ledger: GcLedger = {}
  for (const hash of candidates) ledger[hash] = prior[hash] ?? { firstSeenAt: now.toISOString() }
  // A completed delete waiting only for its manifest remains durable
  // even though the hash is no longer a current candidate.
  for (const [hash, entry] of Object.entries(prior)) {
    if (entry.pendingManifest) ledger[hash] = entry
  }
  writeLedger(ctx, ledger)

  for (const [hash, entry] of Object.entries(ledger)) {
    if (Date.now() >= deadline - 100) {
      report.stoppedForBudget = true
      break
    }
    if (entry.pendingManifest) {
      try {
        appendManifest(ctx, hash, entry.pendingManifest)
        delete ledger[hash]
        writeLedger(ctx, ledger)
        report.reclaimed.push(hash)
        report.reclaimableBytes += entry.pendingManifest.bytes
        report.reclaimableCount += 1
      } catch {
        report.failed.push(hash)
      }
      continue
    }
    if (!matured(entry, nowMs)) {
      report.deferred += 1
      continue
    }

    // Recompute immediately before teardown: import/export/derivative
    // work may have begun after the initial mark.
    if (!currentCandidates(ctx).has(hash)) {
      delete ledger[hash]
      writeLedger(ctx, ledger)
      continue
    }
    const bytes = reclaimableBytes(ctx, hash)
    if (!removeAssetMetadata(ctx, hash)) continue
    const pending: PendingManifest = { deletedAt: now.toISOString(), bytes }
    ledger[hash] = { ...entry, pendingManifest: pending }
    writeLedger(ctx, ledger)
    try {
      rmSync(assertManagedPath(ctx.dir, blobPath(ctx.dir, hash)), { force: true })
      rmSync(assertManagedPath(ctx.dir, thumbnailPath(ctx.dir, hash)), { force: true })
      appendManifest(ctx, hash, pending)
      delete ledger[hash]
      writeLedger(ctx, ledger)
      report.reclaimed.push(hash)
      report.reclaimableBytes += bytes
      report.reclaimableCount += 1
    } catch {
      report.failed.push(hash)
    }
  }
  return report
}
