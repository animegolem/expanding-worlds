<!--
  Persistent note editor pane (RFC-0001 §8.2, §10.2 — AI-IMP-044).
  CodeMirror 6 Markdown editor with the autosave gesture model: one
  UpdateNote per editing burst (idle debounce / blur / note switch /
  quit). Opens notes via the ew-open-note event; collapsible to a
  slim rail. Chrome-era layout (Baseline UI Vision) comes later.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { LinkResolution } from './note/link-resolution'
  import {
    NoteEditorController,
    NOTE_AUTOSAVE_IDLE_MS,
    type NoteRecord,
    type ProjectPort,
  } from './note/note-editor'
  import {
    onOpenNote,
    onOpenPhantom,
    onRenameNote,
    requestCreateAndPlace,
    requestOpenNote,
  } from './note/open-note'
  import { createNoteProjectPort } from './note/project-port'
  import { wikiLinkCompletion } from './note/suggestions'
  import { wikiLinkActivation, wikiLinkHighlighter } from './note/wiki-link-plugin'
  import TitleConflictDialog, { type TitleConflict } from './note/TitleConflictDialog.svelte'

  interface PhantomView {
    titleKey: string
    title: string
    referenceCount: number
    sources: Array<{
      noteId: string
      noteTitle: string
      references: Array<{ linkId: string; displayText: string }>
    }>
  }

  let editorHost = $state<HTMLElement | null>(null)
  let note = $state<NoteRecord | null>(null)
  let dirty = $state(false)
  let collapsed = $state(false)
  let error = $state<string | null>(null)

  // §7.2 phantom view: a projection only — nothing here persists
  // until a materialization action commits.
  let phantom = $state<PhantomView | null>(null)
  let phantomDraft = $state('')
  let returnNoteId = $state<string | null>(null)
  let paneProject: ProjectPort | null = null
  let paneController: NoteEditorController | null = null
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let materializing = false

  async function openPhantom(title: string): Promise<void> {
    if (!paneProject || !paneController) return
    collapsed = false
    returnNoteId = paneController.note?.id ?? returnNoteId
    await paneController.close()
    const view = await paneProject.query<PhantomView | null>('getPhantom', { titleKey: title })
    if (!view) {
      error = `no unresolved references to "${title}"`
      if (returnNoteId) requestOpenNote(returnNoteId)
      return
    }
    phantom = view
    phantomDraft = ''
    error = null
  }

  function dismissPhantom(): void {
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = null
    phantom = null
    phantomDraft = ''
    if (returnNoteId) requestOpenNote(returnNoteId)
    returnNoteId = null
  }

  /** Materialize via CreateNote (first-edit and Create Note paths,
   * §7.2 items 1–2); the sweep binds matching tokens project-wide
   * inside the same command. */
  async function materialize(body: string): Promise<void> {
    const project = paneProject
    const view = phantom
    if (!project || !view || materializing) return
    materializing = true
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = null
    try {
      const noteId = crypto.randomUUID()
      const result = await project.execute('CreateNote', {
        noteId,
        title: view.title,
        ...(body.length > 0 ? { body } : {}),
      })
      if (result.status === 'committed') {
        phantom = null
        phantomDraft = ''
        returnNoteId = null
        requestOpenNote(noteId)
      } else if (result.status === 'error') {
        // §7.7 creation flow: offer Use Existing; the phantom view
        // and its draft stay put (draft retained).
        const found = conflictFrom(result, 'create', view.title)
        if (found) conflict = found
        else error = result.message
      } else {
        error = 'the project changed underneath (retry)'
      }
    } finally {
      materializing = false
    }
  }

  function onDraftInput(): void {
    if (draftTimer !== null) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      draftTimer = null
      if (phantomDraft.trim().length > 0) void materialize(phantomDraft)
    }, NOTE_AUTOSAVE_IDLE_MS)
  }

  function onDraftBlur(): void {
    if (phantomDraft.trim().length > 0) void materialize(phantomDraft)
  }

  function createAndPlace(): void {
    const view = phantom
    if (!view) return
    phantom = null
    phantomDraft = ''
    returnNoteId = null
    requestCreateAndPlace(view.title)
  }

  // ---- §7.7 rename + title collisions (AI-IMP-047) ----

  let titleDraft = $state('')
  let conflict = $state<TitleConflict | null>(null)

  function conflictFrom(
    result: { code: string; details?: Record<string, unknown> },
    flow: TitleConflict['flow'],
    requestedTitle: string,
  ): TitleConflict | null {
    if (result.code !== 'NOTE_TITLE_CONFLICT') return null
    const details = result.details ?? {}
    return {
      flow,
      requestedTitle,
      existingNoteId: String(details['existingNoteId'] ?? ''),
      conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
    }
  }

  /** Title-field rename of the OPEN note; the draft survives every
   * failure path (§7.7 MUST). */
  async function commitTitle(): Promise<void> {
    const controller = paneController
    const current = controller?.note
    if (!controller || !current) return
    const title = titleDraft.trim()
    if (title.length === 0 || title === current.title) {
      titleDraft = current.title
      return
    }
    const result = await controller.rename(title)
    if (!result || result.status === 'committed') {
      error = null
      return
    }
    if (result.status === 'error') {
      const found = conflictFrom(result, 'rename', title)
      if (found) conflict = found
      else error = result.message
    } else {
      error = 'the project changed underneath (retry)'
    }
  }

  /** Rename requested from another surface (node menu): flush the
   * pane's buffer first, whatever note it holds (§10.2). */
  async function renameElsewhere(noteId: string, title: string): Promise<void> {
    const project = paneProject
    if (!project) return
    if (paneController?.note?.id === noteId) {
      titleDraft = title
      await commitTitle()
      return
    }
    await paneController?.flushPending()
    const result = await project.execute('RenameNote', { noteId, title })
    if (result.status === 'error') {
      const found = conflictFrom(result, 'rename', title)
      if (found) conflict = found
      else error = result.message
    }
  }

  async function restoreExisting(noteId: string): Promise<void> {
    const project = paneProject
    if (!project) return
    const result = await project.execute('RestoreRecord', { kind: 'note', id: noteId })
    if (result.status === 'error') error = result.message
    conflict = null
  }

  onMount(() => {
    let controller: NoteEditorController | null = null
    let disposers: Array<() => void> = []
    let cancelled = false

    void (async () => {
      const { port, dispose } = await createNoteProjectPort()
      if (cancelled) {
        dispose()
        return
      }
      const resolution = new LinkResolution(port)
      controller = new NoteEditorController(port, {
        onNoteChanged: (current) => {
          note = current
          titleDraft = current?.title ?? ''
          error = null
          // New note = new broken-record set for decoration state.
          void resolution.refresh(current?.id ?? null)
        },
        onDirtyChanged: (value) => (dirty = value),
        onError: (message) => (error = message),
        extensions: [
          wikiLinkHighlighter(resolution),
          wikiLinkCompletion(port),
          wikiLinkActivation((link) => {
            if (link.state === 'unresolved') void openPhantom(link.title)
            // Bound/trashed/broken activation lands in AI-IMP-048.
          }),
        ],
      })
      paneProject = port
      paneController = controller
      if (editorHost) controller.mount(editorHost)

      // Project-changed events deliver re-resolution sweep effects
      // (materialization, rename, restore) to the open editor and the
      // phantom view. Small debounce coalesces command bursts.
      let refreshTimer: ReturnType<typeof setTimeout> | null = null
      const disposeRefresh = window.ew.project.onChanged(() => {
        if (refreshTimer !== null) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = null
          void resolution.refresh(controller?.note?.id ?? null)
          // §10.2: rename rewrites fold into the open buffer as a
          // minimal external change inside local undo.
          void controller?.syncExternal()
          const view = phantom
          if (view && paneProject) {
            void paneProject
              .query<PhantomView | null>('getPhantom', { titleKey: view.titleKey })
              .then((fresh) => {
                if (phantom?.titleKey === view.titleKey) phantom = fresh
              })
          }
        }, 100)
      })
      void resolution.refresh(null)

      disposers = [
        dispose,
        disposeRefresh,
        () => {
          if (refreshTimer !== null) clearTimeout(refreshTimer)
          if (draftTimer !== null) clearTimeout(draftTimer)
        },
        onOpenNote((noteId) => {
          collapsed = false
          phantom = null
          void controller?.open(noteId)
        }),
        onOpenPhantom((title) => void openPhantom(title)),
        onRenameNote((detail) => void renameElsewhere(detail.noteId, detail.title)),
        // §10.2 quit flush: main holds the window open until this
        // resolves, so an edit inside its debounce window survives.
        window.ew.app.onFlushRequest(() => controller?.flushPending() ?? Promise.resolve()),
      ]
    })()

    return () => {
      cancelled = true
      for (const dispose of disposers) dispose()
      controller?.destroy()
    }
  })
