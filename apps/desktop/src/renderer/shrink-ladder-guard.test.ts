import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The shrink-ladder guard (AI-IMP-133, §8.2). The shrink ladder is
// governed by exactly two constants — EW_FURNITURE_MIN_PX and
// EW_PAGE_FLOOR_PX in packages/canvas-engine/src/shrink-ladder.ts —
// and "any rendered-size conditional not referencing them is a review
// failure" (§8.2). This scan fails a drive-by MAGIC-NUMBER size gate:
// a rendered-size variable compared against a bare numeric literal.
//
// PRAGMATIC, not a type-checker (mirrors z-guard.test.ts). It catches
// the shape the ticket cares about — `rendered < 8`,
// `Math.min(screenW, screenH) < 48` — while a gate written against a
// NAMED constant (`rendered < EW_FURNITURE_MIN_PX`,
// `< CHARM_MIN_SCREEN_PX`) is not a literal and passes. Perfect static
// analysis is not the bar; catching drive-by magic numbers is.
//
// SCOPE: renderer *.ts + canvas-engine *.ts. SCALE gates (a fraction of
// a default size, e.g. PANEL_LEGIBILITY_FLOOR = 0.4) are a documented
// ratio, not a rendered-px gate, and do not use these variable names —
// they are out of the pattern by design (§8.2, AI-IMP-133 inventory).

const rendererDir = fileURLToPath(new URL('.', import.meta.url))
const engineDir = resolve(rendererDir, '../../../../packages/canvas-engine/src')

// A variable holding the RENDERED screen size of world content. A
// magic-number gate keys one of these against a bare literal.
const SIZE_VAR =
  /\b(rendered|renderedPx|renderedSize|screenW|screenH|screenPx|screenSize|screenMin|onScreenPx|screenWidth|screenHeight)\b/
// A comparison against a bare numeric literal (either operand). The
// `[^=>]` after the reverse form rejects `=>` arrow bodies.
const CMP_LITERAL = /(?:[<>]=?\s*\d)|(?:\d\s*[<>]=?[^=>])/

// Documented exceptions, each with a reason. Empty today: the audited
// gates all reference the shared constants (or a named alias of them).
const ALLOW: ReadonlyArray<{ file: string; reason: string }> = []

function isMagicSizeGate(line: string): boolean {
  return SIZE_VAR.test(line) && CMP_LITERAL.test(line)
}

function tsFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      files.push(...tsFilesUnder(path))
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(path)
    }
  }
  return files
}

describe('shrink-ladder guard (AI-IMP-133, §8.2)', () => {
  it('no renderer or engine source gates a rendered-size variable on a magic number', () => {
    const failures: string[] = []
    for (const root of [rendererDir, engineDir]) {
      for (const file of tsFilesUnder(root)) {
        const rel = relative(root, file).split(sep).join('/')
        // The ladder module itself defines the constants.
        if (rel === 'shrink-ladder.ts') continue
        if (ALLOW.some((entry) => rel.endsWith(entry.file))) continue
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (isMagicSizeGate(line)) {
            failures.push(
              `${rel}:${i + 1}: rendered-size gate on a magic number — ` +
                `reference EW_FURNITURE_MIN_PX / EW_PAGE_FLOOR_PX (or a named ` +
                `alias) from @ew/canvas-engine's shrink-ladder.`,
            )
          }
        })
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('detects a planted magic size-gate and clears a named-constant gate', () => {
    // The detector proof (in memory, so it never touches the tree):
    const plantedDirect = 'const belowFurniture = rendered < 8'
    const plantedMinMax = 'if (Math.min(screenW, screenH) < 48) continue'
    const namedFurniture = 'const belowFurniture = rendered < EW_FURNITURE_MIN_PX'
    const namedCharm = 'if (Math.min(screenW, screenH) < CHARM_MIN_SCREEN_PX) continue'
    const scaleGate = 'if (scale >= PANEL_LEGIBILITY_FLOOR) return 1'
    const assignment = 'const rendered = size * safeZoom * (Math.abs(item.scale) || 1)'
    const arrow = 'items.forEach((item, i) => renderedFor(item))'

    // Bare literals against a rendered-size variable → violations.
    expect(isMagicSizeGate(plantedDirect)).toBe(true)
    expect(isMagicSizeGate(plantedMinMax)).toBe(true)
    // Named-constant gates → clean (the value lives in the ladder).
    expect(isMagicSizeGate(namedFurniture)).toBe(false)
    expect(isMagicSizeGate(namedCharm)).toBe(false)
    // A scale-domain fraction gate is not keyed on a rendered-size var.
    expect(isMagicSizeGate(scaleGate)).toBe(false)
    // A plain assignment / an arrow body are not comparisons.
    expect(isMagicSizeGate(assignment)).toBe(false)
    expect(isMagicSizeGate(arrow)).toBe(false)
  })
})
