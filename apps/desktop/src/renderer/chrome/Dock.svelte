<!--
  The floating dock (RFC §8.2, AI-IMP-059): bottom-center — tool modes,
  one defaults row for the armed tool, eyedropper, and zoom cluster.
  Selection verbs live with selection furniture/context menus; they
  never change the Dock's species (AI-IMP-291).
  AI-IMP-067 adds the ◉ pin tool between connector and the divider.
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { type ToolKind } from '@ew/canvas-engine'
  import { themeTokenValue } from '../theme'
  import { FONT_STACKS, loadFontOptions, type FontOption } from '../canvas/system-fonts'
  import { defaultsKind, rememberToolColor } from '../canvas/tool-defaults'
  import ColorPicker from '../ui/ColorPicker.svelte'
  import PickerList from '../ui/PickerList.svelte'
  import Stepper from '../ui/Stepper.svelte'
  import SwatchRow from '../ui/SwatchRow.svelte'
  import { placeAnchoredElement } from './anchored-placement-dom'
  import { dispatchReservationChange } from './reservation'
  import type { CanvasHostHandle } from '../canvas/host'
  import type { BoardTooling } from '../canvas/board-tooling'
  import { KEY } from '../keys/bindings'
  import { formatBinding, getBinding, matches } from '../keys/registry'
  import { takeoverActive } from './takeover'
  import { tooltip } from './tooltip'
  import {
    currentShape,
    rememberShape,
    SHAPE_OPTIONS,
    ShapeHoldGesture,
    tailOffset,
    type ShapeToolKind,
  } from './shape-flyout'

  interface EyeDropperResult { sRGBHex: string }
  interface EyeDropperApi { open(): Promise<EyeDropperResult> }
  interface EyeDropperConstructor { new (): EyeDropperApi }
  declare global { interface Window { EyeDropper?: EyeDropperConstructor } }

  const {
    handle,
    tooling,
    hostElement,
  }: {
    handle: CanvasHostHandle
    tooling: BoardTooling
    hostElement: HTMLElement
  } = $props()

  // Tool keys (AI-IMP-117): the binding id carries the shortcut. Both
  // the dispatch map and the tooltip chip read from the registry, so
  // the letter lives in exactly one place.
  const PLAIN_TOOLS: Array<{ kind: ToolKind; label: string; glyph: string; key: string }> = [
    { kind: 'select', label: 'Select', glyph: '⬚', key: KEY.toolSelect },
    { kind: 'text', label: 'Text', glyph: 'T', key: KEY.toolText },
  ]
  const DRAW_TOOLS: Array<{ kind: ToolKind; label: string; glyph: string; key: string }> = [
    { kind: 'path', label: 'Draw', glyph: '✎', key: KEY.toolDraw },
    { kind: 'line', label: 'Line', glyph: '╱', key: KEY.toolLine },
    { kind: 'arrow', label: 'Arrow', glyph: '↗', key: KEY.toolArrow },
    { kind: 'connector', label: 'Connector', glyph: '⌁', key: KEY.toolConnector },
    // §6.2: pins mean places, everywhere — same glyph family as the
    // bookmark control (AI-IMP-067).
    { kind: 'pin', label: 'Pin', glyph: '◉', key: KEY.toolPin },
    // §4.9 frame (AI-IMP-127): draw a region other content sits inside.
    { kind: 'frame', label: 'Frame', glyph: '▢', key: KEY.toolFrame },
  ]
  // The plain-key → tool dispatch map, derived from each binding's
  // combo ('s' for shapes stays special, handled ahead of the map).
  const TOOL_SHORTCUTS = new Map<string, ToolKind>(
    [...PLAIN_TOOLS, ...DRAW_TOOLS].map((tool) => [getBinding(tool.key)!.combo.key!, tool.kind]),
  )

  let activeTool = $state<ToolKind>(handle.tools.active)
  let lastShapeKind = $state<ShapeToolKind>(currentShape())
  let shapeFlyoutOpen = $state(false)
  let shapeButton = $state<HTMLButtonElement | null>(null)
  let shapeFlyout = $state<HTMLElement | null>(null)
  let shapeTailX = $state(12)
  let shapeFlyoutBelow = $state(false)
  let zoomPct = $state(Math.round(handle.controller.camera.zoom * 100))

  const shapeHold = new ShapeHoldGesture(() => (shapeFlyoutOpen = true))
  onDestroy(() => shapeHold.cancel())

  // AI-IMP-289: defaults are deliberately session/host-local. They feed
  // ToolManager's next-create snapshot; they are not selection restyle
  // state and do not invent a project/app settings contract.
  let ink = $state(handle.tools.style.stroke)
  let fill = $state<string | null>(handle.tools.style.fill)
  let strokeScale = $state(handle.tools.style.strokeScale)
  let textFontFamily = $state(handle.tools.style.textFontFamily ?? 'sans-serif')
  let textSizeScale = $state(handle.tools.style.textSizeScale ?? 1)
  let recentColors = $state<string[]>([
    ...new Set([ink, themeTokenValue('--ew-accent'), themeTokenValue('--ew-warn')]),
  ])
  let pickerKind = $state<'ink' | 'fill' | null>(null)
  let pickerOpen = $state(false)
  let pickerAnchor = $state<HTMLElement | null>(null)
  let inkAnchor = $state<HTMLElement | null>(null)
  let fillAnchor = $state<HTMLElement | null>(null)
  let fontListOpen = $state(false)
  let fontAnchor = $state<HTMLButtonElement | null>(null)
  let dockElement = $state<HTMLElement | null>(null)
  let defaultsShift = $state(0)
  const eyedropperAvailable = typeof window !== 'undefined' && typeof window.EyeDropper === 'function'

  // §4.9 rev 0.13: installed fonts, enumerated lazily on the picker's
  // first user gesture; curated stacks until then (and on failure).
  let fontOptions = $state<FontOption[]>(FONT_STACKS)
  let fontsLoaded = false
  function ensureFonts(): void {
    if (fontsLoaded) return
    fontsLoaded = true
    void loadFontOptions().then((options) => (fontOptions = options))
  }

  const fontItems = $derived(
    fontOptions.map((font, index) => ({
      id: font.value,
      label: font.label,
      value: font.value,
      curated: index < FONT_STACKS.length,
    })),
  )

  $effect(() => {
    const offTool = handle.tools.onChanged((tool) => {
      activeTool = tool
      if (isShapeTool(tool)) {
        lastShapeKind = tool
        rememberShape(tool)
      }
    })
    const offCamera = handle.controller.camera.onChanged(
      () => (zoomPct = Math.round(handle.controller.camera.zoom * 100)),
    )
    const onKeydown = (event: KeyboardEvent): void => {
      if (takeoverActive()) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return
      // §8.4 zoom-fit ⇧1 (AI-IMP-136): the ⤢ button's chord, dispatched
      // where the fit action lives. Checked before the modifier guard
      // since it carries Shift; the plain tool letters need none.
      if (matches(event, KEY.boardZoomFit)) {
        event.preventDefault()
        tooling.zoomToFit()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        handle.tools.setTool(lastShapeKind)
        return
      }
      const tool = TOOL_SHORTCUTS.get(key)
      if (tool) handle.tools.setTool(tool)
    }
    window.addEventListener('keydown', onKeydown)
    return () => {
      offTool()
      offCamera()
      window.removeEventListener('keydown', onKeydown)
    }
  })

  $effect(() => {
    handle.tools.style.stroke = ink
    handle.tools.style.fill = fill
    handle.tools.style.textColor = ink
    handle.tools.style.strokeScale = strokeScale
    handle.tools.style.textFontFamily = textFontFamily
    handle.tools.style.textSizeScale = textSizeScale
  })

  const shapeActive = $derived(isShapeTool(activeTool))
  const shapeGlyph = $derived(
    SHAPE_OPTIONS.find((s) => s.kind === (shapeActive ? activeTool : lastShapeKind))?.glyph ?? '▭',
  )
  const activeDefaults = $derived(defaultsKind(activeTool))
  const shapeDefaultsVisible = $derived(activeDefaults === 'shape')
  const lineDefaultsVisible = $derived(activeDefaults === 'line')
  const toolOptionsVisible = $derived(activeDefaults !== null)

  $effect(() => {
    const root = document.documentElement
    if (toolOptionsVisible) root.dataset['dockExpanded'] = 'true'
    else delete root.dataset['dockExpanded']
    dispatchReservationChange(root)
    return () => {
      delete root.dataset['dockExpanded']
      dispatchReservationChange(root)
    }
  })

  function rememberColor(color: string): void {
    recentColors = rememberToolColor(recentColors, color)
  }

  function chooseInk(color: string): void {
    ink = color
    rememberColor(color)
  }

  function chooseFill(color: string): void {
    fill = color
    rememberColor(color)
  }

  function openPicker(kind: 'ink' | 'fill', anchor: HTMLElement): void {
    pickerAnchor = anchor
    pickerKind = kind
    pickerOpen = true
  }

  async function sampleInk(): Promise<void> {
    if (!window.EyeDropper) return
    try {
      const result = await new window.EyeDropper().open()
      chooseInk(result.sRGBHex)
    } catch {
      // Cancellation is the native API's ordinary exit; it changes no default.
    }
  }

  $effect(() => {
    activeTool
    queueMicrotask(() => {
      if (!dockElement) return
      const testId = shapeDefaultsVisible ? 'dock-shape' : `tool-${activeTool}`
      const button = dockElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
      const main = dockElement.querySelector<HTMLElement>('.dock-row.main')
      if (!button || !main) { defaultsShift = 0; return }
      const target = button.getBoundingClientRect()
      const row = main.getBoundingClientRect()
      defaultsShift = target.left + target.width / 2 - (row.left + row.width / 2)
    })
  })

  function setTool(kind: ToolKind): void {
    handle.tools.setTool(kind)
    shapeFlyoutOpen = false
  }

  function isShapeTool(kind: string | null): kind is ShapeToolKind {
    return SHAPE_OPTIONS.some((shape) => shape.kind === kind)
  }

  function pickShape(kind: ShapeToolKind): void {
    lastShapeKind = kind
    rememberShape(kind)
    // ToolManager toggles an already-active non-select tool back to select;
    // a picker choice means "keep this armed", never "toggle it off".
    if (handle.tools.active !== kind) handle.tools.setTool(kind)
    shapeFlyoutOpen = false
  }

  function quickShapePress(): void {
    if (shapeActive) shapeFlyoutOpen = true
    else pickShape(lastShapeKind)
  }

  function beginShapePress(event: PointerEvent): void {
    if (event.button !== 0) return
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    shapeHold.press()
  }

  function endShapePress(event: PointerEvent): void {
    if (event.button !== 0) return
    const button = event.currentTarget as HTMLElement
    if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId)
    const outcome = shapeHold.release()
    if (outcome === 'quick') {
      quickShapePress()
      return
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-shape-kind]')
      ?.dataset['shapeKind'] ?? null
    if (isShapeTool(hit)) pickShape(hit)
    else shapeFlyoutOpen = false
  }

  function cancelShapePress(): void {
    shapeHold.cancel()
    shapeFlyoutOpen = false
  }

  function shapeFlyoutPlaced(
    placement: { x: number; flipped: boolean },
    surface: { width: number },
  ): void {
    if (!shapeButton) return
    const anchor = shapeButton.getBoundingClientRect()
    shapeTailX = tailOffset(anchor.left + anchor.width / 2, placement.x, surface.width)
    shapeFlyoutBelow = placement.flipped
  }

  $effect(() => {
    if (!shapeFlyoutOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      shapeFlyoutOpen = false
      shapeButton?.focus()
    }
    const onRelease = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target && (shapeButton?.contains(target) || shapeFlyout?.contains(target))) return
      shapeFlyoutOpen = false
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerup', onRelease, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerup', onRelease, true)
    }
  })

  function zoomBy(factor: number): void {
    const bounds = hostElement.getBoundingClientRect()
    handle.controller.camera.zoomAt({ x: bounds.width / 2, y: bounds.height / 2 }, factor)
  }