</script>

<aside class="note-pane" class:collapsed data-testid="note-pane">
  <header>
    <button
      type="button"
      class="collapse"
      data-testid="note-pane-toggle"
      title={collapsed ? 'Expand notes' : 'Collapse notes'}
      onclick={() => (collapsed = !collapsed)}
    >
      {collapsed ? '»' : '«'}
    </button>
    {#if !collapsed}
      {#if note && !phantom}
        <!-- §7.7 rename surface: commit on Enter/blur, draft kept on
             every failure path. -->
        <input
          class="title-input"
          data-testid="note-title-input"
          bind:value={titleDraft}
          onblur={() => void commitTitle()}
          onkeydown={(event) => {
            if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
            if (event.key === 'Escape') titleDraft = note?.title ?? ''
          }}
        />
        {#if dirty}<span class="dirty" data-testid="note-pane-dirty" title="Unsaved burst">●</span>{/if}
        <span hidden data-testid="note-pane-title">{note.title}</span>
      {:else}
        <h2 data-testid="note-pane-title">
          {phantom ? phantom.title : 'Notes'}
          {#if dirty}<span class="dirty" data-testid="note-pane-dirty" title="Unsaved burst">●</span>{/if}
        </h2>
      {/if}
    {/if}
  </header>
  {#if error && !collapsed}
    <p class="error" data-testid="note-pane-error">{error}</p>
  {/if}
  <div
    class="editor"
    data-testid="note-editor"
    hidden={collapsed || note === null}
    bind:this={editorHost}
  ></div>
  {#if !collapsed && phantom}
    <section class="phantom" data-testid="phantom-view">
      <p class="phantom-summary">
        Phantom note — {phantom.referenceCount}
        reference{phantom.referenceCount === 1 ? '' : 's'}, nothing saved yet.
      </p>
      <!-- §7.2: equal peer actions, neither presented as primary. -->
      <div class="phantom-actions">
        <button type="button" data-testid="phantom-create-note" onclick={() => void materialize(phantomDraft)}>
          Create Note
        </button>
        <button type="button" data-testid="phantom-create-and-place" onclick={createAndPlace}>
          Create and Place on Current Canvas
        </button>
      </div>
      <textarea
        class="phantom-draft"
        data-testid="phantom-draft"
        placeholder="Start writing to create this note…"
        bind:value={phantomDraft}
        oninput={onDraftInput}
        onblur={onDraftBlur}
      ></textarea>
      <h3>References</h3>
      <ul class="phantom-sources" data-testid="phantom-sources">
        {#each phantom.sources as source (source.noteId)}
          <li>
            <button
              type="button"
              class="phantom-source"
              onclick={() => requestOpenNote(source.noteId)}
            >
              {source.noteTitle}
              <span class="ref-count">{source.references.length}</span>
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="phantom-dismiss" data-testid="phantom-dismiss" onclick={dismissPhantom}>
        Dismiss
      </button>
    </section>
  {:else if !collapsed && note === null}
    <p class="empty" data-testid="note-pane-empty">
      Double-click a placement with a note, or use the node menu.
    </p>
  {/if}
  {#if conflict}
    <TitleConflictDialog
      {conflict}
      onOpenExisting={(noteId) => {
        conflict = null
        requestOpenNote(noteId)
      }}
      onUseExisting={(noteId) => {
        conflict = null
        phantom = null
        phantomDraft = ''
        requestOpenNote(noteId)
      }}
      onRestoreExisting={(noteId) => void restoreExisting(noteId)}
      onChooseDifferent={() => (conflict = null)}
    />
  {/if}
</aside>

<style>
  .note-pane {
    position: relative;
    grid-area: note-pane;
    display: flex;
    flex-direction: column;
    width: 300px;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid #ddd;
    background: #fafafa;
  }

  .note-pane.collapsed {
    width: 28px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.5rem 0.25rem;
  }

  .collapse {
    flex: none;
    padding: 0 0.35rem;
    border: none;
    background: transparent;
    font: inherit;
    color: #888;
    cursor: pointer;
  }

  h2 {
    margin: 0;
    overflow: hidden;
    font-size: 0.85rem;
    font-weight: 600;
    color: #444;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-input {
    flex: 1;
    min-width: 0;
    padding: 0.1rem 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: #444;
  }

  .title-input:hover,
  .title-input:focus {
    border-color: #ccc;
    background: #fff;
    outline: none;
  }

  .dirty {
    margin-left: 0.3rem;
    color: #c90;
    font-size: 0.6rem;
    vertical-align: middle;
  }

  .editor {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-size: 0.85rem;
  }

  .editor :global(.cm-editor) {
    height: 100%;
    background: #fff;
  }

  .editor :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .phantom {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    padding: 0 0.75rem 0.75rem;
    overflow: auto;
  }

  .phantom-summary {
    margin: 0;
    color: #7c4dbe;
    font-size: 0.8rem;
  }

  .phantom-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .phantom-actions button,
  .phantom-dismiss {
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .phantom-draft {
    min-height: 6rem;
    padding: 0.4rem;
    border: 1px solid #ddd;
    border-radius: 3px;
    font: inherit;
    font-size: 0.85rem;
    resize: vertical;
  }

  .phantom h3 {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .phantom-sources {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .phantom-source {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }

  .phantom-source:hover {
    background: #eee;
  }

  .ref-count {
    color: #888;
  }

  .empty,
  .error {
    margin: 0.5rem 0.75rem;
    color: #888;
    font-size: 0.8rem;
  }

  .error {
    color: #b3403a;
  }
</style>
