import { describe, it, expect } from 'vitest'
import { undoDepth } from '@tiptap/pm/history'
import { makeEditor, toMarkdown } from './editor.mjs'

/**
 * Criterion 4 — editor-local undo isolation (§10.2 boundary).
 * TipTap ships ProseMirror's history plugin (part of StarterKit). The
 * §7 syncExternal seam applies a programmatic external body update.
 * We prove that update can be kept OUT of the undo stack via
 * addToHistory:false, so structural rewrites never enter editor-local
 * undo and undo never crosses into structural territory.
 */
describe('undo isolation', () => {
  it("external body update with addToHistory:false doesn't enter undo", () => {
    const editor = makeEditor('start')
    // User types -> one history event.
    editor.commands.insertContent(' typed')
    const afterTyping = undoDepth(editor.state)
    expect(afterTyping).toBeGreaterThan(0)

    // syncExternal-style programmatic rewrite: append text via a raw
    // transaction flagged out of history (the seam's discipline).
    const tr = editor.state.tr
    tr.insertText(' EXTERNAL', editor.state.doc.content.size - 1)
    tr.setMeta('addToHistory', false)
    editor.view.dispatch(tr)

    const afterExternal = undoDepth(editor.state)
    console.log('\n=== UNDO ISOLATION ===')
    console.log('undoDepth after typing  :', afterTyping)
    console.log('undoDepth after external:', afterExternal)
    // The external change did NOT grow the undo stack.
    expect(afterExternal).toBe(afterTyping)

    // The external text is present in the doc...
    expect(editor.getText()).toContain('EXTERNAL')
    // ...and undo reverts the USER'S typing, never the external edit.
    editor.commands.undo()
    const md = toMarkdown(editor)
    expect(md).toContain('EXTERNAL')
    expect(md).not.toContain('typed')
    editor.destroy()
  })

  it('default (unflagged) external edit WOULD pollute undo — the trap', () => {
    const editor = makeEditor('start')
    editor.commands.insertContent(' typed')
    const before = undoDepth(editor.state)
    // Same edit WITHOUT the flag: enters history (this is the failure
    // mode the seam must avoid; documented so integration wires the flag).
    const tr = editor.state.tr
    tr.insertText(' EXTERNAL', editor.state.doc.content.size - 1)
    editor.view.dispatch(tr)
    const after = undoDepth(editor.state)
    console.log('unflagged external grew undo depth:', before, '->', after)
    expect(after).toBeGreaterThan(before)
    editor.destroy()
  })
})
