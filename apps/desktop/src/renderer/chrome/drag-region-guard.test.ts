// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AI-IMP-257: drag-region carve-out guard. The frameless shell's top
 * band is a native drag region; interactive chrome inside it needs a
 * -webkit-app-region: no-drag rule IN ITS OWN COMPONENT (Svelte scopes
 * styles — a `no-drag` class borrowed from another component is a
 * carve-out that does not exist; that exact failure made the whole
 * path bar click-dead on packaged builds, alph v0.20.0). This scan
 * pins two facts per chrome source: a `no-drag` class is only used
 * where a backing -webkit-app-region rule exists in the same file,
 * and the two known band residents keep their rules.
 */

const CHROME_DIR = join(__dirname)

function source(name: string): string {
  return readFileSync(join(CHROME_DIR, name), 'utf8')
}

describe('title-band drag-region carve-outs (AI-IMP-257)', () => {
  it('PathBar carves its whole bar out of the band', () => {
    const pathBar = source('PathBar.svelte')
    expect(pathBar).toMatch(/\.path-bar\s*\{[^}]*-webkit-app-region:\s*no-drag/s)
  })

  it('TitleStrip keeps drag on the root and no-drag on its controls', () => {
    const strip = source('TitleStrip.svelte')
    expect(strip).toMatch(/-webkit-app-region:\s*drag/)
    expect(strip).toMatch(/\.no-drag\s*\{[^}]*-webkit-app-region:\s*no-drag/s)
  })

  it('no chrome component uses a no-drag class without a backing rule in its own file', () => {
    const offenders: string[] = []
    for (const file of readdirSync(CHROME_DIR)) {
      if (!file.endsWith('.svelte')) continue
      const text = source(file)
      const usesClass = /class="[^"]*\bno-drag\b/.test(text)
      const hasRule = /-webkit-app-region:\s*no-drag/.test(text)
      if (usesClass && !hasRule) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
