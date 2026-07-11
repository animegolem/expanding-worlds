/**
 * Migration 0010: project-local tag-sync suppression tombstones
 * (RFC-0001 §4.8 rev 0.69, AI-IMP-271).
 *
 * 0009 is reserved by AI-IMP-261. The migration runner is keyed by
 * its ledger rather than by a contiguous schema-version sequence, so
 * registering 0010 over that deliberate gap is safe: a later 0009 is
 * still discovered and applied. The growable name-key domain is
 * validated by command handlers, never by a SQLite CHECK constraint.
 */
export const id = 10
export const name = 'tag-sync-tombstone'
export const sql = /* sql */ `

CREATE TABLE tag_sync_tombstone (
  project_id TEXT NOT NULL REFERENCES project(id),
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, name_key)
) STRICT;
`
