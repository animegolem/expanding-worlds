/**
 * Criterion 6 (static half) — scan the bundled editor source for DOM
 * APIs that misbehave in hidden/offscreen Electron windows or that EW
 * has been burned by before (the <datalist> hazard). A clean scan +
 * the fact the whole test suite runs under jsdom with NO browser is
 * the headless-safety floor; a real hidden-Electron smoke is a cheap
 * confirmation left to the first integration IMP.
 */
import esbuild from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'

const ENTRY = `
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { WikiLink, Embed } from './src/wiki-extensions.mjs'
import { HeadingFold } from './src/folding.mjs'
export { Editor, StarterKit, Markdown, WikiLink, Embed, HeadingFold }
`
writeFileSync(new URL('../_scan-entry.mjs', import.meta.url), ENTRY)
const r = await esbuild.build({
  entryPoints: [new URL('../_scan-entry.mjs', import.meta.url).pathname],
  bundle: true, minify: false, format: 'esm', platform: 'browser',
  target: 'es2020', write: false,
})
const code = Buffer.from(r.outputFiles[0].contents).toString('utf8')
rmSync(new URL('../_scan-entry.mjs', import.meta.url), { force: true })

const patterns = {
  'datalist': /createElement\(["']datalist|<datalist/gi,
  'dialog/showModal': /showModal\(|createElement\(["']dialog/gi,
  'window.open/popup': /window\.open\(/gi,
  'alert/prompt/confirm': /\b(window\.)?(alert|prompt|confirm)\(/gi,
  'ResizeObserver': /ResizeObserver/g,
  'IntersectionObserver': /IntersectionObserver/g,
  'requestAnimationFrame': /requestAnimationFrame/g,
  'getBoundingClientRect': /getBoundingClientRect/g,
  'contentEditable': /contentEditable|contenteditable/g,
  'document.execCommand': /execCommand/g,
}
console.log('=== ELECTRON HIDDEN-WINDOW HAZARD SCAN (bundled source) ===')
for (const [name, re] of Object.entries(patterns)) {
  console.log(`  ${name.padEnd(24)}: ${(code.match(re) || []).length}`)
}
