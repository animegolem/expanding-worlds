// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { baseNoteExtensions } from './editor-markdown'
import { clampBar, shouldShowBar, wikiLinkFor } from './format-bar'

/**
 * AI-IMP-149 unit coverage: the pure pieces of the selection format bar
 * — the visibility predicate (bar on selection ONLY, no standing
 * chrome), the §8.8 clamp-and-flip placement, the link verb's
 * title-token handling — plus the load-bearing integration property:
 * every verb's edit serializes into the frozen §7.1 dialect (the same
 * carrier the round-trip corpus pins).
 */

describe('shouldShowBar (selection-only, no standing chrome)', () => {
  it('shows only for a non-empty selection in a focused, editable buffer', () => {
    expect(shouldShowBar({ empty: false, editable: true, focused: true })).toBe(true)
  })

  it('hides on a collapsed selection (the caret is not furniture)', () => {
    expect(shouldShowBar({ empty: true, editable: true, focused: true })).toBe(false)
  })

  it('hides in a read-only buffer (§7.1 In Trash view)', () => {
    expect(shouldShowBar({ empty: false, editable: false, focused: true })).toBe(false)
  })

  it('hides when the editor is blurred (no stale bar behind a panel)', () => {
    expect(shouldShowBar({ empty: false, editable: true, focused: false })).toBe(false)
  })
})

describe('clampBar (§8.8 clamp-and-flip)', () => {
  const size = { width: 200, height: 32 }
  const viewport = { width: 1000, height: 800 }

  it('centres above the selection with a gap', () => {
    const at = clampBar({ centerX: 500, top: 300, bottom: 320 }, size, viewport)
    expect(at.left).toBe(400)
    expect(at.top).toBe(300 - 32 - 8)
  })

  it('flips below when the top edge would clip', () => {
    const at = clampBar({ centerX: 500, top: 20, bottom: 40 }, size, viewport)
    expect(at.top).toBe(40 + 8)
  })

  it('clamps the left edge into the viewport', () => {
    const at = clampBar({ centerX: 10, top: 300, bottom: 320 }, size, viewport)
    expect(at.left).toBe(8)
  })

  it('clamps the right edge into the viewport', () => {
    const at = clampBar({ centerX: 995, top: 300, bottom: 320 }, size, viewport)
    expect(at.left).toBe(1000 - 200 - 8)
  })

  it('clamps the bottom edge when the flip would spill past it', () => {
    const at = clampBar({ centerX: 500, top: 10, bottom: 790 }, size, viewport)
    expect(at.top).toBe(800 - 32 - 8)
  })
})

describe('wikiLinkFor (link verb)', () => {
  it('wraps selected text as a §7.1 title token', () => {
    expect(wikiLinkFor('Ancient City')).toBe('[[Ancient City]]')
  })

  it('rejects empty and whitespace-only selections', () => {
    expect(wikiLinkFor('')).toBeNull()
    expect(wikiLinkFor('   ')).toBeNull()
  })

  it('rejects selections spanning a block boundary (newline in title)', () => {
    expect(wikiLinkFor('one\ntwo')).toBeNull()
  })
})

/** A live headless editor over the REAL base extension set. */
function makeEditor(markdown: string): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({ element, extensions: baseNoteExtensions(), content: markdown })
}

function selectWord(editor: Editor, word: string): void {
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')
  const at = text.indexOf(word)
  if (at < 0) throw new Error(`"${word}" not in doc`)
  // Doc positions: +1 for the opening paragraph token.
  editor.commands.setTextSelection({ from: at + 1, to: at + 1 + word.length })
}

describe('format verbs serialize into the frozen dialect (§7.1)', () => {
  it('bold emits **…**', () => {
    const editor = makeEditor('pick a word here')
    selectWord(editor, 'word')
    editor.chain().focus().toggleBold().run()
    expect(editor.storage.markdown.getMarkdown()).toBe('pick a **word** here')
    editor.destroy()
  })

  it('italic emits *…* (the dialect normalizes to the star family)', () => {
    const editor = makeEditor('pick a word here')
    selectWord(editor, 'word')
    editor.chain().focus().toggleItalic().run()
    expect(editor.storage.markdown.getMarkdown()).toBe('pick a *word* here')
    editor.destroy()
  })

  it('code emits `…`', () => {
    const editor = makeEditor('pick a word here')
    selectWord(editor, 'word')
    editor.chain().focus().toggleCode().run()
    expect(editor.storage.markdown.getMarkdown()).toBe('pick a `word` here')
    editor.destroy()
  })

  it('heading emits ATX #, toggles back to a paragraph', () => {
    const editor = makeEditor('a title line')
    selectWord(editor, 'title')
    editor.chain().focus().toggleHeading({ level: 2 }).run()
    expect(editor.storage.markdown.getMarkdown()).toBe('## a title line')
    editor.chain().focus().toggleHeading({ level: 2 }).run()
    expect(editor.storage.markdown.getMarkdown()).toBe('a title line')
    editor.destroy()
  })

  it('list emits the dialect bullet `-`', () => {
    const editor = makeEditor('a list item')
    selectWord(editor, 'list')
    editor.chain().focus().toggleBulletList().run()
    expect(editor.storage.markdown.getMarkdown()).toBe('- a list item')
    editor.destroy()
  })

  it('the link verb inserts a literal token that survives serialization', () => {
    const editor = makeEditor('go to Harbor now')
    selectWord(editor, 'Harbor')
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, '\n')
    const wrapped = wikiLinkFor(selected)
    expect(wrapped).toBe('[[Harbor]]')
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.insertText(wrapped!, from, to)
        return true
      })
      .run()
    // The source-preserving serializer keeps the token bytes verbatim —
    // never `\[\[Harbor\]\]` (AI-IMP-147).
    expect(editor.storage.markdown.getMarkdown()).toBe('go to [[Harbor]] now')
    editor.destroy()
  })
})
