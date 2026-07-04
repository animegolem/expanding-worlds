import type { Db } from './db'

/**
 * FTS5 search index primitives (RFC-0001 §8.3, §11.1). The index
 * itself is defined in migration 0003 and maintained by triggers on
 * the base tables; nothing here runs on the normal write path. See
 * migrations/0003-fts.ts for the architecture and its VACUUM caveat.
 */

/**
 * Turns raw user input into a safe fts5 MATCH expression: each
 * whitespace-separated token becomes a quoted phrase (implicit AND),
 * so MATCH syntax in the input (AND/OR/NOT, ^, *, :, parens, quotes)
 * is searched literally instead of parsed. Returns null when the
 * input holds no tokens — callers skip MATCH entirely (an empty MATCH
 * expression is an fts5 error).
 */
export function ftsMatchExpression(raw: string): string | null {
  const tokens = (raw ?? '').split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t.replaceAll('"', '""')}"`).join(' ')
}

/**
 * Drops and repopulates all four search corpora from the base tables.
 * Exposed for startup recovery (AI-IMP-016) and required after any
 * future VACUUM (base-table rowids key the index). Safe to run at any
 * time; wraps the whole rebuild in one transaction.
 */
export function rebuildSearchIndex(ctx: { db: Db }): void {
  ctx.db.transaction(() => {
    // External-content tables: 'rebuild' discards the index and
    // re-reads every row of the content table.
    ctx.db.run(`INSERT INTO note_fts(note_fts) VALUES ('rebuild')`)
    ctx.db.run(`INSERT INTO tag_fts(tag_fts) VALUES ('rebuild')`)
    ctx.db.run(`INSERT INTO asset_fts(asset_fts) VALUES ('rebuild')`)
    // canvas_text_fts stores its own content (its source is a JSON
    // expression), so rebuild is delete-all + repopulate.
    ctx.db.run(`DELETE FROM canvas_text_fts`)
    ctx.db.run(
      `INSERT INTO canvas_text_fts(rowid, text)
       SELECT rowid, coalesce(json_extract(data, '$.text'), '')
       FROM decoration WHERE kind = 'text'`,
    )
  })
}
