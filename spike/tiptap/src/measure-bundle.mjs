/**
 * Criterion 7 — bundle cost of the minimal extension set. We bundle a
 * realistic entry (Editor + StarterKit + tiptap-markdown + the two
 * wiki atoms) with esbuild (minify, tree-shake, ESM, browser platform)
 * and report raw + gzipped bytes. This is the added weight the editor
 * would bring into apps/desktop's renderer bundle.
 */
import esbuild from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync, rmSync } from 'node:fs'

const ENTRY = `
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { WikiLink, Embed } from './src/wiki-extensions.mjs'
export { Editor, StarterKit, Markdown, WikiLink, Embed }
`
writeFileSync(new URL('../_bundle-entry.mjs', import.meta.url), ENTRY)

const result = await esbuild.build({
  entryPoints: [new URL('../_bundle-entry.mjs', import.meta.url).pathname],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  write: false,
  legalComments: 'none',
})
const out = result.outputFiles[0].contents
const gz = gzipSync(Buffer.from(out))
console.log(`minimal set (Editor+StarterKit+markdown+wiki atoms):`)
console.log(`  raw minified : ${(out.length / 1024).toFixed(1)} KiB (${out.length} B)`)
console.log(`  gzipped      : ${(gz.length / 1024).toFixed(1)} KiB (${gz.length} B)`)
rmSync(new URL('../_bundle-entry.mjs', import.meta.url), { force: true })
