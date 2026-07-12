<script lang="ts">
  import { appendTypeahead, moveActiveIndex, visiblePickerItems, type PickerItem } from './picker-list-state'
  let { items, value, disabled = false, longTailLabel = 'More…', onselect }: {
    items: readonly PickerItem[]; value?: string; disabled?: boolean; longTailLabel?: string; onselect: (value: string) => void
  } = $props()
  let query = $state(''), longTailOpen = $state(false), active = $state(-1)
  const visible = $derived(visiblePickerItems(items, query, longTailOpen))
  function choose(index: number): void { const item = visible[index]; if (item && !disabled) { onselect(item.value); query = ''; active = index } }
  function keydown(event: KeyboardEvent): void {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active = moveActiveIndex(active, event.key === 'ArrowDown' ? 1 : -1, visible.length) }
    else if (event.key === 'Home') { event.preventDefault(); active = visible.length ? 0 : -1 }
    else if (event.key === 'End') { event.preventDefault(); active = visible.length - 1 }
    else if (event.key === 'Enter') { event.preventDefault(); choose(active) }
    else if (event.key === 'Escape') { query = ''; active = -1 }
    else { const next = appendTypeahead(query, event.key); if (next !== query) { query = next; active = 0 } }
  }
</script>

<div class="picker-list" role="combobox" aria-controls="picker-list-options" aria-expanded="true" aria-disabled={disabled} tabindex={disabled ? undefined : 0} onkeydown={keydown}>
  <div class="query">{query || 'Choose…'}</div>
  <div id="picker-list-options" role="listbox">
    {#each visible as item, index (item.id)}
      {#if index === 0 || item.group !== visible[index - 1]?.group}<div class="group">{item.group ?? ''}</div>{/if}
      <button type="button" role="option" aria-selected={item.value === value} class:active={index === active} onclick={() => choose(index)}>{item.label}</button>
    {/each}
    {#if !longTailOpen && !query && items.some((item) => !item.curated)}
      <button type="button" class="more" onclick={() => (longTailOpen = true)}>{longTailLabel}</button>
    {/if}
  </div>
</div>

<style>
  .picker-list { min-width:12rem; padding:5px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-menu); color:var(--ew-text); }
  .query { padding:4px 6px; color:var(--ew-text-muted); border-bottom:1px solid var(--ew-border); }
  .group { padding:6px 6px 2px; color:var(--ew-text-subtle); font-size:.68rem; text-transform:uppercase; }
  button { display:block; width:100%; padding:5px 7px; border:0; border-radius:5px; background:transparent; color:inherit; text-align:left; cursor:pointer; }
  button:hover, button.active, button[aria-selected='true'] { background:var(--ew-surface-control-hover); }
  button:focus-visible, .picker-list:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  [aria-disabled='true'] { opacity:.4; }
</style>
