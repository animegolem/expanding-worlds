<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { placeAnchoredElement } from '../chrome/anchored-placement-dom'
  import { hexToHsv, hsvToHex, hueFromPoint, normalizeHex, recentColors, svFromPoint } from './color-picker-state'
  import SwatchRow from './SwatchRow.svelte'
  let { open = $bindable(false), value = $bindable(''), recent = $bindable([]), anchor, oncommit, onclose, eyedropper }: {
    open?: boolean; value?: string; recent?: string[]; anchor: HTMLElement; oncommit?: (value: string) => void; onclose?: () => void; eyedropper?: Snippet
  } = $props()
  let panel = $state<HTMLElement | null>(null), hexText = $state(value)
  let hsv = $state(hexToHsv(value) ?? { h: 0, s: 0, v: 0 })
  const anchored = () => ({ anchor: anchor.getBoundingClientRect(), host: { x: 0, y: 0, width: innerWidth, height: innerHeight }, x: { preferred: 'center' as const }, y: { preferred: 'after' as const, fallback: 'before' as const }, gap: 8 })
  function commit(color: string): void { const normalized = normalizeHex(color); if (!normalized) return; value = normalized; hexText = normalized; hsv = hexToHsv(normalized)!; recent = recentColors(recent, normalized); oncommit?.(normalized) }
  function close(): void { open = false; onclose?.(); anchor.focus() }
  function pickSv(event: PointerEvent): void { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); hsv = { ...hsv, ...svFromPoint(rect, event.clientX, event.clientY) }; commit(hsvToHex(hsv)) }
  function pickHue(event: PointerEvent): void { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); hsv = { ...hsv, h: hueFromPoint(rect, event.clientX) }; commit(hsvToHex(hsv)) }
  onMount(() => { const outside = (event: PointerEvent) => { if (open && panel && !panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) close() }; const key = (event: KeyboardEvent) => { if (open && event.key === 'Escape') { event.preventDefault(); close() } }; document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true); return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true) } })
</script>

{#if open}
  <div class="color-picker" bind:this={panel} use:placeAnchoredElement={anchored} role="dialog" aria-label="Color picker">
    <span class="tail"></span><button class="close" type="button" aria-label="Close color picker" onclick={close}>×</button>
    <button type="button" class="sv" aria-label="Saturation and value" style={`--hue:${hsv.h}`} onpointerdown={pickSv}></button>
    <button type="button" class="hue" aria-label="Hue" onpointerdown={pickHue}></button>
    <input type="text" aria-label="Hex color" bind:value={hexText} onkeydown={(event) => { if (event.key === 'Enter') commit(hexText) }} onblur={() => commit(hexText)} />
    <div class="recent">{#each recent.slice(0, 9) as color (color)}<button type="button" class="recent-color" style={`--swatch:${color}`} aria-label={`Use ${color}`} onclick={() => commit(color)}></button>{/each}</div>
    <SwatchRow {value} {recent} onselect={commit} onopen={() => {}} />
    {#if eyedropper}{@render eyedropper()}{/if}
  </div>
{/if}

<style>
  .color-picker { position:fixed; z-index:500; width:220px; padding:10px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-menu); color:var(--ew-text); box-shadow:0 8px 22px var(--ew-shadow); }
  .tail { position:absolute; top:-5px; left:calc(50% - 5px); width:10px; height:10px; transform:rotate(45deg); background:var(--ew-surface-menu); border-left:1px solid var(--ew-border-control); border-top:1px solid var(--ew-border-control); }
  .close { float:right; }
  .sv, .hue { display:block; width:100%; border:1px solid var(--ew-border-control); border-radius:5px; cursor:crosshair; }
  .sv { height:120px; background:linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(var(--hue) 100% 50%)); }
  .hue { height:18px; margin:7px 0; background:linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red); }
  input { box-sizing:border-box; width:100%; padding:5px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-input); color:var(--ew-text); }
  .recent { display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; margin:7px 0; }
  .recent-color { height:22px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--swatch); }
  button:focus-visible, input:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  button:disabled, input:disabled { opacity:.4; }
</style>
