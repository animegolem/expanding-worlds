import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

/**
 * The RFC revision, read from the RFC header table AT BUILD TIME so
 * Help/About prints the live spec revision (RFC §8.4) without anyone
 * hand-copying the number. Parses the header row
 * `| Accepted for Phase 1 | 0.56 | 7 July 2026 |`.
 *
 * The About card exists to PROVE spec↔build alignment, so a missing
 * file, moved header, or empty capture must FAIL THE BUILD LOUDLY rather
 * than silently shipping a placeholder (PR #9 reviewer directions;
 * AI-IMP-155). The thrown message names the path and the expected header
 * shape so the fix is one obvious edit.
 */
const RFC_PATH = '../../RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md'
const RFC_HEADER_SHAPE = '| Accepted for Phase 1 | <rev> | <date> |'

function rfcRevision(): string {
  const path = fileURLToPath(new URL(RFC_PATH, import.meta.url))
  let header: string
  try {
    header = readFileSync(path, 'utf8').slice(0, 2000)
  } catch (cause) {
    throw new Error(
      `rfcRevision: cannot read the RFC at ${path} for the Help/About build constant. ` +
        `The About card must print the live spec revision (RFC §8.4). ` +
        `Restore the file or fix the path in electron.vite.config.ts.`,
      { cause },
    )
  }
  const match = header.match(/\|\s*Accepted for Phase 1\s*\|\s*([0-9.]+)\s*\|/)
  if (!match?.[1]) {
    throw new Error(
      `rfcRevision: no revision found in the header of ${path}. ` +
        `Expected a header-table row shaped "${RFC_HEADER_SHAPE}" within the first 2000 chars. ` +
        `Fix the RFC header or the regex in electron.vite.config.ts.`,
    )
  }
  return match[1]
}

/**
 * Main, preload, and the utility-process entry build as CJS: sandboxed
 * preloads must be CommonJS, and keeping all three uniform avoids
 * split-format loader trouble. The renderer stays browser ESM.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Overriding rollupOptions drops electron-vite's default
        // externals, so list them ourselves: the electron shim and
        // every node: builtin (the utility bundle uses node:sqlite).
        external: ['electron', /^node:/],
        input: {
          index: 'src/main/index.ts',
          utility: 'src/utility/index.ts',
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron', /^node:/],
        input: { index: 'src/preload/index.ts' },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    // Build-time constant: Help/About reads the live RFC revision here
    // (never a hand-copied literal).
    define: {
      __RFC_REV__: JSON.stringify(rfcRevision()),
    },
    plugins: [svelte({ compilerOptions: { runes: true } })],
    // Workspace packages stay OUT of vite's dependency prebundle
    // (AI-IMP-036): prebundling freezes their dist at server start,
    // so engine rebuilds silently never reached a running dev
    // session. Excluded, they load as live ESM — a plain window
    // reload picks up a fresh `pnpm -r build`.
    optimizeDeps: {
      exclude: ['@ew/canvas-engine', '@ew/commands', '@ew/domain', '@ew/protocol', '@ew/shared-ui'],
    },
  },
})
