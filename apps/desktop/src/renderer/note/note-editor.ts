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
    // Fresh state = fresh local history: undo never crosses notes.
    this.#view?.setState(this.#stateFor(note.body))
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
   * Commit the pending burst as one UpdateNote. Safe to call at any
   * time; resolves once the buffer is durable. This is the seam
   * body-touching commands (rename, quit) MUST await.
   */
  async flushPending(): Promise<void> {
    while (this.#inFlight) await this.#inFlight
    if (!this.#dirty || !this.#note || !this.#view) return
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    const note = this.#note
    const body = this.#view.state.doc.toString()
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

  #stateFor(body: string): EditorState {
    return EditorState.create({
      doc: body,
      extensions: [
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

function describe(result: CommandResult): string {
  if (result.status === 'error') return result.message
  if (result.status === 'conflict') return 'project changed underneath'
  return result.status
}
