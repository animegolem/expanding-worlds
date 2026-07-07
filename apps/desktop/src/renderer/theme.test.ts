import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme } from './theme'

const rendererDir = fileURLToPath(new URL('.', import.meta.url))

const allowedFiles = new Map<string, string>([
  ['theme.css', 'theme.css is the token source of truth.'],
  ['theme.test.ts', 'this test contains the raw-color detection pattern.'],
])

function filesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...filesUnder(path))
    else files.push(path)
  }
  return files
}

describe('renderer theme tokens', () => {
  it('every referenced --ew- token is defined in theme.css (AI-IMP-095)', () => {
    // The raw-color guard's twin: an invented token name falls back
    // silently in the browser (--ew-text-dim shipped that way in
    // EPIC-014). References anywhere in renderer sources must
    // resolve to a theme.css definition.
    const themeCss = readFileSync(resolve(rendererDir, 'theme.css'), 'utf8')
    const defined = new Set(
      [...themeCss.matchAll(/(--ew-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
    )
    const reference = /var\(\s*(--ew-[a-z0-9-]+)/g
    const failures: string[] = []
    for (const file of filesUnder(rendererDir)) {
      const rel = relative(rendererDir, file)
      if (rel === 'theme.css') continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(reference)) {
        if (defined.has(match[1]!)) continue
        const line = text.slice(0, match.index).split('\n').length
        failures.push(`${rel}:${line}: ${match[1]}`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('defines the design-pass material + void tokens (AI-IMP-130)', () => {
    // The visual tickets downstream (icons 132, paper 134, sweep 141)
    // build on these; they land dormant here, so nothing references them
    // yet and the undefined-token guard above cannot catch a missing one.
    const themeCss = readFileSync(resolve(rendererDir, 'theme.css'), 'utf8')
    const defined = new Set(
      [...themeCss.matchAll(/(--ew-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
    )
    const required = [
      '--ew-board-color',
      '--ew-void-surface',
      '--ew-void-grid-line',
      '--ew-drag-shadow',
      '--ew-tape-surface',
      '--ew-tape-border',
      '--ew-paper-torn',
      '--ew-obj-blue-hi',
      '--ew-obj-blue-lo',
      '--ew-obj-blue-stroke',
      '--ew-obj-gold-hi',
      '--ew-obj-gold-lo',
      '--ew-obj-gold-stroke',
      '--ew-obj-red-hi',
      '--ew-obj-red-lo',
      '--ew-obj-red-stroke',
      '--ew-obj-pink-hi',
      '--ew-obj-pink-lo',
      '--ew-obj-pink-stroke',
      '--ew-obj-orange-hi',
      '--ew-obj-orange-lo',
      '--ew-obj-orange-stroke',
      '--ew-obj-green-hi',
      '--ew-obj-green-lo',
      '--ew-obj-green-stroke',
      '--ew-obj-gloss',
      '--ew-obj-pin-hole',
      '--ew-obj-flag-pole',
      '--ew-obj-leaf-vein',
      '--ew-pushpin-stem',
      '--ew-note-h1',
      '--ew-note-h2',
      '--ew-note-h3',
    ]
    const missing = required.filter((t) => !defined.has(t))
    expect(missing, `undefined: ${missing.join(', ')}`).toEqual([])
  })

  it('overrides the loud note headings on glass, not on light (AI-IMP-130)', () => {
    // Deliberate call (RFC §6.7 design pass): light and dark boards both
    // carry LIGHT paper, so light inherits :root's headings; only glass
    // (dark paper) re-lightens them.
    const themeCss = readFileSync(resolve(rendererDir, 'theme.css'), 'utf8')
    const glass = themeCss.slice(themeCss.indexOf("[data-theme='glass']"))
    expect(glass).toMatch(/--ew-note-h1:/)
    const light = themeCss.slice(
      themeCss.indexOf("[data-theme='light']"),
      themeCss.indexOf("[data-theme='glass']"),
    )
    expect(light).not.toMatch(/--ew-note-h1:/)
  })

  it('keeps raw chrome colors confined to theme.css', () => {
    const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba\(/g
    const failures: string[] = []

    for (const file of filesUnder(rendererDir)) {
      const rel = relative(rendererDir, file)
      if (allowedFiles.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(rawColor)) {
        const before = text.slice(0, match.index)
        const line = before.split('\n').length
        failures.push(`${rel}:${line}: ${match[0]}`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})


describe('applyTheme', () => {
  afterEach(() => vi.unstubAllGlobals())

  function installGlobals(setVibrancy: (enabled: boolean) => Promise<boolean>): {
    dataset: Record<string, string | undefined>
  } {
    const documentElement = { dataset: {} as Record<string, string | undefined> }
    vi.stubGlobal('document', { documentElement })
    vi.stubGlobal('window', { ew: { window: { setVibrancy } } })
    return documentElement
  }

  it('stamps light and clears vibrancy', async () => {
    const setVibrancy = vi.fn(async () => true)
    const root = installGlobals(setVibrancy)

    await expect(applyTheme('light')).resolves.toBe('light')

    expect(root.dataset['theme']).toBe('light')
    expect(setVibrancy).toHaveBeenCalledWith(false)
  })

  it('falls glass back to dark when vibrancy is unavailable', async () => {
    const setVibrancy = vi.fn(async (enabled: boolean) => !enabled)
    const root = installGlobals(setVibrancy)

    await expect(applyTheme('glass')).resolves.toBe('dark')

    expect(root.dataset['theme']).toBe('dark')
    expect(setVibrancy).toHaveBeenNthCalledWith(1, true)
    expect(setVibrancy).toHaveBeenNthCalledWith(2, false)
  })
})
