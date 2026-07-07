/**
 * Criterion 5 — perf. Method: build a ~5k-word note body (mixed
 * headings / paragraphs / lists / a few wiki-links), then measure
 * (a) OPEN = construct the editor from markdown (parse -> doc ->
 * EditorView) and (b) TYPING latency = time to apply one single-char
 * insert transaction at the caret, averaged over N inserts.
 *
 * CAVEAT (stated so numbers are not over-trusted): this runs under
 * jsdom in Node, NOT Chromium/Electron. jsdom has no layout, so
 * ProseMirror's DOM write + reflow cost is UNDER-counted; parse and
 * transaction/plugin-apply cost (the CPU-bound part) is representative.
 * Treat OPEN as a floor and TYPING as indicative of the JS work per
 * keystroke, not the composited frame.
 */
import { performance } from 'node:perf_hooks'
import { installDom } from './dom-env.mjs'
installDom()
const { makeEditor } = await import('./editor.mjs')

function buildBody(targetWords) {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do'.split(' ')
  const out = []
  let count = 0
  let i = 0
  while (count < targetWords) {
    const kind = i % 7
    if (kind === 0) {
      out.push(`## Section ${i}`)
      count += 2
    } else if (kind === 3) {
      out.push(`- item with [[Ref ${i}]] and some words here now`)
      count += 8
    } else {
      const n = 40
      const para = Array.from({ length: n }, (_, k) => words[(i + k) % words.length]).join(' ')
      out.push(para + '.')
      count += n
    }
    out.push('')
    i++
  }
  return out.join('\n')
}

const body = buildBody(5000)
const wordCount = body.split(/\s+/).filter(Boolean).length
console.log(`corpus: ${wordCount} words, ${body.length} chars`)

// --- OPEN latency (median of 7) ---
const opens = []
let editor
for (let r = 0; r < 7; r++) {
  const t0 = performance.now()
  editor = makeEditor(body)
  const t1 = performance.now()
  opens.push(t1 - t0)
  if (r < 6) editor.destroy()
}
opens.sort((a, b) => a - b)
const median = (a) => a[Math.floor(a.length / 2)]
console.log(`OPEN (parse+construct): median ${median(opens).toFixed(1)} ms  (min ${opens[0].toFixed(1)}, max ${opens[opens.length - 1].toFixed(1)})`)

// --- TYPING latency: apply single-char inserts near the end ---
const N = 500
const times = []
const pos = editor.state.doc.content.size - 2
for (let k = 0; k < N; k++) {
  const t0 = performance.now()
  const tr = editor.state.tr.insertText('x', Math.min(pos, editor.state.doc.content.size - 1))
  editor.view.dispatch(tr)
  const t1 = performance.now()
  times.push(t1 - t0)
}
times.sort((a, b) => a - b)
const mean = times.reduce((s, x) => s + x, 0) / times.length
const p95 = times[Math.floor(times.length * 0.95)]
console.log(`TYPING (per keystroke tx-apply, n=${N}): mean ${mean.toFixed(3)} ms  median ${median(times).toFixed(3)} ms  p95 ${p95.toFixed(3)} ms`)
editor.destroy()
