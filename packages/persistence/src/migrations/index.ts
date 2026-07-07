import * as m0001 from './0001-init'
import * as m0002 from './0002-import'
import * as m0003 from './0003-fts'
import * as m0004 from './0004-placement-lock'
import * as m0005 from './0005-bookmarks'
import * as m0006 from './0006-card-appearance'
import * as m0007 from './0007-frame-membership'

export interface Migration {
  id: number
  name: string
  sql: string
  /** Table-rebuild migrations: the runner turns connection-level
   * foreign_keys OFF around the transaction and runs
   * foreign_key_check after (the documented rebuild procedure —
   * defer_foreign_keys can NOT do this job; see migrate.ts). */
  disableForeignKeys?: boolean
}

/** Ordered, append-only. Never edit an applied migration. */
export const MIGRATIONS: readonly Migration[] = [
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  m0007,
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.id
