import type { TrashRetention } from '@ew/commands'
import type { Db } from './db'
import type { QueryRegistry } from './queries'

export const TRASH_RETENTION_KEY = 'trash_retention'
/** Internal, deliberately losable §9.8 first-observed eligibility clock. */
export const GC_ELIGIBILITY_KEY = 'gc_eligibility_v1'

export type ProjectSettingDecoder<T> = (raw: unknown) => T | undefined

const TRASH_RETENTIONS: ReadonlySet<TrashRetention> = new Set(['never', '30d', '60d', '90d'])

export const decodeTrashRetention: ProjectSettingDecoder<TrashRetention> = (raw) =>
  TRASH_RETENTIONS.has(raw as TrashRetention) ? (raw as TrashRetention) : undefined

interface SettingPolicy {
  fallback: unknown
  decode: ProjectSettingDecoder<unknown>
}

const SETTING_POLICIES: Readonly<Record<string, SettingPolicy>> = {
  [TRASH_RETENTION_KEY]: { fallback: 'never', decode: decodeTrashRetention },
}

function warnInvalidSetting(key: string, reason: 'malformed JSON' | 'invalid value'): void {
  // Project files are user data. Keep the fallback visible to developers
  // without logging the persisted value (which may contain private paths).
  console.warn(`[settings] ${key}: ${reason}; using the per-key fallback`)
}

function parseSetting<T>(
  key: string,
  stored: string,
  fallback: T,
  decoder?: ProjectSettingDecoder<T>,
): T {
  let raw: unknown
  try {
    raw = JSON.parse(stored) as unknown
  } catch {
    warnInvalidSetting(key, 'malformed JSON')
    return fallback
  }
  if (!decoder) return raw as T
  let decoded: T | undefined
  try {
    decoded = decoder(raw)
  } catch {
    decoded = undefined
  }
  if (decoded === undefined) {
    warnInvalidSetting(key, 'invalid value')
    return fallback
  }
  return decoded
}

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

/** Read one project-tier setting, JSON-decoded, falling back per key
 * (persisted values are user files — trust nothing). Used by system
 * code that needs a single key inside a command transaction (§7.8
 * metadata gating) rather than the whole getSettings map. */
export function getProjectSetting<T>(
  db: Db,
  projectId: string,
  key: string,
  fallback: T,
  decoder?: ProjectSettingDecoder<T>,
): T {
  const row = db.get<{ value: string }>(
    'SELECT value FROM settings WHERE project_id = ? AND key = ?',
    projectId,
    key,
  )
  if (!row) return fallback
  return parseSetting(key, row.value, fallback, decoder)
}

export function registerSettingsQueries(registry: QueryRegistry): void {
  /** Every project-tier setting, JSON-decoded, keyed by name. */
  registry.register('getSettings', (ctx) => {
    const rows = ctx.db.all<{ key: string; value: string }>(
      'SELECT key, value FROM settings WHERE project_id = ? ORDER BY key',
      ctx.projectId,
    )
    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      if (row.key === GC_ELIGIBILITY_KEY) continue
      const policy = SETTING_POLICIES[row.key]
      const absent = Symbol(row.key)
      const value = parseSetting(
        row.key,
        row.value,
        policy?.fallback ?? absent,
        policy?.decode,
      )
      // Unknown malformed keys have no authoritative default. Omitting
      // only that row lets each extensible-key consumer use its existing
      // absence fallback while every healthy setting remains available.
      if (value !== absent) settings[row.key] = value
    }
    return settings
  })
}
