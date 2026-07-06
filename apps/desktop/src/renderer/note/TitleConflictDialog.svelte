<!--
  NOTE_TITLE_CONFLICT dialog (RFC-0001 §7.7, AI-IMP-047). The user's
  draft is always retained — no action here redirects silently.
  Rename flows offer Open Conflicting Note; creation flows offer Use
  Existing Note; a trashed conflict additionally offers Restore
  Existing Note.
-->
<script module lang="ts">
  export interface TitleConflict {
    flow: 'rename' | 'create'
    requestedTitle: string
    existingNoteId: string
    conflictingLifecycle: 'active' | 'trashed'
  }
</script>

<script lang="ts">
  let {
    conflict,
    onOpenExisting,
    onUseExisting,
    onRestoreExisting,
    onChooseDifferent,
  }: {
    conflict: TitleConflict
    onOpenExisting: (noteId: string) => void
    onUseExisting: (noteId: string) => void
    onRestoreExisting: (noteId: string) => void
    onChooseDifferent: () => void
  } = $props()
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="alertdialog" aria-modal="true" data-testid="title-conflict-dialog">
    <p>
      A note titled “{conflict.requestedTitle}” already exists{conflict.conflictingLifecycle ===
      'trashed'
        ? ' in the Trash'
        : ''}.
    </p>
    <div class="actions">
      {#if conflict.flow === 'create'}
        <button
          type="button"
          data-testid="conflict-use-existing"
          onclick={() => onUseExisting(conflict.existingNoteId)}
        >
          Use Existing Note
        </button>
      {:else}
        <button
          type="button"
          data-testid="conflict-open-existing"
          onclick={() => onOpenExisting(conflict.existingNoteId)}
        >
          Open Conflicting Note
        </button>
      {/if}
      {#if conflict.conflictingLifecycle === 'trashed'}
        <button
          type="button"
          data-testid="conflict-restore-existing"
          onclick={() => onRestoreExisting(conflict.existingNoteId)}
        >
          Restore Existing Note
        </button>
      {/if}
      <button type="button" data-testid="conflict-choose-different" onclick={onChooseDifferent}>
        Choose Different Title
      </button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ew-dialog-scrim);
  }

  .dialog {
    max-width: 90%;
    padding: 0.75rem 1rem;
    background: var(--ew-paper-page);
    border: 1px solid var(--ew-paper-border-focus);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--ew-dialog-scrim);
  }

  .dialog p {
    margin: 0 0 0.6rem;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .actions button {
    padding: 0.3rem 0.6rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
</style>
