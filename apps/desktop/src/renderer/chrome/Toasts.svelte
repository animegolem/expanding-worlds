<!--
  Transient toast stack (RFC §8.6, AI-IMP-066): transitions surface
  here — enter and resolve — as auto-dissolving chips along the bottom
  edge. Lives inside the chrome layer so the shared engagement clock
  governs its fade; ongoing states belong to the perch, never to a
  toast alone (§11.4).
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import { attachBoardNotices, dismissToast, onToastsChanged, type ToastEntry } from './status'

  const { handle }: { handle: CanvasHostHandle } = $props()

  let toasts = $state<readonly ToastEntry[]>([])
  $effect(() => onToastsChanged((next) => (toasts = next)))
  // §9.2 Keep in Project: restore the auto-trashed bare nodes.
  $effect(() =>
    attachBoardNotices((nodeIds) => {
      void (async () => {
        for (const id of nodeIds) {
          await handle.gateway.execute('RestoreRecord', { kind: 'node', id })
        }
      })()
    }),
  )

  function act(entry: ToastEntry, run: () => void): void {
    dismissToast(entry.id)
    run()
  }
</script>

{#if toasts.length > 0}
  <div class="toasts" data-testid="toasts">
    {#each toasts as entry (entry.id)}
      <div
        class={`toast ${entry.kind}`}
        role={entry.kind === 'error' ? 'alert' : 'status'}
        data-testid={entry.surface ?? 'toast'}
      >
        <span class="message">{entry.message}</span>
        {#each entry.actions as action (action.testid)}
          <button type="button" data-testid={action.testid} onclick={() => act(entry, action.run)}>
            {action.label}
          </button>
        {/each}
        <button
          type="button"
          data-testid={entry.dismissTestid ?? 'toast-dismiss'}
          onclick={() => dismissToast(entry.id)}
        >
          Dismiss
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toasts {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    pointer-events: auto;
    z-index: 20;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 26rem;
    padding: 0.5rem 0.75rem;
    background: rgba(23, 25, 29, 0.92);
    color: #c8cfd8;
    border: 1px solid #3a4048;
    border-radius: 7px;
    font-size: 0.85rem;
  }

  .toast.error {
    background: rgba(59, 31, 31, 0.95);
    color: #f3c9c9;
    border-color: #7c3a3a;
  }

  .toast.success {
    border-color: #2e5c3a;
  }

  .toast button {
    flex: none;
    padding: 0.15rem 0.6rem;
    font: inherit;
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid #3a4048;
    border-radius: 5px;
    cursor: pointer;
  }
</style>
