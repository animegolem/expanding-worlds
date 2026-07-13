<script lang="ts">
  import { normalizeHex } from './color-picker-state'
  export interface SwatchChoice {
    value: string
    label: string
    testid?: string
    text?: string
  }
  let {
    value,
    recent = [],
    choices,
    disabled = false,
    onselect,
    onopen,
  }: {
    value: string
    recent?: readonly string[]
    choices?: readonly SwatchChoice[]
    disabled?: boolean
    onselect: (color: string) => void
    onopen?: () => void
  } = $props()
  const recentChoices = $derived(
    recent
      .map(normalizeHex)
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 3)
      .map((color) => ({ value: color, label: `Use ${color}` })),
  )
  const swatches = $derived(choices ?? recentChoices)

  function swatchColor(choice: SwatchChoice): string {
    return choice.value.startsWith('--') ? `var(${choice.value})` : choice.value
  }
</script>

<div class="swatch-row" aria-label={choices ? 'Canvas colors' : 'Recent colors'}>
  {#each swatches as choice (choice.value)}
    <button
      type="button"
      class:active={choice.value === value || choice.value === normalizeHex(value)}
      class:text={Boolean(choice.text)}
      style={`--swatch:${swatchColor(choice)}`}
      aria-label={choice.label}
      aria-pressed={choice.value === value || choice.value === normalizeHex(value)}
      data-testid={choice.testid}
      {disabled}
      onclick={() => onselect(choice.value)}
    >{choice.text ?? ''}</button>
  {/each}
  {#if onopen}
    <button type="button" class="picker" aria-label="Open color picker" {disabled} onclick={onopen}>＋</button>
  {/if}
</div>

<style>
  .swatch-row { display:flex; gap:5px; align-items:center; }
  button { width:24px; height:24px; padding:0; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--swatch, var(--ew-surface-raised)); color:var(--ew-text); cursor:pointer; }
  button.text { background:var(--ew-surface-raised); }
  button.active { box-shadow:0 0 0 1px var(--ew-accent); }
  button:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  button:disabled { opacity:.4; cursor:default; }
</style>
