<!--
  The first-drop ask (RFC §14.4, AI-IMP-092): a two-button panel
  anchored to the first drop of a project whose 'mirror_drops'
  setting is still unset. The import has already run either way —
  only the mirror waits on the answer. Lives inside the chrome layer,
  so the shared engagement clock fades it; the store dissolves an
  unanswered ask at the next idle (it simply rides the next drop).
-->
<script lang="ts">
  import { pointAnchor } from './anchored-placement'
  import {
    placeAnchoredElement,
    type AnchoredElementOptions,
  } from './anchored-placement-dom'
  import {
    answerMirrorAsk,
    dismissMirrorAsk,
    onMirrorUiChanged,
    type MirrorAskState,
  } from './mirror'

  let ask = $state<MirrorAskState | null>(null)
  $effect(() => onMirrorUiChanged((ui) => (ask = ui.ask)))

  function placement(at: MirrorAskState): AnchoredElementOptions {
    return {
      anchor: pointAnchor(at.x, at.y),
      host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      x: { preferred: 'after', fallback: 'before' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 16,
      margin: 12,
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (ask && event.key === 'Escape') {
      event.preventDefault()
      dismissMirrorAsk()
    }
  }

  function onWindowPointerdown(event: PointerEvent): void {
    if (!ask || (event.target as Element | null)?.closest('.mirror-ask')) return
    dismissMirrorAsk()
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

{#if ask}
  <div
    class="mirror-ask"
    use:placeAnchoredElement={() => placement(ask)}
    role="dialog"
    data-testid="mirror-ask"
  >
    <span class="question">Also add drops to your library?</span>
    <div class="buttons">
      <button type="button" data-testid="mirror-ask-yes" onclick={() => answerMirrorAsk(true)}>
        Yes
      </button>
      <button type="button" data-testid="mirror-ask-no" onclick={() => answerMirrorAsk(false)}>
        No
      </button>
    </div>
  </div>
{/if}

<style>
  .mirror-ask {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 24rem;
    padding: 0.5rem 0.75rem;
    background: var(--ew-surface-menu);
    color: var(--ew-text-soft);
    border: 1px solid var(--ew-border-panel);
    border-radius: 8px;
    font-size: 0.85rem;
    pointer-events: auto;
    z-index: 21;
  }

  .buttons {
    display: flex;
    gap: 0.4rem;
  }

  button {
    padding: 0.2rem 0.7rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-control);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
  }

  button:hover {
    background: var(--ew-surface-control-hover);
  }
</style>
