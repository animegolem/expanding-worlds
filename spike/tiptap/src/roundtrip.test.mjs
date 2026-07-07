import { describe, it, expect } from 'vitest'
import { makeEditor, toMarkdown, roundTrip } from './editor.mjs'
import { corpus, META_BLOCK } from './corpus.mjs'

/**
 * Criterion 1 — Markdown round-trip byte-stability. We do NOT assert
 * every case passes (the honest finding is that some do not); we RECORD
 * the per-case verdict. A case "passes" iff body === roundTrip(body).
 */
describe('round-trip byte stability (whole-body path)', () => {
  const results = []
  for (const { name, body } of corpus) {
    it(`records: ${name}`, () => {
      const out = roundTrip(body)
      const stable = out === body
      results.push({ name, stable, body, out })
      // Assertion is informational — we surface the diff but do not fail
      // the suite, so the full table always prints.
      expect(typeof out).toBe('string')
    })
  }
  it('prints the round-trip table', () => {
    let pass = 0
    const lines = ['', '=== ROUND-TRIP TABLE (whole-body) ===']
    for (const r of results) {
      if (r.stable) pass++
      lines.push(`[${r.stable ? 'PASS' : 'FAIL'}] ${r.name}`)
      if (!r.stable) {
        lines.push(`   in : ${JSON.stringify(r.body)}`)
        lines.push(`   out: ${JSON.stringify(r.out)}`)
      }
    }
    lines.push(`--- ${pass}/${results.length} byte-stable ---`)
    console.log(lines.join('\n'))
    expect(results.length).toBe(corpus.length)
  })
})

/**
 * The strip seam (§7.8): integration holds PROSE only; the metadata
 * tail rides outside the editor and is reattached verbatim. So the
 * tail is byte-exact by construction; only the prose head round-trips.
 */
describe('metadata tail via strip seam', () => {
  it('tail is byte-exact when it rides outside the editor', () => {
    const prose = '# Note\n\nBody with [[Link]].'
    const fullBody = prose + META_BLOCK
    // strip seam: editor sees prose, block held aside
    const proseOut = roundTrip(prose)
    const reattached = proseOut + META_BLOCK
    // The block portion is identical regardless of editor behaviour.
    expect(reattached.endsWith(META_BLOCK)).toBe(true)
    console.log('\n=== METADATA STRIP SEAM ===')
    console.log('prose stable:', proseOut === prose)
    console.log('tail preserved byte-exact:', reattached.endsWith(META_BLOCK))
  })

  it('whole-body path (editor swallows the tail) for comparison', () => {
    const prose = '# Note\n\nBody with [[Link]].'
    const fullBody = prose + META_BLOCK
    const out = roundTrip(fullBody)
    console.log('\n=== METADATA WHOLE-BODY PATH ===')
    console.log('whole-body stable:', out === fullBody)
    console.log('out:', JSON.stringify(out))
    // Recorded, not asserted stable.
    expect(typeof out).toBe('string')
  })
})

describe('criterion 2 — wiki-link atoms', () => {
  it('renders [[Link]] as an atomic node and serializes byte-exact', () => {
    const editor = makeEditor('See [[Dragon]] here.')
    const json = editor.getJSON()
    // Find the wikiLink atom in the doc.
    const atoms = []
    const walk = (n) => {
      if (n.type === 'wikiLink' || n.type === 'embed') atoms.push(n)
      ;(n.content ?? []).forEach(walk)
    }
    walk(json)
    expect(atoms.length).toBe(1)
    expect(atoms[0].attrs.title).toBe('Dragon')
    expect(toMarkdown(editor)).toBe('See [[Dragon]] here.')
    editor.destroy()
  })

  it('aliased + multibar + embed atoms survive serialize', () => {
    for (const body of ['[[Old|new label]]', '[[a|b|c]]', '![[hero.png]]', '![[m.png|map]]']) {
      const editor = makeEditor(body)
      expect(toMarkdown(editor)).toBe(body)
      editor.destroy()
    }
  })

  it('state class rides on the atom without touching source', () => {
    const classFor = (title) => (title === 'Ghost' ? 'wl-unresolved' : 'wl-bound')
    const editor = makeEditor('[[Ghost]] and [[Real]]', { classFor })
    const html = editor.getHTML()
    expect(html).toContain('wl-unresolved')
    expect(html).toContain('wl-bound')
    // Source is unaffected by the styling.
    expect(toMarkdown(editor)).toBe('[[Ghost]] and [[Real]]')
    editor.destroy()
  })

  it('malformed sequences stay plain text (grammar parity)', () => {
    for (const body of ['[[   ]]', '[[|x]]', '[[x|]]', '[[x']) {
      const editor = makeEditor(body)
      const json = editor.getJSON()
      let atomCount = 0
      const walk = (n) => {
        if (n.type === 'wikiLink' || n.type === 'embed') atomCount++
        ;(n.content ?? []).forEach(walk)
      }
      walk(json)
      expect(atomCount).toBe(0)
      editor.destroy()
    }
  })
})
