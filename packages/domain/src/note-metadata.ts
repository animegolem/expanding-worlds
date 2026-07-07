/**
 * System metadata block grammar (RFC-0001 §7.8, AI-IMP-119). A note
 * MAY carry a system-owned block at the TAIL of its body: derived,
 * system-written markdown that survives export so the note is
 * self-documenting in any plain reader. The block sits under a stable
 * marker the parser owns — a horizontal rule plus an HTML-comment
 * fence — and is regenerated WHOLESALE on refresh (hand edits inside
 * are overwritten by design).
 *
 * This module is PURE: the marker grammar, the strip, and the render.
 * The live data (placements, provenance, timestamps) and the settings
 * that gate sections live in note-metadata-db.ts; the DB never leaks
 * in here so the grammar stays trivially testable and reusable at the
 * export boundary (EPIC-008).
 */

/** Opening sentinel — an HTML comment so foreign markdown readers hide
 * it; the horizontal rule above it is the visible separator. */
export const METADATA_OPEN = '<!-- ew:metadata -->'
/** Closing sentinel. The strip does not require it (a mangled tail is
 * still cut at the open marker), but the render always emits it so the
 * fence reads as a matched pair. */
export const METADATA_CLOSE = '<!-- /ew:metadata -->'

/** One board line in the Placements tree. `depth` is the board's
 * containment distance from the root canvas — the render indents by
 * it, so nested boards sit under their ancestors (§7.8 "respecting
 * board nesting"). */
export interface MetadataBoard {
  label: string
  count: number
  depth: number
}

export interface MetadataProvenanceEntry {
  originalFilename: string
  /** Import date, already reduced to a plain YYYY-MM-DD by the caller. */
  importDate: string
  sourceUrl: string | null
}

/** The section inputs, already gated by the effective toggles. An
 * absent (or empty) section is simply not rendered; when every section
 * is absent the whole block collapses to the empty string. */
export interface MetadataSectionsInput {
  placements?: MetadataBoard[]
  provenance?: MetadataProvenanceEntry[]
  timestamps?: { created: string; modified: string }
}

/**
 * Split a note body into its prose and its system block. The prose is
 * everything before the marker with the separating rule and trailing
 * whitespace removed; `block` is the EXACT remainder (rule, fence, and
 * content) so `prose + block === body` — the editor reattaches this
 * raw tail on an ordinary prose save so a user edit never regenerates
 * or destroys the block. A body with no marker returns itself as prose
 * and an empty block.
 */
export function stripMetadataBlock(body: string): {
  prose: string
  block: string
  hadBlock: boolean
} {
  const idx = body.indexOf(METADATA_OPEN)
  if (idx === -1) return { prose: body, block: '', hadBlock: false }
  // Prose = the head with its trailing whitespace and the separating
  // `---` rule trimmed. `prose` is a prefix of `body`, so the block is
  // the exact suffix from where prose ends — a clean reattachment.
  let prose = body.slice(0, idx).replace(/\s+$/, '')
  if (prose.endsWith('---')) prose = prose.slice(0, -3).replace(/\s+$/, '')
  return { prose, block: body.slice(prose.length), hadBlock: true }
}

/**
 * Neutralize wiki-link openers in system-interpolated text (original
 * filenames, source URLs). A `[[` in a filename would otherwise mint a
 * link token that the lexical extractor (§7.1 `extractWikiLinks`)
 * indexes straight out of this system-owned block — the block is
 * regenerated wholesale, so it must never introduce prose ranges the
 * link layer treats as authored. We break every `[[` adjacency with a
 * single space, chosen so the printed text stays human-readable in a
 * plain reader and byte-identical for any input that never contained
 * `[[`. The lookahead matches only a `[` immediately followed by
 * another `[`, so a lone bracket (`photo[1].png`) is untouched;
 * matching each `[` in a run means an odd run like `[[[` still leaves
 * no surviving pair.
 */
function neutralizeWikiTokens(text: string): string {
  return text.replace(/\[(?=\[)/g, '[ ')
}

/**
 * Render the tail for the given sections: a leading blank line, the
 * `---` rule (blank-line-separated so it is a horizontal rule, never a
 * setext heading), the open fence, each present section, and the close
 * fence. Returns '' when no section has content — the note then carries
 * no block at all.
 */
export function renderMetadataBlock(sections: MetadataSectionsInput): string {
  const parts: string[] = []

  if (sections.placements && sections.placements.length > 0) {
    const lines = sections.placements.map(
      (board) => `${'  '.repeat(Math.max(0, board.depth))}- ${board.label} (${board.count})`,
    )
    parts.push(`## Placements\n\n${lines.join('\n')}`)
  }

  if (sections.provenance && sections.provenance.length > 0) {
    const lines = sections.provenance.map((entry) => {
      let line = `- \`${neutralizeWikiTokens(entry.originalFilename)}\` — imported ${entry.importDate}`
      if (entry.sourceUrl) line += ` — source: ${neutralizeWikiTokens(entry.sourceUrl)}`
      return line
    })
    parts.push(`## Provenance\n\n${lines.join('\n')}`)
  }

  if (sections.timestamps) {
    parts.push(
      `## Timestamps\n\n- Created ${sections.timestamps.created}\n- Modified ${sections.timestamps.modified}`,
    )
  }

  if (parts.length === 0) return ''
  return `\n\n---\n\n${METADATA_OPEN}\n\n${parts.join('\n\n')}\n\n${METADATA_CLOSE}\n`
}

/**
 * Recompose a body from prose plus fresh sections. Any existing block
 * on the passed body is stripped first, so callers may hand the full
 * on-disk body and get the block replaced WHOLESALE. An empty prose
 * with a block drops the block's leading blank lines so a bodiless
 * note does not open with stray whitespace.
 */
export function composeNoteBody(body: string, sections: MetadataSectionsInput): string {
  const { prose } = stripMetadataBlock(body)
  const tail = renderMetadataBlock(sections)
  if (tail === '') return prose
  return prose.length > 0 ? prose + tail : tail.replace(/^\n+/, '')
}
