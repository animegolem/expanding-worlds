/**
 * Wiki-link token extraction per RFC-0001 §7.1. Pure and lexical: no
 * Markdown awareness, no IO.
 *
 * Grammar (Phase 1 rules chosen in AI-IMP-011):
 *
 * - A token is `[[title]]` or `[[title|alias]]`.
 * - `title` is one or more characters, none of `[`, `]`, `|`, or a
 *   line break, and must contain at least one non-whitespace
 *   character (`[[   ]]` is plain text).
 * - `alias` is one or more characters, none of `[`, `]`, or a line
 *   break. The FIRST `|` splits title from alias; later `|`
 *   characters belong to the alias (`[[a|b|c]]` → title `a`, alias
 *   `b|c`).
 * - Malformed sequences are plain text, not tokens: `[[]]`, `[[|x]]`,
 *   `[[x|]]`, unclosed `[[x`, and any candidate containing a line
 *   break.
 * - There is NO escape syntax: a backslash has no special meaning,
 *   and code fences / inline code are not excluded. Extraction is
 *   purely lexical so link records stay deterministic; Markdown-aware
 *   suppression is an editor-layer concern (EPIC-005).
 * - `title` and `alias` are returned raw (whitespace preserved);
 *   normalization for matching is `titleKey()`'s job.
 *
 * Ranges are UTF-16 code-unit offsets into the body string (JS string
 * indexing, which is also what CodeMirror positions use): `start` is
 * the offset of the first `[`, `end` is exclusive, just past the
 * final `]`.
 */
export interface WikiLinkToken {
  /** Offset of the first `[` (UTF-16 code units). */
  start: number
  /** Exclusive offset just past the closing `]]`. */
  end: number
  /** Raw title text between `[[` and `|` or `]]`. */
  title: string
  /** Raw alias text after the first `|`, or null when unaliased. */
  alias: string | null
}

/**
 * Live display state of a wiki-link token (§7.1/§7.2, AI-IMP-045),
 * derived the same way `refreshNoteLinks` will persist it on the next
 * save so presentation and records cannot drift:
 *
 * 1. A title_key with a broken record in the SOURCE note stays broken
 *    (invariant 27) — even when an active note now matches.
 * 2. Otherwise a note (active or trashed) with that title_key binds;
 *    a trashed target renders as bound-trashed (In Trash affordance).
 * 3. Otherwise the token is unresolved (phantom).
 */
export type WikiLinkDisplayState = 'bound' | 'bound-trashed' | 'unresolved' | 'broken'

export interface LinkResolutionContext {
  /** title_keys with a broken record in the source note. */
  brokenKeys: ReadonlySet<string>
  /** title_key → lifecycle for every non-purged note in the project. */
  titles: ReadonlyMap<string, 'active' | 'trashed'>
}

export function linkDisplayState(
  key: string,
  ctx: LinkResolutionContext,
): WikiLinkDisplayState {
  if (ctx.brokenKeys.has(key)) return 'broken'
  const lifecycle = ctx.titles.get(key)
  if (lifecycle === 'active') return 'bound'
  if (lifecycle === 'trashed') return 'bound-trashed'
  return 'unresolved'
}

/** The single grammar source. Both the whole-body scanner (global) and
 * the scan-at-position helper (sticky) are built from it so the editor's
 * parse-stage opacity rule and the extractor can NEVER diverge. */
const TOKEN_PATTERN = /\[\[([^[\]|\r\n]+)(?:\|([^[\]\r\n]+))?\]\]/
const TOKEN_RE = new RegExp(TOKEN_PATTERN, 'g')
const ANCHORED_TOKEN_RE = new RegExp(TOKEN_PATTERN, 'y')

/** Extract all wiki-link tokens from a Markdown body, in order. */
export function extractWikiLinks(body: string): WikiLinkToken[] {
  const tokens: WikiLinkToken[] = []
  for (const match of body.matchAll(TOKEN_RE)) {
    const title = match[1]
    if (title === undefined || title.trim().length === 0) continue
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      title,
      alias: match[2] ?? null,
    })
  }
  return tokens
}

/**
 * Match a single grammar-valid wiki-link token that STARTS EXACTLY at
 * `pos` (the first `[`). Returns the token or `null`. This is the same
 * lexical grammar as {@link extractWikiLinks} (shared `TOKEN_PATTERN`),
 * exposed for a scan-at-a-position caller — the editor's Markdown parse
 * rule uses it to treat a token as opaque bytes so emphasis/code/
 * strikethrough never split it across marks (AI-IMP-156). The embed `!`
 * prefix is the caller's concern; this matches the `[[…]]` core only.
 */
export function matchWikiLinkAt(body: string, pos: number): WikiLinkToken | null {
  ANCHORED_TOKEN_RE.lastIndex = pos
  const match = ANCHORED_TOKEN_RE.exec(body)
  if (!match) return null
  const title = match[1]
  if (title === undefined || title.trim().length === 0) return null
  return {
    start: pos,
    end: pos + match[0].length,
    title,
    alias: match[2] ?? null,
  }
}
