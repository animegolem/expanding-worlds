<script lang="ts">
  import { normalizeHex } from './color-picker-state'
  let { value, recent = [], disabled = false, onselect, onopen }: {
    value: string; recent?: readonly string[]; disabled?: boolean
    onselect: (color: string) => void; onopen: () => void
  } = $props()
  const swatches = $derived(recent.map(normalizeHex).filter((entry): entry is string => Boolean(entry)).slice(0, 3))
</script>

<div class="swatch-row" aria-label="Recent colors">
  {#each swatches as color (color)}
    <button type="button" class:active={color === normalizeHex(value)} style={`--swatch:${color}`} aria-label={`Use ${color}`} {disabled} onclick={() => onselect(color)}></button>
  {/each}
  <button type="button" class="picker" aria-label="Open color picker" {disabled} onclick={onopen}>＋</button>
</div>

<style>
  .swatch-row { display:flex; gap:5px; align-items:center; }
  button { width:24px; height:24px; padding:0; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--swatch, var(--ew-surface-raised)); color:var(--ew-text); cursor:pointer; }
  button.active { box-shadow:0 0 0 1px var(--ew-accent); }
  button:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  button:disabled { opacity:.4; cursor:default; }
</style>
