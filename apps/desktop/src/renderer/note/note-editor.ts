import { type AnyExtension, Editor } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import type { CommandResult } from '@ew/commands'
import { stripMetadataBlock } from '@ew/domain'
import { baseNoteExtensions, noteEditorProps } from './editor-markdown'

/**
 * Note editor controller (RFC-0001 §7.1/§10.2, AI-IMP-044/146). The
 * TipTap/ProseMirror buffer is ephemeral state; an editing burst commits
 * exactly one UpdateNote — on the idle debounce, on blur, on note switch,
 * on app quit, and through flushPending(), the forced-flush seam every
 * body-reading command must await first (rename, trash, export). Undo
 * inside the editor is ProseMirror's local history and never enters the
 * structural stack (invariant 30): Mod-z is handled by the editor and
 * stops there (undo-keys.ts defers on `isContentEditable`).
 *
 * The engine swap from CodeMirror (AI-IMP-146) preserves this lifecycle
 * byte-for-byte; it also ships the one-time §7.1 canonicalize-on-load —
 * a note whose stored prose is not already in the frozen dialect
 * normalizes on first open and commits once through the ordinary save.
 */

export const NOTE_AUTOSAVE_IDLE_MS = 1500

export interface NoteRecord {
  id: string
  title: string
  titleKey: string
  body: string
  lifecycleState: 'active' | 'trashed'
}

/** Narrow project port so the controller is testable without IPC. */
export interface ProjectPort {
  execute(
    commandType: string,
    payload: unknown,
    opts?: { checkRevision?: boolean },
  ): Promise<CommandResult>
  query<T>(name: string, args?: unknown): Promise<T>
}

export interface NoteEditorHooks {
  onNoteChanged?: (note: NoteRecord | null) => void
  onDirtyChanged?: (dirty: boolean) => void
  onError?: (message: string) => void
  /** Extra editor extensions (wiki-link decoration, activation,
   * suggestions) layered on top of the base Markdown editor. */
  extensions?: AnyExtension[]
}

export class NoteEditorController {
  #project: ProjectPort
  #hooks: NoteEditorHooks
  #editor: Editor | null = null
  #note: NoteRecord | null = null
  #dirty = false
  #lastSavedBody = ''
  /** §7.8 (AI-IMP-119): the note's system metadata block is stripped
   * before the editor ever sees it — the editing surface holds prose
   * only. The raw tail is kept here verbatim and reattached on every
   * save, so an ordinary prose edit never duplicates or destroys the
   * block; the block regenerates only on a system touch (rename,
   * export), which arrives through syncExternal. Empty when the note
   * carries no block. */
  #metadataBlock = ''
  #timer: ReturnType<typeof setTimeout> | null = null
  /** In-flight commit; flushPending chains on it so a burst typed
   * during a save still lands (as the next single command). */
  #inFlight: Promise<void> | null = null

  constructor(project: ProjectPort, hooks: NoteEditorHooks = {}) {
    this.#project = project
    this.#hooks = hooks
  }

  get note(): NoteRecord | null {
    return this.#note
  }

  get dirty(): boolean {
    return this.#dirty
  }

  /** The editor's current prose (Markdown, no metadata block). Read-only
   * view of the buffer — used by tests and any prose-reading UI. */
  get prose(): string {
    return this.#editor?.storage.markdown.getMarkdown() ?? ''
  }

