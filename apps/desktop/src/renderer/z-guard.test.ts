import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The z-ladder guard (AI-IMP-143, §8.8). Every stacking value in the
// renderer's imperative DOM code must reference the named ladder in
// z.ts — `z-index:${Z.affordance}` — never a bare number. This scan
// fails a literal numeric z-index in renderer *.ts sources.
//
// SCOPE: renderer *.ts only. The 7 audited sites all live in .ts. The
// .svelte chrome band (overlay-host, dock, chrome-layer, source panel,
// the note-panel dialogs) is a separate, larger migration — §8.8's
// "eleven collision pairs (AI-EPIC-016)", and CanvasHost.svelte's
// overlay-host carries an in-code note deferring its ad-hoc 500 to
// "EPIC-016's named z-ladder ... the 'modal' rung". Guarding those
// here would mean allowlisting ~34 pre-existing literals in files this
// ticket must not touch; that band is EPIC-016's to port and guard.
//
// CONVENTION: a literal numeric z-index is allowed only when its line
// also carries a `rung:` comment — the escape hatch for an intra-
// overlay LOCAL stacking context (a small int scoped to one absolutely
// -positioned parent, e.g. the tag-popover completions), which is not
// a global-ladder decision.
const rendererDir = fileURLToPath(new URL('.', import.meta.url))

// A numeric z-index literal: `z-index: 30`, `z-index:1`. A ladder
// reference reads `z-index:${Z.popover}` — the char after the colon is
// `$`, never a digit — so it does not match.
const LITERAL_Z = /z-index\s*:\s*\d/
// The comment convention that exempts a documented local context.
const RUNG_COMMENT = /rung:/

function tsFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...tsFilesUnder(path))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path)
  }
  return files
}

function posixRel(file: string): string {
  return relative(rendererDir, file).split(sep).join('/')
}

describe('z-ladder guard (AI-IMP-143, §8.8)', () => {
  it('no renderer .ts file carries a literal numeric z-index off the ladder', () => {
    const failures: string[] = []
    for (const file of tsFilesUnder(rendererDir)) {
      const rel = posixRel(file)
      if (rel === 'z.ts') continue
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (LITERAL_Z.test(line) && !RUNG_COMMENT.test(line)) {
          failures.push(
            `${rel}:${i + 1}: literal z-index — reference a Z.<rung> from z.ts, ` +
              `or mark an intra-overlay local with a \`rung:\` comment on the line.`,
          )
        }
      })
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('detects a planted literal and honours the ladder + local-context escape hatch', () => {
    // The detector proof (in memory, so it never touches the tree):
    const planted = 'menu.style.cssText = `position:absolute;z-index:30;min-width:180px;`'
    const ladder = 'menu.style.cssText = `position:absolute;z-index:${Z.popover};min-width:180px;`'
    const local = "'left:0;z-index:1;' + // rung: popover — local stacking context within the tag popover"

    // A bare number, no `rung:` → violation.
    expect(LITERAL_Z.test(planted) && !RUNG_COMMENT.test(planted)).toBe(true)
    // A ladder reference → not even a literal.
    expect(LITERAL_Z.test(ladder)).toBe(false)
    // A documented local → literal, but the `rung:` comment clears it.
    expect(LITERAL_Z.test(local) && !RUNG_COMMENT.test(local)).toBe(false)
  })
})
