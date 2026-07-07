/**
 * Comparison bundle: the CURRENT CodeMirror set exactly as imported by
 * apps/desktop/src/renderer/note/note-editor.ts, so the TipTap bundle
 * number (measure-bundle.mjs) is judged against the weight already in
 * the app rather than against zero. CM packages live in this spike's
 * OWN devDependencies — the app tree is untouched.
 */
import esbuild from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync, rmSync } from 'node:fs'

const ENTRY = `
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
export { defaultKeymap, history, historyKeymap, markdown, defaultHighlightStyle, syntaxHighlighting, EditorState, EditorView, keymap, placeholder }
`
writeFileSync(new URL('../_cm-entry.mjs', import.meta.url), ENTRY)
const r = await esbuild.build({
  entryPoints: [new URL('../_cm-entry.mjs', import.meta.url).pathname],
  bundle: true, minify: true, format: 'esm', platform: 'browser',
  target: 'es2020', write: false, legalComments: 'none',
})
const out = r.outputFiles[0].contents
const gz = gzipSync(Buffer.from(out))
console.log('current CodeMirror set (as shipped in note-editor.ts):')
console.log(`  raw minified : ${(out.length / 1024).toFixed(1)} KiB`)
console.log(`  gzipped      : ${(gz.length / 1024).toFixed(1)} KiB`)
rmSync(new URL('../_cm-entry.mjs', import.meta.url), { force: true })
