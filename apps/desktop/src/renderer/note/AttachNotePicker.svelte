<!--
  Attach-note picker (RFC-0001 §6.6, AI-IMP-049): search active
  titles via suggestTitles or create a new note from the typed title
  and attach it. Title collisions on the create path route through
  the §7.7 dialog — Use Existing attaches the conflicting note.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CanvasHostHandle } from '../canvas/host'
  import TitleConflictDialog, { type TitleConflict } from './TitleConflictDialog.svelte'

  let {
    handle,
    nodeId,
    onclose,
  }: { handle: CanvasHostHandle; nodeId: string; onclose: () => void } = $props()

  interface Suggestion {
    title: string
    noteId: string | null
    phantom: boolean
    inTrash: boolean
  }

  let query = $state('')
  let results = $state<Suggestion[]>([])
  let error = $state<string | null>(null)
  let conflict = $state<TitleConflict | null>(null)

  async function search(): Promise<void> {
    const response = await window.ew.project.query('suggestTitles', { query })
    if (!response.ok) return
    // Attach targets are existing ACTIVE notes only.
    results = (response.result as Suggestion[]).filter((s) => !s.phantom && !s.inTrash)
  }
  void search()

  async function attach(noteId_: string): Promise<void> {
    const result = await handle.gateway.execute('AttachNoteToNode', { nodeId, noteId: noteId_ })
    if (result.status === 'committed') onclose()
    else error = result.status === 'error' ? result.message : 'the project changed underneath'
  }

  async function createAndAttach(): Promise<void> {
    const title = query.trim()
    if (title.length === 0) return
    // AI-IMP-086: one act, ONE command — a failed attach can no
    // longer strand a loose note reserving the title.
    const created = await handle.gateway.execute('CreateNoteAndAttach', {
      nodeId,
      noteId: uuidv7(),
      title,
    })
    if (created.status === 'committed') {
      onclose()
      return
    }
    if (created.status === 'error' && created.code === 'NOTE_TITLE_CONFLICT') {
      const details = created.details ?? {}
      conflict = {
        flow: 'create',
        requestedTitle: title,
        existingNoteId: String(details['existingNoteId'] ?? ''),
        conflictingLifecycle: details['conflictingLifecycle'] === 'trashed' ? 'trashed' : 'active',
      }
      return
    }
    error = created.status === 'error' ? created.message : 'the project changed underneath'
  }
</script>

<div class="scrim" role="presentation">
  <div class="picker" role="dialog" aria-modal="true" data-testid="attach-note-picker">
    <input
      type="text"
      placeholder="Search notes or type a new title…"
      data-testid="attach-picker-query"
      bind:value={query}
      oninput={() => void search()}
    />
    {#if error}
      <p class="error" data-testid="attach-picker-error">{error}</p>
    {/if}
    <ul data-testid="attach-picker-results">
      {#each results as result (result.noteId)}
        <li>
          <button type="button" onclick={() => void attach(result.noteId!)}>
            {result.title}
          </button>
        </li>
      {/each}
    </ul>
    {#if query.trim().length > 0}
      <button type="button" class="create" data-testid="attach-picker-create" onclick={() => void createAndAttach()}>
        Create “{query.trim()}” and attach
      </button>
    {/if}
    <button type="button" class="cancel" data-testid="attach-picker-cancel" onclick={onclose}>
      Cancel
    </button>
  </div>
  {#if conflict}
    <TitleConflictDialog
      {conflict}
      onOpenExisting={() => (conflict = null)}
      onUseExisting={(noteId_) => {
        conflict = null
        void attach(noteId_)
      }}
      onRestoreExisting={(noteId_) => {
        conflict = null
        void (async () => {
          const restored = await handle.gateway.execute('RestoreRecord', {
            kind: 'note',
            id: noteId_,
          })
          if (restored.status === 'committed') await attach(noteId_)
        })()
      }}
      onChooseDifferent={() => (conflict = null)}
    />
  {/if}
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 35;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15%;
    background: var(--ew-dialog-scrim);
  }

  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 280px;
    max-height: 60%;
    padding: 0.6rem;
    background: var(--ew-surface-modal);
    border: 1px solid var(--ew-border-control);
    border-radius: 6px;
    color: var(--ew-text-dialog);
    font-size: 0.85rem;
  }

  input {
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--ew-border-control);
    border-radius: 3px;
    background: var(--ew-surface-solid);
    color: var(--ew-text-dialog);
    font: inherit;
  }

  ul {
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  ul button {
    display: block;
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: none;
    background: transparent;
    color: var(--ew-text-dialog);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  ul button:hover {
    background: var(--ew-surface-control-hover);
  }

  .create,
  .cancel {
    padding: 0.3rem 0.5rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .error {
    margin: 0;
    color: var(--ew-danger-muted);
    font-size: 0.78rem;
  }
</style>
