import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('reservation-frame adoption guard', () => {
  it('keeps band furniture and takeover geometry on the named tokens', () => {
    expect(read('../theme.css')).toContain('--ew-reserve-strip: 46px')
    expect(read('./TitleStrip.svelte')).toContain('height: var(--ew-reserve-strip)')
    expect(read('./CharmRail.svelte')).toContain('var(--ew-reserve-rail)')
    expect(read('./Dock.svelte')).toContain('var(--ew-reserve-dock)')
    expect(read('./TakeoverLayer.svelte')).toContain('var(--ew-reserve-gutter)')
  })

  it('rejects literal reservation dimensions in band math', () => {
    const sources = [
      read('./TitleStrip.svelte'),
      read('./CharmRail.svelte'),
      read('./Dock.svelte'),
      read('./TakeoverLayer.svelte'),
    ]
    const bandMath = /(?:height|width|top|right|bottom|inset):\s*(?:46|56|64|112)px/g
    expect(sources.flatMap((source) => source.match(bandMath) ?? [])).toEqual([])
  })
})
