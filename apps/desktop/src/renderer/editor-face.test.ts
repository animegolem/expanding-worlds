import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The doctrine guard for the ONE typography carve-out (RFC §7.1,
 * AI-IMP-131): the Maple Mono editor face may touch note TEXT and
 * nothing else. Chrome keeps the platform stack ("chrome is a
 * terminal"). A raw source scan — pragmatic, not a full CSS parser —
 * asserts every style rule in editor-face.css is either an @font-face
 * (the bundled face) or scoped to .ew-note-prose (the TipTap editing
 * surface). If a future edit adds a chrome selector here, this fails.
 */

const rendererDir = fileURLToPath(new URL('.', import.meta.url))

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('editor-face.css (AI-IMP-131 carve-out guard)', () => {
  const css = stripComments(
    readFileSync(resolve(rendererDir, 'editor-face.css'), 'utf8'),
  )

  it('declares only the bundled Maple faces — no runtime fetch', () => {
    // Every @font-face src must be a bundled woff2 (relative path), never
    // an http(s) URL. This keeps the "never fetched at runtime" invariant.
    const srcs = [...css.matchAll(/src:\s*url\(([^)]*)\)/g)].map((m) => m[1]!)
    expect(srcs.length).toBeGreaterThan(0)
    for (const src of srcs) {
      expect(src).toMatch(/\.woff2/)
      expect(src).not.toMatch(/https?:/)
    }
  })

  it('targets only editor-scoped selectors — the carve-out cannot leak into chrome', () => {
    // Split into top-level blocks; drop at-rules (@font-face and friends
    // are the face itself, not chrome selectors). Every remaining rule's
    // selector list must be entirely .ew-note-prose-scoped.
    const offenders: string[] = []
    const ruleHead = /([^{}]+)\{[^{}]*\}/g
    for (const match of css.matchAll(ruleHead)) {
      const head = match[1]!.trim()
      if (head.length === 0 || head.startsWith('@')) continue
      for (const selector of head.split(',')) {
        const s = selector.trim()
        if (s.length === 0) continue
        if (!s.startsWith('.ew-note-prose')) offenders.push(s)
      }
    }
    expect(offenders, `non-editor selectors: ${offenders.join(' | ')}`).toEqual([])
  })
})
