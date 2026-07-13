<script lang="ts">
  import { tooltip } from '../chrome/tooltip'
  import { Z } from '../z'
  import { clearTagLens, onTagLensChanged, type TagLensState } from './lens-coordinator'

  let lens = $state<TagLensState | null>(null)
  $effect(() => onTagLensChanged((next) => (lens = next)))
</script>

{#if lens}
  <div class="active-lens" data-testid="active-tag-lens" style:z-index={Z.chrome}>
    <span>◉ #{lens.name}</span>
    <button
      type="button"
      aria-label={`Drop #${lens.name} lens`}
      onclick={clearTagLens}
      use:tooltip={{ name: `Drop #${lens.name} lens · Esc` }}
    >✕</button>
  </div>
{/if}

<style>
  .active-lens {
    position: absolute;
    top: calc(var(--ew-reserve-strip) + 8px);
    left: 50%;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.55rem;
    transform: translateX(-50%);
    background: var(--ew-surface-raised);
    color: var(--ew-warn);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    box-shadow: 0 4px 14px var(--ew-shadow);
    font: 0.72rem/1 ui-monospace, monospace;
    pointer-events: auto;
  }

  button {
    padding: 0;
    background: transparent;
    color: inherit;
    border: 0;
    cursor: pointer;
  }
</style>
