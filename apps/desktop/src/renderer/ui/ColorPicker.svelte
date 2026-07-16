<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { placeAnchoredElement } from '../chrome/anchored-placement-dom'
  import { dismissOnOutside } from '../chrome/dismissal-guard'
  import { tailOffset } from '../chrome/shape-flyout'
  import {
    hexToHsv,
    hsvToHex,
    hueFromPoint,
    normalizeHex,
    recentColors,
    recentColorWindows,
    svFromPoint,
    type HsvColor,
  } from './color-picker-state'

  let {
    open = $bindable(false),
    value = $bindable(''),
    recent = $bindable([]),
    anchor,
    oncommit,
    onclose,
    eyedropper,
  }: {
    open?: boolean
    value?: string
    recent?: string[]
    anchor: HTMLElement
    oncommit?: (value: string) => void
    onclose?: () => void
    eyedropper?: Snippet
  } = $props()

  let hexText = $state(value)
  let hsv = $state(hexToHsv(value) ?? { h: 0, s: 0, v: 0 })
  let svPointer = $state<number | null>(null)
  let huePointer = $state<number | null>(null)
  let tailX = $state(110)
  let placedAbove = $state(false)
  const pickerRecents = $derived(recentColorWindows(recent).picker)
  const anchored = () => ({
    anchor: anchor.getBoundingClientRect(),
    host: { x: 0, y: 0, width: innerWidth, height: innerHeight },
    x: { preferred: 'center' as const },
    y: { preferred: 'after' as const, fallback: 'before' as const },
    gap: 8,
    onplace: pickerPlaced,
  })

  function pickerPlaced(
    placement: { x: number; flipped: boolean },
    surface: { width: number },
  ): void {
    const anchorRect = anchor.getBoundingClientRect()
    tailX = tailOffset(anchorRect.left + anchorRect.width / 2, placement.x, surface.width)
    placedAbove = placement.flipped
  }

  function setDraft(next: HsvColor): void {
    hsv = next
    hexText = hsvToHex(next)
  }

  function restoreCommittedDraft(): void {
    const committed = hexToHsv(value)
    if (!committed) return
    hsv = committed
    hexText = hsvToHex(committed)
  }

  function commit(color: string): void {
    const normalized = normalizeHex(color)
    if (!normalized) {
      restoreCommittedDraft()
      return
    }
    const changed = normalizeHex(value) !== normalized
    value = normalized
    hexText = normalized
    hsv = hexToHsv(normalized)!
    recent = recentColors(recent, normalized)
    if (changed) oncommit?.(normalized)
  }

  function close(): void {
    open = false
    onclose?.()
    anchor.focus()
  }

  function updateSv(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setDraft({ ...hsv, ...svFromPoint(rect, event.clientX, event.clientY) })
  }

  function beginSv(event: PointerEvent): void {
    if (event.button !== 0) return
    const surface = event.currentTarget as HTMLElement
    surface.focus()
    surface.setPointerCapture(event.pointerId)
    svPointer = event.pointerId
    updateSv(event)
  }

  function moveSv(event: PointerEvent): void {
    if (svPointer !== event.pointerId) return
    updateSv(event)
  }

  function endSv(event: PointerEvent): void {
    if (svPointer !== event.pointerId) return
    updateSv(event)
    const surface = event.currentTarget as HTMLElement
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
    svPointer = null
    commit(hexText)
  }

  function cancelSv(event: PointerEvent): void {
    if (svPointer !== event.pointerId) return
    svPointer = null
    restoreCommittedDraft()
  }

  function updateHue(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setDraft({ ...hsv, h: hueFromPoint(rect, event.clientX) })
  }

  function beginHue(event: PointerEvent): void {
    if (event.button !== 0) return
    const surface = event.currentTarget as HTMLElement
    surface.focus()
    surface.setPointerCapture(event.pointerId)
    huePointer = event.pointerId
    updateHue(event)
  }

  function moveHue(event: PointerEvent): void {
    if (huePointer !== event.pointerId) return
    updateHue(event)
  }

  function endHue(event: PointerEvent): void {
    if (huePointer !== event.pointerId) return
    updateHue(event)
    const surface = event.currentTarget as HTMLElement
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
    huePointer = null
    commit(hexText)
  }

  function cancelHue(event: PointerEvent): void {
    if (huePointer !== event.pointerId) return
    huePointer = null
    restoreCommittedDraft()
  }

  function stepSv(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.01
    let next: HsvColor | null = null
    if (event.key === 'ArrowLeft') next = { ...hsv, s: Math.max(0, hsv.s - step) }
    else if (event.key === 'ArrowRight') next = { ...hsv, s: Math.min(1, hsv.s + step) }
    else if (event.key === 'ArrowDown') next = { ...hsv, v: Math.max(0, hsv.v - step) }
    else if (event.key === 'ArrowUp') next = { ...hsv, v: Math.min(1, hsv.v + step) }
    if (!next) return
    event.preventDefault()
    setDraft(next)
    commit(hexText)
  }

  function stepHue(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 1
    let delta = 0
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step
    if (delta === 0) return
    event.preventDefault()
    setDraft({ ...hsv, h: (hsv.h + delta + 360) % 360 })
    commit(hexText)
  }

  onMount(() => {
    const key = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })
