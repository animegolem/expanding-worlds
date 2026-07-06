import type { Db } from './db'
import type { QueryRegistry } from './queries'

/**
 * §11.5 project-tier settings (AI-IMP-074): plain key/value JSON in
 * the settings table, written OUTSIDE the command pipeline —
 * preferences are not content edits, so they never enter command
 * history and never bump project_revision. Trash retention is the
 * deliberate exception: it stays the SetTrashRetention command
 * (AI-IMP-013) because it changes what happens to project data (§9)
 * and the Trash view exposes its own control; every settings-table
 * key has exactly one write grammar.
 */
export function setProjectSetting(
  db: Db,
  projectId: string,
  key: string,
  value: unknown,
): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('setProjectSetting: key must be a non-empty string')
  }
  if (value === undefined) {
    throw new Error(`setProjectSetting: ${key} needs a JSON-serializable value`)
  }
  db.run(
    `INSERT INTO settings (project_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value`,
    projectId,
    key,
    JSON.stringify(value),
  )
}

export function registerSettingsQueries(registry: QueryRegistry): void {
  /** Every project-tier setting, JSON-decoded, keyed by name. */
  registry.register('getSettings', (ctx) => {
    const rows = ctx.db.all<{ key: string; value: string }>(
      'SELECT key, value FROM settings WHERE project_id = ? ORDER BY key',
      ctx.projectId,
    )
    const settings: Record<string, unknown> = {}
    for (const row of rows) settings[row.key] = JSON.parse(row.value)
    return settings
  })
}
