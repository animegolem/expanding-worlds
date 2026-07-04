import type { Db } from './db'
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations/index'

/**
 * Applies pending migrations in order, each in its own transaction,
 * and keeps project.schema_version in step (§4.10). Returns the ids
 * applied.
 */
export function migrate(db: Db): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`)

  const applied = new Set(
    db.all<{ id: number }>('SELECT id FROM migrations').map((r) => r.id),
  )

  const ran: number[] = []
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      db.run(
        'INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)',
        migration.id,
        migration.name,
        new Date().toISOString(),
      )
    })
    ran.push(migration.id)
  }

  if (ran.length > 0) {
    // The project row exists on every run after the very first.
    db.run('UPDATE project SET schema_version = ?', LATEST_SCHEMA_VERSION)
  }
  return ran
}
