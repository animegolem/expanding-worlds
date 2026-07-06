import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import type { CommandResult } from '@ew/commands'

/**
 * Note editor controller (RFC-0001 §10.2, AI-IMP-044). The CodeMirror
 * buffer is ephemeral state; an editing burst commits exactly one
 * UpdateNote — on the idle debounce, on blur, on note switch, on app
 * quit, and through flushPending(), the forced-flush seam every
 * body-reading command must await first (rename, trash, export).
 * Undo inside the editor is CodeMirror's local history and never
 * enters the structural stack (invariant 30): Mod-z is handled by
 * the editor keymap and stops there.
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
  /** Extra editor extensions (wiki-link decoration, suggestions). */
  extensions?: Extension[]
}

export class NoteEditorController {
  #project: ProjectPort
  #hooks: NoteEditorHooks
  #view: EditorView | null = null
  #note: NoteRecord | null = null
  #dirty = false
  #lastSavedBody = ''
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

  mount(parent: HTMLElement): void {
    if (this.#view) throw new Error('note editor already mounted')
    this.#view = new EditorView({
      parent,
      state: this.#stateFor(''),
    })
  }

  destroy(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    this.#view?.destroy()
    this.#view = null
  }

  /**
   * Move the LIVE editor DOM to a new host (§8.5 big editor: the
   * buffer moves to the overlay and back — one buffer per note,
   * never a second view against the same note). CodeMirror survives
   * reparenting; it only needs a re-measure afterwards. State —
   * document, local history, dirty tracking, pending autosave —
   * rides along untouched, so §7.1 commit timing is unchanged.
   */
  reparent(parent: HTMLElement): void {
    const view = this.#view
    if (!view || view.dom.parentElement === parent) return
    parent.appendChild(view.dom)
    view.requestMeasure()
  }

  focus(): void {
    this.#view?.focus()
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
    this.#setDirty(false)
    // Fresh state = fresh local history: undo never crosses notes. A
    // trashed note opens read-only (§7.1 In Trash view).
    this.#view?.setState(this.#stateFor(note.body, note.lifecycleState === 'trashed'))
    this.#hooks.onNoteChanged?.(note)
  }

  async close(): Promise<void> {
    await this.flushPending()
    this.#note = null
    this.#setDirty(false)
    this.#view?.setState(this.#stateFor(''))
    this.#hooks.onNoteChanged?.(null)
  }

  /**
   * Rename the open note (§7.7, AI-IMP-047). Flushes the buffer
   * first — §10.2: pending buffers MUST commit before any command
   * that rewrites note bodies. Returns the raw result so the caller
   * drives conflict UX.
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
   * Reconcile the buffer with an external body change (§10.2: a
   * rename rewrite arrives as a minimal change folded into local
   * undo, never a wholesale document swap). No-op while dirty — the
   * §10.2 flush ordering means body-rewriting commands never race a
   * dirty buffer; if one ever does, the flush commits our text and
   * the next project-changed event lands here clean.
   */
  async syncExternal(): Promise<void> {
    const note = this.#note
    if (!note || !this.#view || this.#dirty || this.#inFlight) return
    const fresh = await this.#project.query<NoteRecord | null>('getNote', { noteId: note.id })
    if (!fresh || this.#note?.id !== note.id) return
    if (fresh.title !== note.title) {
      this.#note = { ...this.#note!, title: fresh.title }
      this.#hooks.onNoteChanged?.(this.#note)
    }
    if (this.#dirty) return
    const current = this.#view.state.doc.toString()
    if (fresh.body === current) {
      this.#lastSavedBody = fresh.body
      return
    }
    const change = minimalChange(current, fresh.body)
    this.#lastSavedBody = fresh.body
    // A user-event-tagged transaction enters CM history like typing,
    // so undo can travel back through the rewrite.
    this.#view.dispatch({ changes: change, userEvent: 'input.external' })
    // The dispatch marked us dirty via the update listener; the
    // buffer now EQUALS the saved body, so settle immediately.
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.#setDirty(false)
  }

  /**
   * Commit the pending burst as one UpdateNote. Safe to call at any
   * time; resolves once the buffer is durable. This is the seam
   * body-touching commands (rename, quit) MUST await.
   */
  async flushPending(): Promise<void> {
    // Capture BEFORE any await: a closing panel destroys the view on
    // unmount, and a flush that waits first reads a nulled buffer
    // and silently drops the burst (AI-IMP-085).
    if (!this.#dirty || !this.#note || !this.#view) {
      while (this.#inFlight) await this.#inFlight
      return
    }
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    const note = this.#note
    const body = this.#view.state.doc.toString()
    while (this.#inFlight) await this.#inFlight
    if (body === this.#lastSavedBody) {
      this.#setDirty(false)
      return
    }
    // Prose authority lives in this buffer: an unrelated canvas
    // command must not conflict an autosave, so skip the optimistic
    // revision check for UpdateNote only.
    const commit = this.#project
      .execute('UpdateNote', { noteId: note.id, body }, { checkRevision: false })
      .then((result: CommandResult) => {
        if (result.status === 'committed') {
          this.#lastSavedBody = body
          if (this.#note?.id === note.id && this.#view?.state.doc.toString() === body) {
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

  #stateFor(body: string, readOnly = false): EditorState {
    return EditorState.create({
      doc: body,
      extensions: [
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        placeholder('Write…'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.#onTyped()
        }),
        EditorView.domEventHandlers({
          blur: () => {
            void this.flushPending()
          },
        }),
        ...(this.#hooks.extensions ?? []),
      ],
    })
  }

  #onTyped(): void {
    if (!this.#note) return
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

/** Single-span diff: common prefix/suffix trimmed. Token rewrites
 * (rename) are localized, so this folds them as one small change. */
function minimalChange(
  oldText: string,
  newText: string,
): { from: number; to: number; insert: string } {
  let start = 0
  const maxStart = Math.min(oldText.length, newText.length)
  while (start < maxStart && oldText[start] === newText[start]) start++
  let endOld = oldText.length
  let endNew = newText.length
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--
    endNew--
  }
  return { from: start, to: endOld, insert: newText.slice(start, endNew) }
}

function describe(result: CommandResult): string {
  if (result.status === 'error') return result.message
  if (result.status === 'conflict') return 'project changed underneath'
  return result.status
}
