<script lang="ts">
  /**
   * Decoration toolbar (AI-IMP-021): tool mode buttons, stroke/fill/
   * text color pickers, and §6.8 selection controls (group/ungroup,
   * lock/unlock, hide) plus the hidden-items list with Show buttons.
   * State is re-read from the controller snapshot on selection
   * changes and project-changed events (the host re-queries the
   * scene asynchronously, hence the trailing refresh).
   */
  import { isTextData, type TextData, type ToolKind, type SceneDecoration } from '@ew/canvas-engine'
  import { measureTextWorld } from './canvas/text-entry'
  import { FONT_STACKS, loadFontOptions, type FontOption } from './canvas/system-fonts'
  import type { CanvasHostHandle } from './canvas/host'
  import type { DecorationsUi } from './canvas/decorations-ui'

  const { handle, ui }: { handle: CanvasHostHandle; ui: DecorationsUi } = $props()

  // §4.9 rev 0.13: installed fonts, enumerated lazily on the picker's
  // first user gesture; curated stacks until then (and on failure).
  let fontOptions = $state<FontOption[]>(FONT_STACKS)
  let fontsLoaded = false
  function ensureFonts(): void {
    if (fontsLoaded) return
    fontsLoaded = true
    void loadFontOptions().then((options) => (fontOptions = options))
  }

  const tools: Array<{ kind: ToolKind; label: string }> = [
    { kind: 'select', label: 'Select' },
    { kind: 'text', label: 'Text' },
    { kind: 'rect', label: 'Rect' },
    { kind: 'ellipse', label: 'Ellipse' },
    { kind: 'triangle', label: 'Triangle' },
    { kind: 'shape-arrow', label: 'Arrow shape' },
    { kind: 'path', label: 'Draw' },
    { kind: 'line', label: 'Line' },
    { kind: 'arrow', label: 'Arrow' },
    { kind: 'connector', label: 'Connector' },
  ]

  let activeTool = $state<ToolKind>(handle.tools.active)
  let stroke = $state(handle.tools.style.stroke)
  let fill = $state<string | null>(handle.tools.style.fill)
  let textColor = $state(handle.tools.style.textColor)
  let strokeScale = $state(handle.tools.style.strokeScale)
  let selected = $state<SceneDecoration[]>([])
  let hidden = $state<SceneDecoration[]>([])

  function refresh(): void {
    selected = ui.selectedDecorations()
    hidden = ui.hiddenDecorations()
  }

  $effect(() => {
    const offTool = handle.tools.onChanged((tool) => (activeTool = tool))
    const offSelection = handle.controller.selection.onChanged(() => refresh())
    // The host re-queries the scene after project-changed; read the
    // fresh snapshot once that trailing refresh has landed.
    const offProject = window.ew.project.onChanged(() => {
      setTimeout(refresh, 120)
    })
    refresh()
    return () => {
      offTool()
      offSelection()
      offProject()
    }
  })

  $effect(() => {
    handle.tools.style.stroke = stroke
    handle.tools.style.fill = fill
    handle.tools.style.textColor = textColor
    handle.tools.style.strokeScale = strokeScale
  })

  const hasGroup = $derived(selected.some((d) => d.groupId !== null))
  const allLocked = $derived(selected.length > 0 && selected.every((d) => d.locked === 1))

  // §4.9 rev 0.12: whole-object type controls for a single selected
  // text decoration. One UpdateDecoration per change, with bounds
  // re-measured through the same DOM metrics the entry overlay uses.
  const selectedText = $derived(
    selected.length === 1 && selected[0]!.kind === 'text' && isTextData(selected[0]!.data)
      ? selected[0]!
      : null,
  )
  const textData = $derived(selectedText ? (selectedText.data as TextData) : null)

  function updateText(patch: Partial<TextData>): void {
    if (!selectedText || !textData) return
    const decorationId = selectedText.id
    run(async () => {
      // Compose from FRESH data, not this component's 120ms-refreshed
      // snapshot: two quick edits (size, then bold) would otherwise
      // silently revert the first one (AI-IMP-049 fix; the race also
      // hit the e2e as the recurring decorations flake).
      const response = await window.ew.project.query('getCanvasContents', {
        canvasId: handle.canvasId,
      })
      const fresh = response.ok
        ? (response.result as Array<{ id: string; data?: unknown }>).find(
            (item) => item.id === decorationId,
          )
        : null
      const base = fresh && isTextData(fresh.data) ? fresh.data : textData
      if (!base) return
      const next = { ...base, ...patch }
      const measured = measureTextWorld(next.text, next)
      await handle.gateway.execute('UpdateDecoration', {
        decorationId,
        set: { data: { ...next, ...measured } },
      })
    })
  }

  function run(action: () => Promise<void>): void {
    void action().then(() => setTimeout(refresh, 120))
  }
