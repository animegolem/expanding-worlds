import { describe, expect, it } from 'vitest'
import {
  METADATA_CLOSE,
  METADATA_OPEN,
  composeNoteBody,
  renderMetadataBlock,
  stripMetadataBlock,
  type MetadataSectionsInput,
} from './note-metadata'
import { extractWikiLinks } from './wiki-links'

const SECTIONS: MetadataSectionsInput = {
  placements: [
    { label: 'Home', count: 2, depth: 0 },
    { label: 'Character Sheet', count: 1, depth: 1 },
  ],
  provenance: [
    { originalFilename: 'castle.png', importDate: '2026-07-06', sourceUrl: 'https://ref.example/c' },
    { originalFilename: 'sketch.jpg', importDate: '2026-07-01', sourceUrl: null },
  ],
  timestamps: { created: '2026-06-30', modified: '2026-07-06' },
}

describe('renderMetadataBlock', () => {
  it('renders plain markdown under a rule + comment fence', () => {
    const block = renderMetadataBlock(SECTIONS)
    expect(block).toContain('\n---\n')
    expect(block).toContain(METADATA_OPEN)
    expect(block).toContain(METADATA_CLOSE)
    expect(block).toContain('## Placements')
    // Nested board indents by depth (two spaces per level).
    expect(block).toContain('- Home (2)')
    expect(block).toContain('  - Character Sheet (1)')
    expect(block).toContain('## Provenance')
    expect(block).toContain('`castle.png` — imported 2026-07-06 — source: https://ref.example/c')
    expect(block).toContain('`sketch.jpg` — imported 2026-07-01')
    expect(block).not.toContain('sketch.jpg` — imported 2026-07-01 — source') // null URL omitted
    expect(block).toContain('## Timestamps')
    expect(block).toContain('- Created 2026-06-30')
    expect(block).toContain('- Modified 2026-07-06')
  })

  it('collapses to empty when no section has content', () => {
    expect(renderMetadataBlock({})).toBe('')
    expect(renderMetadataBlock({ placements: [], provenance: [] })).toBe('')
  })

  // AI-IMP-123: filenames and source URLs are interpolated verbatim; a
  // `[[...]]` in one would mint a wiki-link token the lexical extractor
  // (§7.1) indexes straight out of this system-owned block. The render
  // neutralizes `[[` so the generated block can never mint a token.
  it('neutralizes [[ in a hostile filename so no wiki-link token is minted', () => {
    const block = renderMetadataBlock({
      provenance: [
        {
          originalFilename: '[[hostile]] note [[[triple.png',
          importDate: '2026-07-06',
          sourceUrl: 'https://ref.example/[[evil]]',
        },
      ],
    })
    expect(extractWikiLinks(block)).toEqual([])
    // Still human-readable: the filename text survives, only the pair
    // is broken (the odd `[[[` run leaves no surviving adjacency).
    expect(block).not.toContain('[[')
    expect(block).toContain('hostile')
    expect(block).toContain('triple.png')
  })

  it('leaves a filename with a lone bracket byte-identical (no [[)', () => {
    const block = renderMetadataBlock({
      provenance: [{ originalFilename: 'photo[1].png', importDate: '2026-07-06', sourceUrl: null }],
    })
    expect(block).toContain('`photo[1].png` — imported 2026-07-06')
    expect(extractWikiLinks(block)).toEqual([])
  })
})

describe('stripMetadataBlock', () => {
  it('round-trips: strip(compose(prose)) recovers the prose', () => {
    const body = composeNoteBody('My notes here.', SECTIONS)
    const { prose, hadBlock } = stripMetadataBlock(body)
    expect(hadBlock).toBe(true)
    expect(prose).toBe('My notes here.')
  })

  it('returns the exact tail so prose + block reconstructs the body', () => {
    const body = composeNoteBody('Alpha prose', SECTIONS)
    const { prose, block } = stripMetadataBlock(body)
    expect(prose + block).toBe(body)
  })

  it('a body without a block is all prose', () => {
    const { prose, block, hadBlock } = stripMetadataBlock('just words\n\nmore words')
    expect(hadBlock).toBe(false)
    expect(prose).toBe('just words\n\nmore words')
    expect(block).toBe('')
  })

  it('a block-only body strips to empty prose', () => {
    const body = composeNoteBody('', SECTIONS)
    const { prose, hadBlock } = stripMetadataBlock(body)
    expect(hadBlock).toBe(true)
    expect(prose).toBe('')
  })

  it('overwrites hand-edited content inside the block wholesale', () => {
    const body = composeNoteBody('Prose', SECTIONS)
    const tampered = body.replace('- Home (2)', '- Home (999) I EDITED THIS BY HAND')
    // A refresh recomposes from prose + fresh sections, discarding the edit.
    const refreshed = composeNoteBody(tampered, SECTIONS)
    expect(refreshed).toBe(body)
    expect(refreshed).not.toContain('EDITED THIS BY HAND')
  })
})

describe('composeNoteBody', () => {
  it('is idempotent — recomposing does not stack blocks', () => {
    const once = composeNoteBody('Prose', SECTIONS)
    const twice = composeNoteBody(once, SECTIONS)
    expect(twice).toBe(once)
    // Exactly one fence pair.
    expect(twice.split(METADATA_OPEN)).toHaveLength(2)
  })

  it('strips the block when sections empty (toggle-off shape)', () => {
    const withBlock = composeNoteBody('Prose', SECTIONS)
    expect(composeNoteBody(withBlock, {})).toBe('Prose')
  })

  it('separates prose from the rule with a blank line (HR, not setext heading)', () => {
    const body = composeNoteBody('Prose', SECTIONS)
    expect(body).toContain('Prose\n\n---\n')
  })
})
