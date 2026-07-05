<!--
  Persistent note editor pane (RFC-0001 §8.2, §10.2 — AI-IMP-044).
  CodeMirror 6 Markdown editor with the autosave gesture model: one
  UpdateNote per editing burst (idle debounce / blur / note switch /
  quit). Opens notes via the ew-open-note event; collapsible to a
  slim rail. Chrome-era layout (Baseline UI Vision) comes later.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { NoteEditorController, type NoteRecord } from './note/note-editor'
  import { onOpenNote } from './note/open-note'
  import { createNoteProjectPort } from './note/project-port'

  let editorHost = $state<HTMLElement | null>(null)
  let note = $state<NoteRecord | null>(null)
  let dirty = $state(false)
  let collapsed = $state(false)
  let error = $state<string | null>(null)

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
      controller = new NoteEditorController(port, {
        onNoteChanged: (current) => {
          note = current
          error = null
        },
        onDirtyChanged: (value) => (dirty = value),
        onError: (message) => (error = message),
      })
      if (editorHost) controller.mount(editorHost)

      disposers = [
        dispose,
        onOpenNote((noteId) => {
          collapsed = false
          void controller?.open(noteId)
        }),
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
      <h2 data-testid="note-pane-title">
        {note ? note.title : 'Notes'}
        {#if dirty}<span class="dirty" data-testid="note-pane-dirty" title="Unsaved burst">●</span>{/if}
      </h2>
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
  {#if !collapsed && note === null}
    <p class="empty" data-testid="note-pane-empty">
      Double-click a placement with a note, or use the node menu.
    </p>
  {/if}
</aside>

<style>
  .note-pane {
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
