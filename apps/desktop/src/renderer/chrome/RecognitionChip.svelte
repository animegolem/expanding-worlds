<!--
  Recognition chips (RFC §14.4, AI-IMP-092): "the library already
  holds these bytes" — a transient chip beside the fresh node that
  MAY offer the library's tags. Obeys the engagement fade: the chip
  lives inside the chrome layer, and the mirror store dissolves all
  chips at the next idle — ignoring one IS the dismissal gesture, no
  dismissal debt. Bulk drops arrive pre-collapsed as one summary chip
  (kind 'summary', informational, same fade).
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import { pointAnchor } from './anchored-placement'
  import {
    placeAnchoredElement,
    type AnchoredElementOptions,
  } from './anchored-placement-dom'
  import {
    applyMirrorChipTags,
    dismissAllMirrorChips,
    dismissMirrorChip,
    onMirrorUiChanged,
    type MirrorChip,
  } from './mirror'

  const { handle }: { handle: CanvasHostHandle } = $props()

  let chips = $state<readonly MirrorChip[]>([])
  $effect(() => onMirrorUiChanged((ui) => (chips = ui.chips)))

  function placement(
    chip: Extract<MirrorChip, { kind: 'recognition' }>,
  ): AnchoredElementOptions {
    return {
      anchor: pointAnchor(chip.x, chip.y),
      host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      x: { preferred: 'after', fallback: 'before' },
      y: { preferred: 'after', fallback: 'before' },
      gap: 16,
      margin: 12,
    }
  }

  function apply(id: number): void {
    void applyMirrorChipTags(id, (commandType, payload) =>
      handle.gateway.execute(commandType, payload),
    )
  }

  function onWindowPointerdown(event: PointerEvent): void {
    if (chips.length === 0 || (event.target as Element | null)?.closest('.chip')) return
    dismissAllMirrorChips()
  }
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

{#each chips as chip (chip.id)}
  {#if chip.kind === 'recognition'}
    <div
      class="chip anchored"
      use:placeAnchoredElement={() => placement(chip)}
      role="status"
      data-testid="mirror-chip"
    >
      <span class="message">
        {chip.tagNames.length > 0
          ? 'In your library — apply its tags?'
          : 'Already in your library'}
      </span>
      {#if chip.tagNames.length > 0}
        <button type="button" data-testid="mirror-chip-apply" onclick={() => apply(chip.id)}>
          Apply
        </button>
        <button
          type="button"
          data-testid="mirror-chip-ignore"
          onclick={() => dismissMirrorChip(chip.id)}
        >
          Ignore
        </button>
      {/if}
      <button type="button" aria-label="Dismiss" onclick={() => dismissMirrorChip(chip.id)}>✕</button>
    </div>
  {:else}
    <div class="chip summary" role="status" data-testid="mirror-summary-chip">
      <span class="message">{chip.message}</span>
      <button type="button" aria-label="Dismiss" onclick={() => dismissMirrorChip(chip.id)}>✕</button>
    </div>
  {/if}
{/each}

<style>
  .chip {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    max-width: 26rem;
    padding: 0.35rem 0.7rem;
    background: var(--ew-chip-scrim);
    color: var(--ew-chip-text);
    border: 1px solid var(--ew-border-panel);
    border-radius: 999px;
    font-size: 0.8rem;
    pointer-events: auto;
    z-index: 21;
    white-space: nowrap;
  }

  /* The summary chip perches above the toast stack, clear of the
     corners and the bottom-center strip. */
  .chip.summary {
    right: 0.75rem;
    bottom: 6.5rem;
  }

  button {
    padding: 0.15rem 0.6rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-control);
    border-radius: 999px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button:hover {
    background: var(--ew-surface-control-hover);
  }
</style>
