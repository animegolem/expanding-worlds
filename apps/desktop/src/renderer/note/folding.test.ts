// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { baseNoteExtensions } from './editor-markdown'
import { computeFoldRange, foldKey, foldMap, foldRangeAtPos, toggleFold } from './folding'

/**
 * AI-IMP-148 heading folding. Two invariants proven here:
 *   - the org-style fold map: a heading fences down to the next heading of
 *     EQUAL OR HIGHER level, so levels 1–6 nest correctly (a 6-level
 *     fixture);
 *   - folding is DECORATION-ONLY (Markdown byte-identical while folded) and
 *     the caret never strands inside a fold (fold moves it out; a caret
 *     landing inside hidden text unfolds).
 */

// A fully nested 6-level fixture plus sibling sections at the ends.
const FIXTURE = [
  '# One',
  '',
  'body one',
  '',
  '## Two',
  '',
  'body two',
  '',
  '### Three',
  '',
  'body three',
  '',
  '#### Four',
  '',
  'body four',
  '',
  '##### Five',
  '',
  'body five',
  '',
  '###### Six',
  '',
  'body six',
  '',
  '## TwoB',
  '',
  'body twoB',
  '',
  '# OneB',
  '',
  'body oneB',
].join('\n')

const editors: Editor[] = []

function makeEditor(content: string): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({ element, extensions: baseNoteExtensions(), content })
  editors.push(editor)
  return editor
}

/** Top-level position of the heading at `level` whose text is `text`. */
function headingPos(doc: PMNode, level: number, text: string): number {
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === 'heading' && child.attrs['level'] === level && child.textContent === text)
      return pos
    pos += child.nodeSize
  }
  throw new Error(`heading not found: h${level} "${text}"`)
}

function sliceText(doc: PMNode, from: number, to: number): string {
  return doc.cut(from, to).textContent
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

describe('AI-IMP-148 fold map (org-style nesting)', () => {
  it('folds every level down to the next same-or-higher heading', () => {
    const { doc } = makeEditor(FIXTURE).state

    // h1 "One" fences EVERYTHING until the next h1 ("OneB").
    const one = foldRangeAtPos(doc, headingPos(doc, 1, 'One'))!
    expect(one).not.toBeNull()
    const oneText = sliceText(doc, one.from, one.to)
    expect(oneText).toContain('body one')
    expect(oneText).toContain('Six')
    expect(oneText).toContain('body twoB')
    expect(oneText).not.toContain('OneB')

    // h2 "Two" fences its nested h3..h6 but stops at the sibling h2 "TwoB".
    const two = foldRangeAtPos(doc, headingPos(doc, 2, 'Two'))!
    const twoText = sliceText(doc, two.from, two.to)
    expect(twoText).toContain('body two')
    expect(twoText).toContain('Six')
    expect(twoText).toContain('body six')
    expect(twoText).not.toContain('TwoB')

    // h3 "Three" continues through the deeper h4/h5/h6 (all > 3) and stops
    // at the sibling h2 "TwoB" (level 2 <= 3).
    const three = foldRangeAtPos(doc, headingPos(doc, 3, 'Three'))!
    const threeText = sliceText(doc, three.from, three.to)
    expect(threeText).toContain('Four')
    expect(threeText).toContain('body six')
    expect(threeText).not.toContain('TwoB')

    // h6 "Six" fences only its own body (next heading TwoB is higher).
    const six = foldRangeAtPos(doc, headingPos(doc, 6, 'Six'))!
    const sixText = sliceText(doc, six.from, six.to)
    expect(sixText).toContain('body six')
    expect(sixText).not.toContain('TwoB')

    // The trailing h1 "OneB" fences its body (no heading follows).
    const oneB = foldRangeAtPos(doc, headingPos(doc, 1, 'OneB'))!
    expect(sliceText(doc, oneB.from, oneB.to)).toContain('body oneB')
  })

  it('offers a fold for every heading in the fixture', () => {
    const { doc } = makeEditor(FIXTURE).state
    // 8 headings, each fences at least its own body → 8 foldable entries.
    expect(foldMap(doc).size).toBe(8)
  })

  it('returns null for a heading that fences nothing', () => {
    const { doc } = makeEditor(['# A', '', '## B'].join('\n')).state
    // "A" is immediately followed by a higher-or-equal... no: B is h2 > h1,
    // so A fences B (its only content). B is trailing with nothing under.
    const b = topLevelIndexOfHeading(doc, 2, 'B')
    expect(computeFoldRange(doc, b)).toBeNull()
  })
})

function topLevelIndexOfHeading(doc: PMNode, level: number, text: string): number {
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === 'heading' && child.attrs['level'] === level && child.textContent === text)
      return i
  }
  throw new Error(`heading not found: h${level} "${text}"`)
}

describe('AI-IMP-148 decoration-only + caret discipline', () => {
  it('hides content with display:none while leaving the Markdown byte-identical', () => {
    const editor = makeEditor(FIXTURE)
    const before = editor.storage.markdown.getMarkdown()
    const pos = headingPos(editor.state.doc, 2, 'Two')

    toggleFold(editor.view, pos)
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(true)

    const html = editor.view.dom.innerHTML
    expect(html).toContain('display: none')
    expect(html).toContain('ew-folded')
    expect(html).toContain('[...]') // folded-line marker
    // CRITICAL: the source is unchanged while folded.
    expect(editor.storage.markdown.getMarkdown()).toBe(before)

    toggleFold(editor.view, pos)
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(false)
    expect(editor.storage.markdown.getMarkdown()).toBe(before)
  })

  it('renders a chevron affordance per foldable heading', () => {
    const editor = makeEditor(FIXTURE)
    const chevrons = editor.view.dom.querySelectorAll('[data-testid="fold-chevron"]')
    expect(chevrons.length).toBe(8)
  })

  it('moves the caret out of a section when it folds', () => {
    const editor = makeEditor(FIXTURE)
    const pos = headingPos(editor.state.doc, 2, 'Two')
    const range = foldRangeAtPos(editor.state.doc, pos)!

    // Put the caret inside the section body, then fold.
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from + 2)),
    )
    toggleFold(editor.view, pos)

    // Still folded, and the caret is now outside the hidden range.
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(true)
    const { from } = editor.state.selection
    expect(from < range.from || from >= range.to).toBe(true)
  })

  it('unfolds when a selection lands inside hidden text (caret never strands)', () => {
    const editor = makeEditor(FIXTURE)
    const pos = headingPos(editor.state.doc, 2, 'Two')

    // Fold with the caret at the top (no move needed).
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)))
    toggleFold(editor.view, pos)
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(true)

    // Programmatically drop the caret deep inside the now-hidden region
    // (what an edit command / find would do) — it unfolds.
    const range = foldRangeAtPos(editor.state.doc, pos)!
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from + 2)),
    )
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(false)
  })

  it('keeps a fold anchored to its heading as text is typed above it', () => {
    const editor = makeEditor(FIXTURE)
    const pos = headingPos(editor.state.doc, 2, 'TwoB')
    toggleFold(editor.view, pos)
    expect(foldKey.getState(editor.state)!.folded.has(pos)).toBe(true)

    // Insert text at the very start of the doc; the fold follows its
    // heading rather than staying at the stale position.
    editor.view.dispatch(editor.state.tr.insertText('X', 1))
    const moved = headingPos(editor.state.doc, 2, 'TwoB')
    expect(moved).not.toBe(pos)
    expect(foldKey.getState(editor.state)!.folded.has(moved)).toBe(true)
    expect(foldRangeAtPos(editor.state.doc, moved)).not.toBeNull()
  })
})
