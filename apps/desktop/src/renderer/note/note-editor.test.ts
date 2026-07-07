// @vitest-environment jsdom
import type { CommandResult } from '@ew/commands'
import { Editor } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { renderMetadataBlock } from '@ew/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { baseNoteExtensions } from './editor-markdown'
import { NoteEditorController, type NoteRecord, type ProjectPort } from './note-editor'

/**
 * AI-IMP-146 controller invariants on the TipTap engine:
 *   - canonicalize-on-load commits ONCE via the ordinary save path, and
 *     a second open of the canonicalized body is a no-op;
 *   - the syncExternal seam reconciles PROSE ONLY (§7.8): the metadata
 *     block never reaches the editing surface;
 *   - an external prose rewrite FOLDS INTO LOCAL undo (§10.2 / §17-15):
 *     one undo steps back through the rewrite (the CodeMirror
 *     `input.external` semantics, preserved across the engine swap).
 */

function committed(): CommandResult {
  return { status: 'committed', commandId: 'c', revision: 1, affected: [], inverse: null }
}

class FakePort implements ProjectPort {
  notes = new Map<string, NoteRecord>()
  updates: Array<{ noteId: string; body: string }> = []

  async execute(commandType: string, payload: unknown): Promise<CommandResult> {
    if (commandType === 'UpdateNote') {
      const { noteId, body } = payload as { noteId: string; body: string }
      const note = this.notes.get(noteId)
      if (note) note.body = body
      this.updates.push({ noteId, body })
    }
    return committed()
  }

  async query<T>(name: string, args?: unknown): Promise<T> {
    if (name === 'getNote') {
      const { noteId } = args as { noteId: string }
      return (this.notes.get(noteId) ?? null) as T
    }
    return null as T
  }
}

describe('NoteEditorController canonicalize-on-load (§7.1)', () => {
  let host: HTMLElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  it('normalizes a non-canonical body once, then a second open is a no-op', async () => {
    const port = new FakePort()
    // `*` bullets are non-canonical; the frozen dialect uses `-`.
    port.notes.set('n1', {
      id: 'n1',
      title: 'N',
      titleKey: 'n',
      body: '* star one\n* star two',
      lifecycleState: 'active',
    })
    const controller = new NoteEditorController(port)
    controller.mount(host)

    await controller.open('n1')
    // Canonicalization armed the buffer as dirty; flush commits once.
    expect(controller.dirty).toBe(true)
    await controller.flushPending()
    expect(port.updates).toHaveLength(1)
    expect(port.updates[0]!.body).toBe('- star one\n- star two')
    expect(controller.dirty).toBe(false)

    // Re-opening the now-canonical body must not re-normalize.
    await controller.open('n1')
    expect(controller.dirty).toBe(false)
    await controller.flushPending()
    expect(port.updates).toHaveLength(1)

    controller.destroy()
  })

  it('opening a TRASHED note whose body would canonicalize commits nothing', async () => {
    const port = new FakePort()
    // A non-canonical body (`*` bullets) that WOULD arm an autosave if the
    // note were active — but a trashed note is view-only (§7.1 In Trash).
    port.notes.set('t1', {
      id: 't1',
      title: 'T',
      titleKey: 't',
      body: '* star one\n* star two',
      lifecycleState: 'trashed',
    })
    const controller = new NoteEditorController(port)
    controller.mount(host)

    await controller.open('t1')
    // No dirty, no timer, no UpdateNote — a read-only view must not
    // self-commit the canonicalization (AI-IMP-156).
    expect(controller.dirty).toBe(false)
    await controller.flushPending()
    expect(port.updates).toHaveLength(0)

    controller.destroy()
  })

  it('leaves an already-canonical body untouched on open', async () => {
    const port = new FakePort()
    port.notes.set('n2', {
      id: 'n2',
      title: 'N',
      titleKey: 'n',
      body: 'Plain prose with a [[Link]].',
      lifecycleState: 'active',
    })
    const controller = new NoteEditorController(port)
    controller.mount(host)
    await controller.open('n2')
    expect(controller.dirty).toBe(false)
    await controller.flushPending()
    expect(port.updates).toHaveLength(0)
    controller.destroy()
  })
})

describe('syncExternal prose reconcile + §7.8 block isolation', () => {
  it('reconciles prose and keeps the metadata block out of the editor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const block = renderMetadataBlock({
      placements: [{ depth: 0, label: 'Root', count: 1 }],
    })
    const port = new FakePort()
    port.notes.set('n', {
      id: 'n',
      title: 'N',
      titleKey: 'n',
      body: 'x [[Old]] y' + block,
      lifecycleState: 'active',
    })
    const controller = new NoteEditorController(port)
    controller.mount(host)
    await controller.open('n')
    // §7.8: the editing surface holds prose only — never the block.
    expect(controller.prose).toBe('x [[Old]] y')

    // An external rename re-key + a block refresh.
    const block2 = renderMetadataBlock({
      placements: [{ depth: 0, label: 'Root', count: 2 }],
    })
    port.notes.get('n')!.body = 'x [[NewName]] y' + block2
    await controller.syncExternal()
    // Prose reconciled; the regenerated block still never entered.
    expect(controller.prose).toBe('x [[NewName]] y')
    controller.destroy()
  })
})

describe('external prose rewrite folds into local undo (§10.2 / §17-15)', () => {
  it('one undo steps back through the rewrite, redo reapplies it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      extensions: baseNoteExtensions(),
      content: 'x [[Old]] y',
    })
    const before = editor.storage.markdown.getMarkdown()

    // The syncExternal seam: a history-entering whole-prose swap.
    const html = editor.storage.markdown.parser.parse('x [[NewName]] y') as string
    const template = document.createElement('div')
    template.innerHTML = html
    const doc = ProseMirrorDOMParser.fromSchema(editor.schema).parse(template)
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content))
    expect(editor.storage.markdown.getMarkdown()).toBe('x [[NewName]] y')

    editor.commands.undo()
    expect(editor.storage.markdown.getMarkdown()).toBe(before)
    editor.commands.redo()
    expect(editor.storage.markdown.getMarkdown()).toBe('x [[NewName]] y')

    editor.destroy()
  })
})
