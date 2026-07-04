import * as m0001 from './0001-init'
import * as m0002 from './0002-import'
import * as m0003 from './0003-fts'

export interface Migration {
  id: number
  name: string
  sql: string
}

/** Ordered, append-only. Never edit an applied migration. */
export const MIGRATIONS: readonly Migration[] = [m0001, m0002, m0003]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.id
