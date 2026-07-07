import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Soft guard (AI-IMP-142): the shared text-field skin now lives in
// ui/TextInput.svelte, keyed on --ew-surface-input. A NEW .svelte file
// that reaches for that token to hand-roll its own input field is
// re-opening the duplication this ticket closed — it should consume the
// primitive instead. This is a lint-style nudge (a single-token scan
// with an allowlist), not a proof: it will not catch a field built from
// other tokens, and that is fine.
const rendererDir = fileURLToPath(new URL('..', import.meta.url))
const INPUT_STYLE_TOKEN = '--ew-surface-input'

// Relative paths (posix) exempt from the guard. `ui/` is where the
// primitive legitimately declares the token; the allowlist is now
// EMPTY (AI-IMP-153, the "One voice" ruling): every straggler field
// migrated onto ui/TextInput.svelte, so the guard is absolute — any
// non-ui .svelte touching the field token is a regression.
const ALLOWLIST = new Map<string, string>([])

function svelteFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...svelteFilesUnder(path))
    else if (entry.name.endsWith('.svelte')) files.push(path)
  }
  return files
}

function posixRel(file: string): string {
  return relative(rendererDir, file).split(sep).join('/')
}

function isExempt(posixPath: string): boolean {
  return posixPath.startsWith('ui/') || ALLOWLIST.has(posixPath)
}

describe('input styling guard (AI-IMP-142)', () => {
  it('no new .svelte file hand-rolls a text field from --ew-surface-input', () => {
    const failures: string[] = []
    for (const file of svelteFilesUnder(rendererDir)) {
      const rel = posixRel(file)
      if (isExempt(rel)) continue
      if (readFileSync(file, 'utf8').includes(INPUT_STYLE_TOKEN)) {
        failures.push(
          `${rel}: uses ${INPUT_STYLE_TOKEN} directly — consume ui/TextInput.svelte, ` +
            `or allowlist it in this test with a reason.`,
        )
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('detects a planted hand-rolled field with the guard now absolute', () => {
    // The detector proof (the plant, in-memory so it never touches the
    // tree): a non-exempt file carrying the token is a violation; only
    // the primitive's own home under ui/ is exempt. With the allowlist
    // emptied (AI-IMP-153), previously-exempt surfaces are now caught —
    // the guard is absolute.
    const planted = 'background: var(--ew-surface-input); border-radius: 999px;'
    expect(planted.includes(INPUT_STYLE_TOKEN)).toBe(true)
    expect(isExempt('chrome/PlantedField.svelte')).toBe(false)
    expect(isExempt('ui/TextInput.svelte')).toBe(true)
    // Formerly allowlisted — now no longer exempt.
    expect(isExempt('chrome/RestoreDialog.svelte')).toBe(false)
    expect(isExempt('views/GalleryFacets.svelte')).toBe(false)
  })
})
