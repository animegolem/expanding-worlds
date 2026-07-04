/**
 * Migration 0002: staged asset import (RFC-0001 §11.2).
 *
 * pending_imports is the durable record of an in-flight staged import.
 * Its state machine is strictly forward: 'staging' (row created, bytes
 * being copied to temp_path) → 'hashed' (content_hash computed, temp
 * file complete) → 'committed' (Asset row exists, blob moved into
 * assets/, temp cleaned). Startup recovery (AI-IMP-016) reconciles any
 * row not in 'committed': together with temp_path it fully describes
 * what was interrupted. Rejected imports delete their row — a rejected
 * import leaves zero records (§4.7).
 *
 * derivative_jobs queues regenerable derivative generation (§11.2);
 * Phase 1 has only the 'thumbnail' kind. Jobs are enqueued in the same
 * transaction that commits the Asset row, so a committed asset always
 * has its thumbnail job.
 *
 * Conventions follow 0001: STRICT tables, TEXT UUIDs, ISO-8601 TEXT
 * timestamps. temp_path and asset storage paths are stored relative to
 * the project directory so a moved project directory stays coherent.
 */
export const id = 2
export const name = 'import'
export const sql = /* sql */ `

CREATE TABLE pending_imports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  state TEXT NOT NULL DEFAULT 'staging'
    CHECK (state IN ('staging', 'hashed', 'committed')),
  original_filename TEXT NOT NULL,
  temp_path TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state = 'staging' OR content_hash IS NOT NULL)
) STRICT;
CREATE INDEX ix_pending_imports_state ON pending_imports(state);

CREATE TABLE derivative_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  kind TEXT NOT NULL CHECK (kind IN ('thumbnail')),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'done', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_derivative_jobs_state ON derivative_jobs(state);
CREATE INDEX ix_derivative_jobs_asset ON derivative_jobs(asset_id);
`
