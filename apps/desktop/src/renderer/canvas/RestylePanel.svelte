<script lang="ts">
  import { onMount } from 'svelte'
  import { FONT_STACKS, loadFontOptions } from './system-fonts'
  import PickerList from '../ui/PickerList.svelte'
  import Stepper from '../ui/Stepper.svelte'
  import SwatchRow from '../ui/SwatchRow.svelte'
  import ColorPicker from '../ui/ColorPicker.svelte'
  import type { RestyleFamily } from './selection-restyle'

  let { family, values, palette, onpatch }: {
    family: RestyleFamily
    values: { stroke: string; strokeWidth: number; fill: string; color: string; fontSize: number; fontFamily: string; bold: boolean; italic: boolean; cornerRadius: number }
    palette: string[]
    onpatch: (patch: Record<string, unknown>) => void
  } = $props()
  let current = $state({ ...values })
  let strokeAnchor = $state<HTMLButtonElement | null>(null)
  let fillAnchor = $state<HTMLButtonElement | null>(null)
  let textAnchor = $state<HTMLButtonElement | null>(null)
  let picker = $state<'stroke' | 'fill' | 'color' | null>(null)
  let fonts = $state(FONT_STACKS.map((font) => ({
    id: font.value, value: font.value, label: font.label, curated: true,
  })))
  onMount(() => {
    void loadFontOptions().then((options) => {
      fonts = options.map((font, index) => ({
        id: font.value, value: font.value, label: font.label, curated: index < FONT_STACKS.length,
      }))
    })
  })
  function anchorFor(which: 'stroke' | 'fill' | 'color'): HTMLButtonElement | null {
    return which === 'stroke' ? strokeAnchor : which === 'fill' ? fillAnchor : textAnchor
  }
  function commit(patch: Record<string, unknown>): void {
    current = { ...current, ...patch }
    onpatch(patch)
  }
</script>

<div class="panel" data-testid="restyle-panel" role="dialog" aria-label="Restyle selection">
  <span class="tail" aria-hidden="true"></span>
  {#if family === 'text'}
    <label><span>font</span><PickerList items={fonts} value={current.fontFamily} onselect={(fontFamily) => commit({ fontFamily })} /></label>
    <label><span>size</span><Stepper value={current.fontSize} min={1} max={512} step={1} oncommit={(fontSize) => commit({ fontSize })} /></label>
    <label><span>ink</span><SwatchRow value={current.color} recent={palette} onselect={(color) => commit({ color })} onopen={() => (picker = 'color')} /><button class="picker-anchor" bind:this={textAnchor} onclick={() => (picker = 'color')} aria-label="Open text color picker">▣</button></label>
    <div class="toggles"><button class:active={current.bold} onclick={() => commit({ bold: !current.bold })}>B</button><button class:active={current.italic} onclick={() => commit({ italic: !current.italic })}><i>I</i></button></div>
  {:else}
    <label><span>stroke</span><SwatchRow value={current.stroke} recent={palette} onselect={(stroke) => commit({ stroke })} onopen={() => (picker = 'stroke')} /><button class="picker-anchor" bind:this={strokeAnchor} onclick={() => (picker = 'stroke')} aria-label="Open stroke color picker">▣</button></label>
    <label><span>width</span><Stepper value={current.strokeWidth} min={0.1} step={0.5} oncommit={(strokeWidth) => commit({ strokeWidth })} /></label>
    {#if family === 'shape' || family === 'rect'}
      <label><span>fill</span><SwatchRow value={current.fill} recent={palette} onselect={(fill) => commit({ fill })} onopen={() => (picker = 'fill')} /><button class="picker-anchor" bind:this={fillAnchor} onclick={() => (picker = 'fill')} aria-label="Open fill color picker">▣</button><button onclick={() => commit({ fill: null })}>none</button></label>
    {/if}
    {#if family === 'rect'}
      <label><span>round</span><Stepper value={Math.round(current.cornerRadius * 100)} min={0} max={100} step={5} oncommit={(percent) => commit({ cornerRadius: percent / 100 })} /></label>
    {/if}
  {/if}
</div>

{#if picker && anchorFor(picker)}
  <ColorPicker open={true} value={picker === 'stroke' ? current.stroke : picker === 'fill' ? current.fill : current.color} recent={palette} anchor={anchorFor(picker)!} oncommit={(value) => commit({ [picker!]: value })} onclose={() => (picker = null)} />
{/if}

<style>
  .panel { position:relative; display:flex; flex-direction:column; gap:8px; width:240px; box-sizing:border-box; padding:11px 13px; background:var(--ew-surface-menu); border:1px solid var(--ew-border-panel); border-radius:7px; box-shadow:0 10px 28px var(--ew-shadow); color:var(--ew-text-muted); font-size:.72rem; }
  .tail { position:absolute; top:-5px; left:calc(50% - 5px); width:9px; height:9px; transform:rotate(45deg); background:var(--ew-surface-menu); border-left:1px solid var(--ew-border-panel); border-top:1px solid var(--ew-border-panel); }
  label { display:flex; align-items:center; gap:7px; }
  label > span { width:44px; flex:none; font-family:var(--ew-font-editor); }
  button { min-height:28px; border:1px solid var(--ew-border-control); border-radius:5px; background:transparent; color:var(--ew-text); cursor:pointer; }
  button:hover,button.active { background:var(--ew-surface-control-hover); }
  button:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  .picker-anchor { width:28px; padding:0; }
  .toggles { display:flex; gap:5px; margin-left:51px; }
  .toggles button { width:32px; }
</style>
