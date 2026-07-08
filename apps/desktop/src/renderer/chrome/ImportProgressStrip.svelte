<!--
  Import progress strip (RFC §14.4, AI-IMP-081): a large drop runs as
  an interruptible strip — live counts, thin bar, ✕ — never a modal.
  It exists exactly as long as a batch runs (the §8.6 existence rule)
  and collapses to one summary toast. Mounted OUTSIDE the fading
  chrome root: a running batch is fade-EXEMPT by construction, so a
  parked cursor never hides the one surface reporting ongoing work.
-->
<script lang="ts">
  import {
    onImportProgressChanged,
    requestImportCancel,
    type ImportProgressState,
  } from './import-progress'
  import { tooltip } from './tooltip'

  let progress = $state<ImportProgressState | null>(null)
  $effect(() => onImportProgressChanged((next) => (progress = next)))
</script>

{#if progress}
  <div
    class="import-progress"
    role="status"
    data-testid="import-progress-strip"
    data-total={progress.total}
    data-done={progress.done}
    data-deduped={progress.deduped}
    data-failed={progress.failed}
  >
    <span class="counts" data-testid="import-progress-counts">
      {progress.cancelRequested ? 'Cancelling' : 'Importing'}
      {progress.done} / {progress.total}
      {#if progress.deduped > 0}&nbsp;· {progress.deduped} deduplicated{/if}
      {#if progress.failed > 0}&nbsp;· {progress.failed} failed{/if}
    </span>
    <div class="bar">
      <div
        class="fill"
        style={`width: ${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%`}
      ></div>
    </div>
    <button
      type="button"
      data-testid="import-progress-cancel"
      aria-label="Cancel remaining imports"
      disabled={progress.cancelRequested}
      onclick={requestImportCancel}
      use:tooltip={{ name: 'Cancel remaining imports' }}
    >
      ✕
    </button>
  </div>
{/if}

<style>
  .import-progress {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    /* Same tier as the chrome layer (z 10), which itself sits above
       the takeover cover (z 9) — imports keep reporting everywhere. */
    /* rung: chrome (Z.chrome band — a fade-exempt sibling of the
       chrome layer, same rank; ported with the AI-IMP-161 inversion
       fix so a panel can't cover the cancel button). */
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    max-width: 24rem;
    padding: 0.45rem 0.65rem;
    background: var(--ew-surface);
    color: var(--ew-text-soft);
    border: 1px solid var(--ew-border-panel);
    border-radius: 7px;
    font-size: 0.85rem;
    pointer-events: auto;
  }

  .counts {
    white-space: nowrap;
  }

  .bar {
    flex: 1 1 5rem;
    min-width: 5rem;
    height: 3px;
    background: var(--ew-control-tint);
    border-radius: 2px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--ew-accent);
    border-radius: 2px;
  }

  .import-progress button {
    flex: none;
    padding: 0.1rem 0.45rem;
    font: inherit;
    color: inherit;
    background: var(--ew-control-tint);
    border: 1px solid var(--ew-border-panel);
    border-radius: 5px;
    cursor: pointer;
  }

  .import-progress button:disabled {
    cursor: default;
    color: var(--ew-text-subtle);
  }
</style>
