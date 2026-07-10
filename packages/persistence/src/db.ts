import { DatabaseSync, type StatementSync } from 'node:sqlite'

/**
 * Thin seam over node:sqlite (decision recorded in AI-IMP-009: works
 * unmodified in both system Node and the Electron utility process,
 * ships FTS5 and WAL, no native rebuild). Keep all driver contact
 * behind this class so a future swap stays one-file.
 */
export class Db {
  #raw: DatabaseSync
  #txDepth = 0

  private constructor(raw: DatabaseSync) {
    this.#raw = raw
  }

  static open(path: string, options: { readOnly?: boolean } = {}): Db {
    const raw = new DatabaseSync(path, options.readOnly ? { readOnly: true } : {})
    try {
      if (options.readOnly) {
        // §11.1/§14.4 source opening: the CONNECTION is read-only and
        // query_only doubles the guarantee — no lock is taken and no
        // pragma here writes (journal_mode is whatever the writable
        // life of the database left it).
        raw.exec('PRAGMA query_only = ON')
        raw.exec('PRAGMA busy_timeout = 5000')
      } else {
        raw.exec('PRAGMA journal_mode = WAL')
        raw.exec('PRAGMA foreign_keys = ON')
        raw.exec('PRAGMA busy_timeout = 5000')
      }
      return new Db(raw)
    } catch (err) {
      // Opening invalid/corrupt input can fail in an initial pragma after
      // DatabaseSync has already acquired the native handle. Close it before
      // rethrowing: on Windows an unclosed handle prevents fixture cleanup.
      try {
        raw.close()
      } catch {
        // Preserve the pragma/open failure — it is the useful diagnosis.
      }
      throw err
    }
  }

  exec(sql: string): void {
    this.#raw.exec(sql)
  }

  prepare(sql: string): StatementSync {
    return this.#raw.prepare(sql)
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.#raw.prepare(sql).get(...params) as T | undefined
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T[] {
    return this.#raw.prepare(sql).all(...params) as T[]
  }

  run(sql: string, ...params: SqlValue[]): { changes: number | bigint } {
    return this.#raw.prepare(sql).run(...params)
  }

  /**
   * Savepoint-based so transactions nest; only the outermost commit
   * makes work durable, and any throw rolls its level back.
   */
  transaction<T>(fn: () => T): T {
    const name = `ew_tx_${this.#txDepth}`
    this.#raw.exec(this.#txDepth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`)
    this.#txDepth += 1
    try {
      const result = fn()
      this.#txDepth -= 1
      this.#raw.exec(this.#txDepth === 0 ? 'COMMIT' : `RELEASE ${name}`)
      return result
    } catch (err) {
      this.#txDepth -= 1
      try {
        this.#raw.exec(this.#txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`)
      } catch {
        // Certain failures (e.g. a deferred FK violation at commit)
        // auto-roll-back the WHOLE transaction first, so our rollback
        // finds nothing. The original error is the one that matters —
        // swallowing this rollback error stops it being masked
        // ("no such savepoint" hid the real cause, AI-IMP-084 0006).
        this.#txDepth = 0
      }
      throw err
    }
  }

  pragma(name: string): unknown {
    const row = this.#raw.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined
    return row ? Object.values(row)[0] : undefined
  }

  close(): void {
    this.#raw.close()
  }
}

export type SqlValue = string | number | bigint | null | Uint8Array