</script>

<div class="dock-stack" data-testid="dock" data-dock-expanded={toolOptionsVisible} bind:this={dockElement}>
  {#if toolOptionsVisible}
    <div
      class="dock-row defaults"
      data-testid="tool-defaults"
      data-defaults-tool={activeTool}
      style:transform={`translateX(${defaultsShift}px)`}
    >
      {#if activeTool === 'text'}
        <span class="default-field font-default">
          <span>font</span>
          <button
            type="button"
            class:active={fontListOpen}
            data-testid="default-font"
            bind:this={fontAnchor}
            onclick={() => { ensureFonts(); fontListOpen = !fontListOpen }}
          >
            {fontOptions.find((font) => font.value === textFontFamily)?.label ?? textFontFamily} ▾
          </button>
        </span>
        <span class="default-field" data-testid="default-text-size">
          <span>size</span>
          <Stepper bind:value={textSizeScale} min={0.5} max={3} step={0.1} />
          <span class="unit">×</span>
        </span>
      {/if}

      <span class="default-field" bind:this={inkAnchor} data-testid="default-ink">
        <span>{activeTool === 'text' ? 'ink' : 'stroke'}</span>
        <SwatchRow
          value={ink}
          recent={recentColors}
          onselect={chooseInk}
          onopen={() => inkAnchor && openPicker('ink', inkAnchor)}
        />
      </span>

      {#if shapeDefaultsVisible}
        <span class="default-field" data-testid="default-stroke-weight">
          <span>weight</span>
          <Stepper bind:value={strokeScale} min={0.25} max={8} step={0.25} />
          <span class="unit">×</span>
        </span>
        <span class="default-field" bind:this={fillAnchor} data-testid="default-fill">
          <span>fill</span>
          <SwatchRow
            value={fill ?? ink}
            recent={recentColors}
            onselect={chooseFill}
            onopen={() => fillAnchor && openPicker('fill', fillAnchor)}
          />
          <button type="button" class="none" aria-pressed={fill === null} onclick={() => (fill = null)}>none</button>
        </span>
      {:else if lineDefaultsVisible}
        <span class="default-field" data-testid="default-stroke-weight">
          <span>weight</span>
          <Stepper bind:value={strokeScale} min={0.25} max={8} step={0.25} />
          <span class="unit">×</span>
        </span>
      {/if}
    </div>

    {#if fontListOpen && fontAnchor}
      <div
        class="font-picker"
        data-testid="default-font-list"
        use:placeAnchoredElement={() => ({
          anchor: fontAnchor!.getBoundingClientRect(),
          host: { x: 0, y: 0, width: innerWidth, height: innerHeight },
          x: { preferred: 'center' },
          y: { preferred: 'before', fallback: 'after' },
          gap: 8,
        })}
      >
        <PickerList
          items={fontItems}
          value={textFontFamily}
          onselect={(value) => { textFontFamily = value; fontListOpen = false }}
        />
      </div>
    {/if}

    {#if pickerOpen && pickerAnchor && pickerKind}
      <ColorPicker
        bind:open={pickerOpen}
        value={pickerKind === 'fill' ? (fill ?? ink) : ink}
        recent={recentColors}
        anchor={pickerAnchor}
        oncommit={(color) => pickerKind === 'fill' ? chooseFill(color) : chooseInk(color)}
        onclose={() => (pickerKind = null)}
      />
    {/if}
  {/if}

  <div class="dock-row main">
    {#each PLAIN_TOOLS as tool (tool.kind)}
      <button
        type="button"
        class="tool"
        class:active={activeTool === tool.kind}
        data-testid={`tool-${tool.kind}`}
        onclick={() => setTool(tool.kind)}
        use:tooltip={{
          name: tool.label,
          shortcut:
            tool.kind !== 'select'
              ? `${formatBinding(tool.key)} · esc returns to select`
              : formatBinding(tool.key),
        }}
      >
        {tool.glyph}
      </button>
    {/each}
    <button
      type="button"
      class="tool"
      class:active={shapeActive}
      data-testid="dock-shape"
      aria-haspopup="menu"
      aria-expanded={shapeFlyoutOpen}
      bind:this={shapeButton}
      onpointerdown={beginShapePress}
      onpointerup={endShapePress}
      onpointercancel={cancelShapePress}
      onclick={(event) => {
        event.preventDefault()
        // Keyboard activation has no pointer detail; pointer activation was
        // already classified at pointerup and must not run twice.
        if (event.detail === 0) quickShapePress()
      }}
      use:tooltip={{ name: 'Shapes', shortcut: formatBinding(KEY.toolShapes) }}
    >
      {shapeGlyph}
      <span class="more" aria-hidden="true"></span>
    </button>
    {#each DRAW_TOOLS as tool (tool.kind)}
      <button
        type="button"
        class="tool"
        class:active={activeTool === tool.kind}
        data-testid={`tool-${tool.kind}`}
        onclick={() => setTool(tool.kind)}
        use:tooltip={{
          name: tool.label,
          shortcut:
            `${formatBinding(tool.key)} · esc returns to select`,
        }}
      >
        {tool.glyph}
      </button>
    {/each}
    <button
      type="button"
      class="tool pipette"
      class:disabled={!eyedropperAvailable}
      aria-disabled={!eyedropperAvailable}
      aria-label="Eyedropper"
      data-testid="tool-eyedropper"
      onclick={() => eyedropperAvailable && void sampleInk()}
      use:tooltip={{
        name: eyedropperAvailable
          ? 'Eyedropper — pick ink from the board'
          : 'Eyedropper unavailable in this Chromium build',
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.4 3.6a2.4 2.4 0 0 0-3.4 0l-2.6 2.6 3.4 3.4 2.6-2.6a2.4 2.4 0 0 0 0-3.4Z" class="pipette-fill"></path>
        <path d="M15.2 7.4 5.5 17.1c-.4.4-.7 1-.8 1.6l-.4 2.4a.6.6 0 0 0 .7.7l2.4-.4c.6-.1 1.1-.4 1.6-.8l9.7-9.7"></path>
      </svg>
    </button>
    <span class="divider"></span>
    <button
      type="button"
      class="tool"
      data-testid="zoom-out"
      onclick={() => zoomBy(1 / 1.25)}
      use:tooltip={{ name: 'Zoom out' }}
    >
      −
    </button>
    <span class="zoom-pct" data-testid="zoom-pct">{zoomPct}%</span>
    <button
      type="button"
      class="tool"
      data-testid="zoom-in"
      onclick={() => zoomBy(1.25)}
      use:tooltip={{ name: 'Zoom in' }}
    >
      +
    </button>
    <button
      type="button"
      class="tool"
      data-testid="zoom-fit"
      onclick={() => tooling.zoomToFit()}
      use:tooltip={{ name: 'Zoom to fit', shortcut: formatBinding(KEY.boardZoomFit) }}
    >
      ⤢
    </button>
  </div>
</div>

{#if shapeFlyoutOpen && shapeButton}
  <div
    class="shape-flyout"
    class:below={shapeFlyoutBelow}
    data-testid="shape-flyout"
    role="menu"
    aria-label="Shapes"
    bind:this={shapeFlyout}
    use:placeAnchoredElement={() => ({
      anchor: shapeButton!.getBoundingClientRect(),
      host: { x: 0, y: 0, width: innerWidth, height: innerHeight },
      x: { preferred: 'center' },
      y: { preferred: 'before', fallback: 'after' },
      gap: 8,
      onplace: shapeFlyoutPlaced,
    })}
  >
    <div class="shape-header">Shapes <span>· {formatBinding(KEY.toolShapes)}</span></div>
    {#each SHAPE_OPTIONS as shape (shape.kind)}
      <button
        type="button"
        class:active={lastShapeKind === shape.kind}
        role="menuitemradio"
        aria-checked={lastShapeKind === shape.kind}
        data-testid={`tool-${shape.kind}`}
        data-shape-kind={shape.kind}
        onclick={() => pickShape(shape.kind)}
      >
        <span class="glyph">{shape.glyph}</span>
        {shape.label}
      </button>
    {/each}
    <span class="shape-tail" style:left={`${shapeTailX}px`} aria-hidden="true"></span>
  </div>
{/if}

<style>
  .dock-stack {
    position: absolute;
    bottom: calc((var(--ew-reserve-dock) - 2.5rem) / 2);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 0.3rem;
    pointer-events: none;
  }

  .dock-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.45rem;
    background: var(--ew-surface);
    border: 1px solid var(--ew-border);
    border-radius: 9px;
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 78vw;
  }

  .defaults {
    position: relative;
    flex-wrap: nowrap;
    max-width: none;
    white-space: nowrap;
  }

  .defaults::after {
    content: '';
    position: absolute;
    left: calc(50% - 5px);
    bottom: -6px;
    width: 10px;
    height: 10px;
    transform: rotate(45deg);
    background: var(--ew-surface);
    border-right: 1px solid var(--ew-border-panel);
    border-bottom: 1px solid var(--ew-border-panel);
  }

  .default-field {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .default-field + .default-field {
    padding-left: 0.5rem;
    border-left: 1px solid var(--ew-border);
  }

  .default-field :global(.stepper) {
    grid-template-columns: auto 3.2rem auto;
  }

  .unit {
    margin-left: -0.22rem;
    font-family: var(--ew-font-editor);
  }

  .none {
    height: 24px;
    padding: 0 0.4rem;
  }

  .font-picker {
    position: fixed;
    z-index: 500;
    pointer-events: auto;
  }

  .tool {
    position: relative;
    min-width: 1.9rem;
    height: 1.9rem;
    display: inline-grid;
    place-items: center;
    font-size: 0.95rem;
  }

  .more {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-bottom: 4px solid currentColor;
    opacity: 0.65;
  }

  .shape-flyout {
    position: fixed;
    z-index: 500;
    display: flex;
    flex-direction: column;
    min-width: 9.5rem;
    padding: 0.32rem;
    background: var(--ew-surface);
    border: 1px solid var(--ew-border-panel);
    border-radius: 8px;
    color: var(--ew-text);
    pointer-events: auto;
  }

  .shape-header {
    padding: 0.2rem 0.38rem 0.35rem;
    font-family: var(--ew-font-editor);
    font-size: 0.66rem;
    color: var(--ew-text-muted);
    border-bottom: 1px solid var(--ew-border);
    margin-bottom: 0.2rem;
  }

  .shape-header span {
    color: var(--ew-text-subtle);
  }

  .shape-flyout button {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 1.75rem;
    border-color: transparent;
    background: transparent;
    text-align: left;
  }

  .shape-flyout button:hover {
    background: var(--ew-surface-hover);
  }

  .shape-flyout button.active {
    background: var(--ew-accent);
  }

  .shape-tail {
    position: absolute;
    bottom: -6px;
    width: 10px;
    height: 10px;
    transform: translateX(-50%) rotate(45deg);
    background: var(--ew-surface);
    border-right: 1px solid var(--ew-border-panel);
    border-bottom: 1px solid var(--ew-border-panel);
  }

  .shape-flyout.below .shape-tail {
    top: -6px;
    bottom: auto;
    border: 0;
    border-left: 1px solid var(--ew-border-panel);
    border-top: 1px solid var(--ew-border-panel);
  }

  .pipette svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pipette .pipette-fill {
    fill: currentColor;
    stroke: none;
  }

  .divider {
    width: 1px;
    height: 1.4rem;
    background: var(--ew-border-strong);
    margin: 0 0.25rem;
  }

  .zoom-pct {
    min-width: 3.1rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }

  .glyph {
    margin-right: 0.3rem;
  }

  button {
    padding: 0.15rem 0.45rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 5px;
    cursor: pointer;
  }

  button.active {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button.disabled {
    opacity: 0.4;
    cursor: default;
  }

</style>