  mount(parent: HTMLElement): void {
    if (this.#editor) throw new Error('note editor already mounted')
    this.#editor = new Editor({
      element: parent,
      extensions: [...baseNoteExtensions(), ...(this.#hooks.extensions ?? [])],
      editorProps: noteEditorProps(),
      content: '',
      // Body updates that emit an update event are USER edits; programmatic
      // content loads pass emitUpdate:false and never reach here.
      onUpdate: ({ transaction }) => {
        if (transaction.docChanged) this.#onTyped()
      },
      onBlur: () => {
        void this.flushPending()
      },
    })
  }

  destroy(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    this.#editor?.destroy()
    this.#editor = null
  }

  /**
   * Move the LIVE editor DOM to a new host (§8.5 big editor: the buffer
   * moves to the overlay and back — one buffer per note, never a second
   * view against the same note). ProseMirror survives reparenting; state
   * — document, local history, dirty tracking, pending autosave — rides
   * along untouched, so §7.1 commit timing is unchanged.
   */
  reparent(parent: HTMLElement): void {
    const dom = this.#editor?.view.dom
    if (!dom || dom.parentElement === parent) return
    parent.appendChild(dom)
  }

  focus(): void {
    this.#editor?.commands.focus()
  }

  /** Load a note, committing any pending burst on the previous one
   * first (§10.2 note-switch flush). */
  async open(noteId: string): Promise<void> {
    await this.flushPending()
    const note = await this.#project.query<NoteRecord | null>('getNote', { noteId })
    if (!note) {
      this.#hooks.onError?.('note not found')
      return
    }
    this.#note = note
    this.#lastSavedBody = note.body
    // §7.8: the editor shows prose only; the system block is held aside
    // and reattached on save.
    const { prose, block } = stripMetadataBlock(note.body)
    this.#metadataBlock = block
    this.#setDirty(false)
    // A trashed note opens read-only (§7.1 In Trash view).
    this.#editor?.setEditable(note.lifecycleState !== 'trashed')
    // Fresh state = fresh local history: undo never crosses notes (the
    // analogue of the CodeMirror editor's per-note setState). The load is
    // not a user edit and not undoable.
    this.#loadProse(prose)
    // §7.1 canonicalize-on-load: if the stored prose is not already in
    // the frozen dialect, the buffer now holds its canonical form — a
    // real (once-per-note) edit that commits through the ordinary save.
    if (this.#editor && this.#editor.storage.markdown.getMarkdown() !== prose) {
      this.#arm()
    }
    this.#hooks.onNoteChanged?.(note)
  }

  async close(): Promise<void> {
    await this.flushPending()
    this.#note = null
    this.#metadataBlock = ''
    this.#setDirty(false)
    this.#editor?.setEditable(true)
    this.#loadProse('')
    this.#hooks.onNoteChanged?.(null)
  }

  /**
   * Rename the open note (§7.7, AI-IMP-047). Flushes the buffer first —
   * §10.2: pending buffers MUST commit before any command that rewrites
   * note bodies. Returns the raw result so the caller drives conflict UX.
   */
  async rename(title: string): Promise<CommandResult | null> {
    const note = this.#note
    if (!note) return null
    await this.flushPending()
    const result = await this.#project.execute('RenameNote', { noteId: note.id, title })
    if (result.status === 'committed' && this.#note?.id === note.id) {
      this.#note = { ...this.#note, title }
      this.#hooks.onNoteChanged?.(this.#note)
    }
    return result
  }

  /**
   * Reconcile the buffer with an external body change (§10.2). No-op
   * while dirty — the §10.2 flush ordering means body-rewriting commands
   * never race a dirty buffer; if one ever does, the flush commits our
   * text and the next project-changed event lands here clean.
   */
  async syncExternal(): Promise<void> {
    const note = this.#note
    if (!note || !this.#editor || this.#dirty || this.#inFlight) return
    const fresh = await this.#project.query<NoteRecord | null>('getNote', { noteId: note.id })
    if (!fresh || this.#note?.id !== note.id) return
    if (fresh.title !== note.title) {
      this.#note = { ...this.#note!, title: fresh.title }
      this.#hooks.onNoteChanged?.(this.#note)
    }
    if (this.#dirty) return
    // §7.8: reconcile PROSE only. A system touch (rename re-key, block
    // refresh) rewrites the durable body; strip its fresh block aside and
    // diff the prose so a silent block regeneration never lands in the
    // editing surface or in local undo.
    const { prose: freshProse, block: freshBlock } = stripMetadataBlock(fresh.body)
    this.#metadataBlock = freshBlock
    this.#lastSavedBody = fresh.body
    const current = this.#editor.storage.markdown.getMarkdown()
    if (freshProse === current) return
    // §10.2 / §17-15: a rename re-key arrives as a PROSE rewrite that
    // FOLDS INTO LOCAL undo (one undo steps back through the rewrite,
    // redo reapplies it) — the analogue of the CodeMirror editor's
    // `userEvent:'input.external'` history-entering change. Isolation is
    // structural, not local: this history-entering transaction never
    // crosses into the structural stack (invariant 30 — the autosave it
    // triggers is a checkRevision:false UpdateNote, outside undo), and the
    // §7.8 metadata block never reaches the editor at all (stripped
    // above), so a silent block regeneration is invisible here. Reparse
    // the fresh prose and swap the whole content in one transaction.
    const view = this.#editor.view
    const doc = this.#parseProse(freshProse)
    const tr = view.state.tr
    tr.replaceWith(0, view.state.doc.content.size, doc.content)
    view.dispatch(tr)
    // The dispatch marked us dirty via onUpdate; the buffer now EQUALS
    // the saved body, so settle immediately.
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.#setDirty(false)
  }

  /**
   * Commit the pending burst as one UpdateNote. Safe to call at any time;
   * resolves once the buffer is durable. This is the seam body-touching
   * commands (rename, quit) MUST await.
   */
  async flushPending(): Promise<void> {
    // Capture BEFORE any await: a closing panel destroys the editor on
    // unmount, and a flush that waits first reads a nulled buffer and
    // silently drops the burst (AI-IMP-085).
    if (!this.#dirty || !this.#note || !this.#editor) {
      while (this.#inFlight) await this.#inFlight
      return
    }
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    const note = this.#note
    // §7.8: the buffer is prose; reattach the system block verbatim so the
    // durable body keeps it. A prose edit never regenerates it.
    const body = this.#editor.storage.markdown.getMarkdown() + this.#metadataBlock
    while (this.#inFlight) await this.#inFlight
    if (body === this.#lastSavedBody) {
      this.#setDirty(false)
      return
    }
    // Prose authority lives in this buffer: an unrelated canvas command
    // must not conflict an autosave, so skip the optimistic revision check
    // for UpdateNote only.
    const commit = this.#project
      .execute('UpdateNote', { noteId: note.id, body }, { checkRevision: false })
      .then((result: CommandResult) => {
        if (result.status === 'committed') {
          this.#lastSavedBody = body
          // The buffer holds prose; the durable body is prose + block.
          if (
            this.#note?.id === note.id &&
            (this.#editor?.storage.markdown.getMarkdown() ?? '') + this.#metadataBlock === body
          ) {
            this.#setDirty(false)
          }
        } else {
          this.#hooks.onError?.(`autosave failed: ${describe(result)}`)
        }
      })
      .finally(() => {
        this.#inFlight = null
      })
    this.#inFlight = commit
    await commit
  }

  /** Parse a prose Markdown string to a ProseMirror doc (via the carrier's
   * markdown→HTML parser + the schema DOM parser). */
  #parseProse(prose: string): import('@tiptap/pm/model').Node {
    const editor = this.#editor!
    const html = editor.storage.markdown.parser.parse(prose) as string
    const template = document.createElement('div')
    template.innerHTML = html
    return ProseMirrorDOMParser.fromSchema(editor.schema).parse(template)
  }

  /** Load prose as a FRESH editor state: undo history starts empty, so
   * undo never crosses notes (the §7.1 per-note history boundary). Not a
   * transaction — dirty tracking is untouched and it is never undoable. */
  #loadProse(prose: string): void {
    const view = this.#editor?.view
    if (!view) return
    const doc = this.#parseProse(prose)
    view.updateState(EditorState.create({ doc, plugins: view.state.plugins }))
  }

  #onTyped(): void {
    if (!this.#note) return
    this.#arm()
  }

  /** Mark dirty and (re)start the idle-debounce commit. Shared by user
   * typing and canonicalize-on-load. */
  #arm(): void {
    this.#setDirty(true)
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.flushPending()
    }, NOTE_AUTOSAVE_IDLE_MS)
  }

  #setDirty(dirty: boolean): void {
    if (this.#dirty === dirty) return
    this.#dirty = dirty
    this.#hooks.onDirtyChanged?.(dirty)
  }
}

function describe(result: CommandResult): string {
  if (result.status === 'error') return result.message
  if (result.status === 'conflict') return 'project changed underneath'
  return result.status
}
