<!-- AI-IMP-309: honest doors for a title held only by one trashed board. -->
<script lang="ts">
  import { overlayPortal } from '../note/panels'

  let {
    requestedTitle,
    variantTitle,
    onrestore,
    onkeepboth,
    oncancel,
  }: {
    requestedTitle: string
    variantTitle: string
    onrestore: () => Promise<string | null>
    onkeepboth: () => Promise<string | null>
    oncancel: () => void
  } = $props()

  let busy = $state(false)
  let error = $state<string | null>(null)

  async function act(run: () => Promise<string | null>): Promise<void> {
    if (busy) return
    busy = true
    error = null
    try {
      error = await run()
    } finally {
      busy = false
    }
  }
</script>

<div class="scrim" role="presentation" use:overlayPortal>
  <div class="dialog" role="alertdialog" aria-modal="true" data-testid="board-title-conflict-dialog">
    <p>A board named “{requestedTitle}” is in the Trash.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" data-testid="board-conflict-restore" disabled={busy} onclick={() => void act(onrestore)}>
        Restore it
      </button>
      <button type="button" data-testid="board-conflict-keep-both" disabled={busy} onclick={() => void act(onkeepboth)}>
        Keep both — name it “{variantTitle}”
      </button>
      <button type="button" data-testid="board-conflict-cancel" disabled={busy} onclick={oncancel}>
        Cancel
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
    pointer-events: auto;
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

  .dialog .error {
    color: var(--ew-danger);
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