</script>

{#if open}
  <div
    class="color-picker"
    class:above={placedAbove}
    data-testid="color-picker"
    use:dismissOnOutside={{ dismiss: close, exclude: () => [anchor] }}
    use:placeAnchoredElement={anchored}
    role="dialog"
    aria-label="Color picker"
  >
    <span class="tail" style:left={`${tailX}px`}></span>
    <button class="close" type="button" aria-label="Close color picker" onclick={close}>×</button>
    <button
      type="button"
      class="sv"
      aria-label="Saturation and value"
      style={`--hue:${hsv.h}`}
      onpointerdown={beginSv}
      onpointermove={moveSv}
      onpointerup={endSv}
      onpointercancel={cancelSv}
      onkeydown={stepSv}
    >
      <span
        class="sv-thumb"
        data-testid="sv-thumb"
        style:left={`${hsv.s * 100}%`}
        style:top={`${(1 - hsv.v) * 100}%`}
      ></span>
    </button>
    <button
      type="button"
      class="hue"
      aria-label="Hue"
      onpointerdown={beginHue}
      onpointermove={moveHue}
      onpointerup={endHue}
      onpointercancel={cancelHue}
      onkeydown={stepHue}
    >
      <span
        class="hue-thumb"
        data-testid="hue-thumb"
        style:left={`${hsv.h / 360 * 100}%`}
      ></span>
    </button>
    <div class="hex-row">
      <span class="preview" style={`--preview:${hexText}`} aria-hidden="true"></span>
      <input
        type="text"
        aria-label="Hex color"
        bind:value={hexText}
        spellcheck="false"
        onkeydown={(event) => { if (event.key === 'Enter') commit(hexText) }}
        onblur={() => commit(hexText)}
      />
      <button type="button" class="use" onclick={() => commit(hexText)}>use</button>
    </div>
    <div class="recent" data-testid="color-picker-recents" aria-label="Last used colors">
      {#each pickerRecents as color, index (color)}
        <button
          type="button"
          class="recent-color"
          style={`--swatch:${color}`}
          aria-label={`Use ${color}`}
          data-color={color}
          data-swatch-index={index}
          onclick={() => commit(color)}
        ></button>
      {/each}
    </div>
    {#if eyedropper}{@render eyedropper()}{/if}
  </div>
{/if}

<style>
  .color-picker { position:fixed; z-index:500; width:220px; padding:10px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-menu); color:var(--ew-text); box-shadow:0 8px 22px var(--ew-shadow); pointer-events:auto; }
  .tail { position:absolute; top:-5px; left:50%; width:10px; height:10px; transform:translateX(-50%) rotate(45deg); background:var(--ew-surface-menu); border-left:1px solid var(--ew-border-control); border-top:1px solid var(--ew-border-control); }
  .color-picker.above .tail { top:auto; bottom:-5px; border:0; border-right:1px solid var(--ew-border-control); border-bottom:1px solid var(--ew-border-control); }
  .close { float:right; }
  .sv, .hue { position:relative; display:block; width:100%; overflow:hidden; border:1px solid var(--ew-border-control); border-radius:5px; cursor:crosshair; touch-action:none; }
  .sv { height:120px; background:linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(var(--hue) 100% 50%)); }
  .hue { height:18px; margin:7px 0; background:linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red); }
  .sv-thumb, .hue-thumb { position:absolute; pointer-events:none; transform:translate(-50%, -50%); border:2px solid var(--ew-surface-solid); box-shadow:0 0 3px var(--ew-shadow); }
  .sv-thumb { width:10px; height:10px; border-radius:50%; }
  .hue-thumb { top:50%; width:6px; height:16px; border-radius:3px; }
  .hex-row { display:flex; align-items:center; gap:6px; }
  .preview { width:24px; height:24px; flex:none; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--preview); }
  input { box-sizing:border-box; min-width:0; width:100%; padding:5px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--ew-surface-input); color:var(--ew-text); }
  .use { height:28px; padding:0 8px; background:var(--ew-accent); border-color:var(--ew-accent); color:var(--ew-on-accent); }
  .recent { display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; margin:7px 0 0; }
  .recent-color { height:22px; border:1px solid var(--ew-border-control); border-radius:5px; background:var(--swatch); }
  button:focus-visible, input:focus-visible { outline:2px solid var(--ew-focus-ring); outline-offset:1px; }
  button:disabled, input:disabled { opacity:.4; }
</style>