</script>

<div class="decoration-toolbar" data-testid="decoration-toolbar">
  <div class="row">
    {#each tools as tool (tool.kind)}
      <button
        type="button"
        class:active={activeTool === tool.kind}
        data-testid={`tool-${tool.kind}`}
        onclick={() => handle.tools.setTool(tool.kind)}
      >
        {tool.label}
      </button>
    {/each}
  </div>
  <div class="row">
    <label>
      Stroke
      <input type="color" data-testid="style-stroke" bind:value={stroke} />
    </label>
    <label>
      Weight ×
      <input
        type="number"
        min="0.25"
        max="8"
        step="0.25"
        data-testid="style-stroke-width"
        bind:value={strokeScale}
      />
    </label>
    <label>
      Fill
      <input
        type="color"
        data-testid="style-fill"
        value={fill ?? '#000000'}
        oninput={(e) => (fill = (e.currentTarget as HTMLInputElement).value)}
      />
      <button type="button" data-testid="style-fill-none" disabled={fill === null} onclick={() => (fill = null)}>
        none
      </button>
    </label>
    <label>
      Text
      <input type="color" data-testid="style-text-color" bind:value={textColor} />
    </label>
  </div>
  {#if textData}
    <div class="row" data-testid="text-style-controls">
      <label>
        Size
        <input
          type="number"
          min="1"
          max="512"
          data-testid="text-size"
          value={textData.fontSize}
          onchange={(e) => {
            const size = Number((e.currentTarget as HTMLInputElement).value)
            if (Number.isFinite(size) && size > 0) updateText({ fontSize: size })
          }}
        />
      </label>
      <label>
        Font
        <select
          data-testid="text-family"
          value={textData.fontFamily ?? 'sans-serif'}
          onpointerdown={ensureFonts}
          onfocus={ensureFonts}
          onchange={(e) => updateText({ fontFamily: (e.currentTarget as HTMLSelectElement).value })}
        >
          {#if textData.fontFamily && !fontOptions.some((f) => f.value === textData.fontFamily)}
            <option value={textData.fontFamily}>{textData.fontFamily}</option>
          {/if}
          {#each fontOptions as family (family.value)}
            <option value={family.value}>{family.label}</option>
          {/each}
        </select>
      </label>
      <button
        type="button"
        class:active={textData.bold === true}
        data-testid="text-bold"
        onclick={() => updateText({ bold: !textData!.bold })}
      >
        B
      </button>
      <button
        type="button"
        class:active={textData.italic === true}
        data-testid="text-italic"
        onclick={() => updateText({ italic: !textData!.italic })}
      >
        I
      </button>
      <label>
        Color
        <input
          type="color"
          data-testid="text-selected-color"
          value={textData.color}
          onchange={(e) => updateText({ color: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
    </div>
  {/if}
  {#if selected.length > 0}
    <div class="row" data-testid="selection-controls">
      <span>{selected.length} selected</span>
      <button
        type="button"
        data-testid="deco-group"
        disabled={selected.length < 2}
        onclick={() => run(() => ui.groupSelection())}
      >
        Group
      </button>
      <button
        type="button"
        data-testid="deco-ungroup"
        disabled={!hasGroup}
        onclick={() => run(() => ui.ungroupSelection())}
      >
        Ungroup
      </button>
      <button
        type="button"
        data-testid="deco-lock"
        onclick={() => run(() => ui.setLockedOnSelection(!allLocked))}
      >
        {allLocked ? 'Unlock' : 'Lock'}
      </button>
      <button type="button" data-testid="deco-hide" onclick={() => run(() => ui.hideSelection())}>
        Hide
      </button>
    </div>
  {/if}
  {#if hidden.length > 0}
    <div class="row hidden-list" data-testid="hidden-list">
      <span>Hidden:</span>
      {#each hidden as d (d.id)}
        <button type="button" data-testid={`deco-show-${d.id}`} onclick={() => run(() => ui.show(d.id))}>
          Show {d.kind}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .decoration-toolbar {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: rgba(23, 25, 29, 0.88);
    border: 1px solid #2e3138;
    border-radius: 6px;
    font-size: 0.75rem;
    color: #dde3ea;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  button {
    padding: 0.15rem 0.45rem;
    background: #23262c;
    color: #dde3ea;
    border: 1px solid #3a3e46;
    border-radius: 4px;
    cursor: pointer;
  }

  button.active {
    background: #4a9df0;
    border-color: #4a9df0;
    color: #10131a;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  input[type='color'] {
    width: 1.6rem;
    height: 1.3rem;
    padding: 0;
    border: 1px solid #3a3e46;
    background: transparent;
  }

  input[type='number'] {
    width: 3rem;
    background: #23262c;
    color: #dde3ea;
    border: 1px solid #3a3e46;
    border-radius: 4px;
  }
</style>
