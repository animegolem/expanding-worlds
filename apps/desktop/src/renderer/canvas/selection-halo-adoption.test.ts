import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('node-relative halo adoption', () => {
  it('covers the four ruled raw-node paths', () => {
    const charms = read('./charms-ui.ts')
    expect(charms.match(/avoid:\s*selectionHalo/g)).toHaveLength(3)
    expect(read('../menus/ContextMenu.ts')).toContain('currentSelectionHalo()')
    expect(read('./caption-editor.ts')).toContain('avoid: currentSelectionHalo()')
    expect(read('./PromoteCaptionDialog.svelte')).toContain('avoid: currentSelectionHalo()')
  })

  it('keeps TagPanel point-anchored rather than halo-relative', () => {
    const tagPanel = read('../tags/TagPanel.svelte')
    expect(tagPanel).not.toContain('selectionHalo')
    expect(tagPanel).not.toContain('avoid:')
  })
})
