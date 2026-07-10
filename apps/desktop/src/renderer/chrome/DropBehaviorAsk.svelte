<!--
  The multi-drop ask (RFC §4.9 rev 0.38, AI-IMP-129): a small anchored
  panel offering how a drop/paste of many images should land — kept
  separate, sorted in place, grouped in a frame, or grouped-and-sorted —
  with a remember-this-choice tick that persists to `drop_behavior`.
  Follows the §14.4 first-drop ask idiom (MirrorAsk): it lives in the
  chrome layer, the engagement clock fades it, and ignoring it keeps the
  drop separate. Import is deferred until a button is pressed, so every
  choice lands as one compound undo.
-->
<script lang="ts">
  import { pointAnchor } from './anchored-placement'
  import {
    placeAnchoredElement,
    type AnchoredElementOptions,
  } from './anchored-placement-dom'
  import {
    answerDropBehavior,
    dismissDropAsk,
    onDropAskChanged,
    type DropAskState,
    type DropChoice,
  } from './drop-behavior'

  let ask = $state<DropAskState | null>(null)
  let remember = $state(false)
  $effect(() =>
    onDropAskChanged((next) => {
      ask = next
      if (next === null) remember = false
    }),
  )

  const CHOICES: Array<{ choice: DropChoice; label: string; testid: string }> = [
    { choice: 'separate', label: 'Keep separate', testid: 'drop-ask-separate' },
    { choice: 'sort', label: 'Sort', testid: 'drop-ask-sort' },
    { choice: 'group', label: 'Group', testid: 'drop-ask-group' },
    { choice: 'group-and-sort', label: 'Group & sort', testid: 'drop-ask-group-sort' },
  ]

  function placement(at: DropAskState): AnchoredElementOptions {
    return {
      anchor: pointAnchor(at.x, at.y),
      host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      x: { preferred: 'after', fallback: 'before' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 16,
      margin: 12,
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (ask && event.key === 'Escape') {
      event.preventDefault()
      dismissDropAsk()
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if ask}
  <div
    class="drop-ask"
    use:placeAnchoredElement={() => placement(ask)}
    role="dialog"
    data-testid="drop-ask"
  >
    <span class="question">
      {#if ask.source === 'paste'}
        Paste {ask.count} images as separate images or an arranged frame?
      {:else}
        {ask.count} images dropped — how should they land?
      {/if}
    </span>
    <div class="buttons">
      {#each CHOICES as entry (entry.choice)}
        <button
          type="button"
          data-testid={entry.testid}
          onclick={() => answerDropBehavior(entry.choice, remember)}
        >
          {entry.label}
        </button>
      {/each}
    </div>
    <label class="remember">
      <input type="checkbox" data-testid="drop-ask-remember" bind:checked={remember} />
      Remember for this project
    </label>
  </div>
{/if}

<style>
  .drop-ask {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 20rem;
    padding: 0.6rem 0.75rem;
    background: var(--ew-surface-menu);
    color: var(--ew-text-soft);
    border: 1px solid var(--ew-border-panel);
    border-radius: 8px;
    font-size: 0.85rem;
    pointer-events: auto;
    z-index: 21;
  }

  .question {
    line-height: 1.3;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
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

  .remember {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: var(--ew-text-muted);
    cursor: pointer;
  }
</style>
