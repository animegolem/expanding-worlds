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

const TOKEN_RE = /\[\[([^[\]|\r\n]+)(?:\|([^[\]\r\n]+))?\]\]/g

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
