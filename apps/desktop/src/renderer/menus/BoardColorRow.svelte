<script lang="ts">
  import ColorPicker from '../ui/ColorPicker.svelte'
  import SwatchRow from '../ui/SwatchRow.svelte'

  let {
    value,
    palette,
    onpick,
    onclear,
  }: {
    value: string
    palette: string[]
    onpick: (color: string) => void
    onclear: () => void
  } = $props()

  let anchor = $state<HTMLButtonElement | null>(null)
  let pickerOpen = $state(false)
</script>

<div class="board-color-row" data-testid="board-color-controls">
  <SwatchRow {value} recent={palette} onselect={onpick} onopen={() => (pickerOpen = true)} />
  <button
    bind:this={anchor}
    type="button"
    class="picker-anchor"
    aria-label="Open board color picker"
    data-testid="ctx-backdrop-color-picker"
    onclick={() => (pickerOpen = true)}
  >▣</button>
  <button type="button" data-testid="bg-color-clear" onclick={onclear}>clear</button>
</div>

{#if pickerOpen && anchor}
  <ColorPicker
    open={true}
    {value}
    recent={palette}
    {anchor}
    oncommit={onpick}
    onclose={() => (pickerOpen = false)}
  />
{/if}

<style>
  .board-color-row { display:flex; align-items:center; gap:5px; padding:3px 7px; }
  button { height:24px; padding:0 7px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-raised); color:var(--ew-text); cursor:pointer; }
  button:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
</style>
