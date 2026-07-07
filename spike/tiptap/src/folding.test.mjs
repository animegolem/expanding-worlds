import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { WikiLink, Embed } from './wiki-extensions.mjs'
import { HeadingFold, computeFoldRange, toggleFold, foldKey } from './folding.mjs'

function makeFoldEditor(content) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-' }),
      WikiLink,
      Embed,
      HeadingFold,
    ],
    content,
  })
}

const DOC = [
  '# Top',
  '',
  'intro para',
  '',
  '## Alpha',
  '',
  'alpha body one',
  '',
  'alpha body two',
  '',
  '## Beta',
  '',
  'beta body',
].join('\n')

describe('criterion 3 — heading folding', () => {
  it('fold range for an h2 stops at the next h2', () => {
    const editor = makeFoldEditor(DOC)
    const doc = editor.state.doc
    // Find the "## Alpha" heading top-level index.
    let alphaIndex = -1
    for (let i = 0; i < doc.childCount; i++) {
      const c = doc.child(i)
      if (c.type.name === 'heading' && c.attrs.level === 2 && c.textContent === 'Alpha') alphaIndex = i
    }
    expect(alphaIndex).toBeGreaterThan(-1)
    const range = computeFoldRange(doc, alphaIndex)
    expect(range).not.toBeNull()
    // The hidden slice contains alpha bodies but not the Beta heading.
    const slice = doc.cut(range.from, range.to)
    expect(slice.textContent).toContain('alpha body one')
    expect(slice.textContent).toContain('alpha body two')
    expect(slice.textContent).not.toContain('Beta')
    editor.destroy()
  })

  it('folding hides content via decorations but leaves markdown untouched', () => {
    const editor = makeFoldEditor(DOC)
    const before = editor.storage.markdown.getMarkdown()
    // top-level pos of "## Alpha"
    const doc = editor.state.doc
    let pos = 0
    for (let i = 0; i < doc.childCount; i++) {
      const c = doc.child(i)
      if (c.type.name === 'heading' && c.textContent === 'Alpha') break
      pos += c.nodeSize
    }
    toggleFold(editor, pos)
    // Decorations now hide the alpha bodies.
    const decoState = foldKey.getState(editor.state)
    expect(decoState.folded.has(pos)).toBe(true)
    const html = editor.view.dom.innerHTML
    expect(html).toContain('display: none')
    expect(html).toContain('ew-folded')
    // CRITICAL: source markdown is byte-identical while folded.
    const after = editor.storage.markdown.getMarkdown()
    expect(after).toBe(before)
    console.log('\n=== FOLDING ===')
    console.log('markdown unchanged while folded:', after === before)
    console.log('folded DOM has display:none:', html.includes('display: none'))
    // Unfold restores.
    toggleFold(editor, pos)
    expect(foldKey.getState(editor.state).folded.has(pos)).toBe(false)
    editor.destroy()
  })
})
