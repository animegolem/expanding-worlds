import * as m0001 from './0001-init'

export interface Migration {
  id: number
  name: string
  sql: string
}

/** Ordered, append-only. Never edit an applied migration. */
export const MIGRATIONS: readonly Migration[] = [m0001]

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.id
