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
  import {
    applyMirrorChipTags,
    dismissMirrorChip,
    onMirrorUiChanged,
    type MirrorChip,
  } from './mirror'

  const { handle }: { handle: CanvasHostHandle } = $props()

  let chips = $state<readonly MirrorChip[]>([])
  $effect(() => onMirrorUiChanged((ui) => (chips = ui.chips)))

  function chipStyle(chip: MirrorChip): string {
    if (chip.kind === 'summary') return ''
    const x = Math.max(12, Math.min(chip.x + 16, window.innerWidth - 320))
    const y = Math.max(12, Math.min(chip.y + 16, window.innerHeight - 80))
    return `left: ${x}px; top: ${y}px;`
  }

  function apply(id: number): void {
    void applyMirrorChipTags(id, (commandType, payload) =>
      handle.gateway.execute(commandType, payload),
    )
  }
</script>

{#each chips as chip (chip.id)}
  {#if chip.kind === 'recognition'}
    <div class="chip anchored" style={chipStyle(chip)} role="status" data-testid="mirror-chip">
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
    </div>
  {:else}
    <div class="chip summary" role="status" data-testid="mirror-summary-chip">
      <span class="message">{chip.message}</span>
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
