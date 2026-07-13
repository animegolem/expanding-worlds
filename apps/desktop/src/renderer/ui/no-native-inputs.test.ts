import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type NativeKind = 'color' | 'number' | 'select' | 'datalist'
interface NativeUse { file: string; kind: NativeKind; testid: string }
const renderer = fileURLToPath(new URL('..', import.meta.url))
const allowed = new Set([
  ...['sel-stroke', 'sel-fill', 'text-selected-color'].map((id) => `chrome/Dock.svelte|color|${id}`),
  ...['sel-stroke-width', 'sel-rounding', 'text-size'].map((id) => `chrome/Dock.svelte|number|${id}`),
  'chrome/Dock.svelte|select|text-family',
  'chrome/TitleStrip.svelte|color|bg-color',
])
const key = (entry: NativeUse): string => `${entry.file}|${entry.kind}|${entry.testid}`

function detect(source: string, file: string): NativeUse[] {
  const found: NativeUse[] = []
  const markup = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/.*$/gm, '')
  for (const match of markup.matchAll(/<(input|select|datalist)\b[\s\S]*?(?<![=])>/gi)) {
    const tag = match[1]!.toLowerCase()
    const text = match[0]
    const kind = tag === 'select' || tag === 'datalist'
      ? tag as NativeKind
      : /\btype\s*=\s*["'](color|number)["']/i.exec(text)?.[1]?.toLowerCase() as NativeKind | undefined
    if (!kind) continue
    const testid = /\bdata-testid\s*=\s*["']([^"']+)["']/i.exec(text)?.[1] ?? '(missing)'
    found.push({ file, kind, testid })
  }
  return found
}

function rendererNatives(): NativeUse[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (extname(path) === '.svelte') files.push(path)
    }
  }
  visit(join(renderer, 'chrome'))
  visit(join(renderer, 'ui'))
  return files.flatMap((path) => detect(readFileSync(path, 'utf8'), relative(renderer, path).split('\\').join('/')))
}

describe('no new native kit inputs', () => {
  it('holds the shrinking retirement allowlist after tool defaults adopt kit controls', () => {
    const actual = rendererNatives().map(key).sort()
    expect(actual).toHaveLength(8)
    expect(new Set(actual).size).toBe(actual.length)
    expect(actual).toEqual([...allowed].sort())
  })

  it('detects planted natives by kind and testid, including multiline tags', () => {
    const planted = detect(`<select\n data-testid="new-select"></select><input data-testid='new-color'\n type='color'><input type="number" data-testid="new-number"><datalist id="bad">`, 'chrome/Plant.svelte')
    expect(planted.map((entry) => [entry.kind, entry.testid])).toEqual([
      ['select', 'new-select'], ['color', 'new-color'], ['number', 'new-number'], ['datalist', '(missing)'],
    ])
    expect(planted.some((entry) => allowed.has(key(entry)))).toBe(false)
  })
})
