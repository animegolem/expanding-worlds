<!--
  The floating dock (RFC §8.2, AI-IMP-059): bottom-center — tool modes
  (shape kinds behind one flyout) · divider · zoom cluster; the
  selection-conditional segment (z-order, align, distribute, zoom to
  selection, decoration group/lock/hide) joins only while a selection
  exists. Contextual rows above the dock carry the tool style options
  and the selection restyle controls ported from DecorationToolbar
  (AI-IMP-021/034/055 — the fresh-data composition rules are theirs).
  AI-IMP-067 adds the ◉ pin tool between connector and the divider.
-->
<script lang="ts">
  import {
    isTextData,
    type AlignOp,
    type ArrangeSortKey,
    type DistributeAxis,
    type NormalizeMode,
    type ReorderOp,
    type TextData,
    type ToolKind,
    type SceneDecoration,
  } from '@ew/canvas-engine'
  import { themeTokenValue } from '../theme'
  import { measureTextWorld } from '../canvas/text-entry'
  import { FONT_STACKS, loadFontOptions, type FontOption } from '../canvas/system-fonts'
  import type { CanvasHostHandle } from '../canvas/host'
  import type { DecorationsUi } from '../canvas/decorations-ui'
  import type { BoardTooling } from '../canvas/board-tooling'
  import { KEY } from '../keys/bindings'
  import { formatBinding, getBinding, matches } from '../keys/registry'
  import { takeoverActive } from './takeover'
  import { tooltip } from './tooltip'

  const {
    handle,
    ui,
    tooling,
    hostElement,
  }: {
    handle: CanvasHostHandle
    ui: DecorationsUi
    tooling: BoardTooling
    hostElement: HTMLElement
  } = $props()

  const SHAPE_KINDS: Array<{ kind: ToolKind; label: string; glyph: string }> = [
    { kind: 'rect', label: 'Rect', glyph: '▭' },
    { kind: 'ellipse', label: 'Ellipse', glyph: '◯' },
    { kind: 'triangle', label: 'Triangle', glyph: '△' },
    { kind: 'shape-arrow', label: 'Arrow shape', glyph: '➤' },
  ]
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

  const alignOps: Array<{ op: AlignOp; label: string }> = [
    { op: 'left', label: 'Left' },
    { op: 'hcenter', label: 'Center' },
    { op: 'right', label: 'Right' },
    { op: 'top', label: 'Top' },
    { op: 'vmiddle', label: 'Middle' },
    { op: 'bottom', label: 'Bottom' },
  ]
  const distributeOps: Array<{ axis: DistributeAxis; label: string }> = [
    { axis: 'horizontal', label: 'Distribute H' },
    { axis: 'vertical', label: 'Distribute V' },
  ]
  const reorderOps: Array<{ op: ReorderOp; label: string }> = [
    { op: 'forward', label: 'Forward' },
    { op: 'backward', label: 'Backward' },
    { op: 'front', label: 'To front' },
    { op: 'back', label: 'To back' },
  ]
  // §4.9 rev 0.38: compact-pack sort keys and normalize modes. No chord
  // is assigned (the family is broad and grows with EPIC-016 menus);
  // they ship reachable from this dock surface per the ticket allowance.
  const arrangeOps: Array<{ key: ArrangeSortKey; label: string; tip: string }> = [
    { key: 'default', label: 'Arrange', tip: 'Compact-pack (current order)' },
    { key: 'name', label: 'By name', tip: 'Compact-pack by name' },
    { key: 'importDate', label: 'By date', tip: 'Compact-pack by import order' },
    { key: 'area', label: 'By size', tip: 'Compact-pack largest first' },
  ]
  const normalizeOps: Array<{ mode: NormalizeMode; label: string; tip: string }> = [
    { mode: 'height', label: 'Eq. H', tip: 'Equalize height (median)' },
    { mode: 'width', label: 'Eq. W', tip: 'Equalize width (median)' },
    { mode: 'size', label: 'Eq. size', tip: 'Equalize size (median)' },
    { mode: 'area', label: 'Eq. area', tip: 'Equalize area (median)' },
  ]

  let activeTool = $state<ToolKind>(handle.tools.active)
  let lastShapeKind = $state<ToolKind>('rect')
  let shapeFlyoutOpen = $state(false)
  let zoomPct = $state(Math.round(handle.controller.camera.zoom * 100))

  let stroke = $state(handle.tools.style.stroke)
  let fill = $state<string | null>(handle.tools.style.fill)
  let textColor = $state(handle.tools.style.textColor)
  let strokeScale = $state(handle.tools.style.strokeScale)

  let selected = $state<SceneDecoration[]>([])
  let selectionCount = $state(handle.controller.selection.size)
  // §4.9 frame actions (AI-IMP-129): the single selected frame (a
  // placement with the 'frame' appearance), and its sort-on-drop flag.
  let selectedFrameId = $state<string | null>(null)
  let sortOnDrop = $state(true)

  // §4.9 rev 0.13: installed fonts, enumerated lazily on the picker's
  // first user gesture; curated stacks until then (and on failure).
  let fontOptions = $state<FontOption[]>(FONT_STACKS)
  let fontsLoaded = false
  function ensureFonts(): void {
    if (fontsLoaded) return
    fontsLoaded = true
    void loadFontOptions().then((options) => (fontOptions = options))
  }

  function currentFrameId(): string | null {
    const items = handle.controller.selectedItems()
    if (items.length !== 1) return null
    const item = items[0]!
    return item.itemKind === 'placement' && item.appearanceKind === 'frame' ? item.id : null
  }

  function refresh(): void {
    selected = ui.selectedDecorations()
    selectionCount = handle.controller.selection.size
    const frameId = currentFrameId()
    if (frameId !== selectedFrameId) {
      selectedFrameId = frameId
      if (frameId) {
        void tooling.frameSortOnDrop(frameId).then((on) => {
          if (selectedFrameId === frameId) sortOnDrop = on
        })
      }
    }
  }

  function toggleSortOnDrop(): void {
    const id = selectedFrameId
    if (!id) return
    const next = !sortOnDrop
    sortOnDrop = next
    void tooling.setFrameSortOnDrop(id, next)
  }

  $effect(() => {
    const offTool = handle.tools.onChanged((tool) => {
      activeTool = tool
      if (SHAPE_KINDS.some((s) => s.kind === tool)) lastShapeKind = tool
    })
    const offSelection = handle.controller.selection.onChanged(() => refresh())
    // Deterministic (AI-IMP-054): the host signals every applied scene.
    const offScene = handle.onSceneApplied(() => refresh())
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
    refresh()
    return () => {
      offTool()
      offSelection()
      offScene()
      offCamera()
      window.removeEventListener('keydown', onKeydown)
    }
  })

  $effect(() => {
    handle.tools.style.stroke = stroke
    handle.tools.style.fill = fill
    handle.tools.style.textColor = textColor
    handle.tools.style.strokeScale = strokeScale
  })

  const shapeActive = $derived(SHAPE_KINDS.some((s) => s.kind === activeTool))
  const shapeGlyph = $derived(
    SHAPE_KINDS.find((s) => s.kind === (shapeActive ? activeTool : lastShapeKind))?.glyph ?? '▭',
  )
  const hasGroup = $derived(selected.some((d) => d.groupId !== null))
  const allLocked = $derived(selected.length > 0 && selected.every((d) => d.locked === 1))
  const toolOptionsVisible = $derived(
    activeTool !== 'select' && activeTool !== 'pin' && activeTool !== 'frame',
  )

  function setTool(kind: ToolKind): void {
    handle.tools.setTool(kind)
    shapeFlyoutOpen = false
  }

  function zoomBy(factor: number): void {
    const bounds = hostElement.getBoundingClientRect()
    handle.controller.camera.zoomAt({ x: bounds.width / 2, y: bounds.height / 2 }, factor)
  }

  function run(action: () => Promise<void>): void {
    // The commit's project-changed → scene-applied signal refreshes us.
    void action()
  }

  // §4.9 rev 0.12: whole-object type controls for a single selected
  // text decoration; bounds re-measured through the same DOM metrics
  // the entry overlay uses.
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
      // Compose from FRESH data, not this component's snapshot
      // (AI-IMP-049 lesson): two quick edits would otherwise silently
      // revert the first one.
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

  // §4.9 rev 0.16 / AI-IMP-055: drawn decorations stay restylable
  // after placement. Stroke-bearing kinds only; text has its own row.
  const STYLED_KINDS = new Set(['shape', 'line', 'arrow', 'path', 'connector'])
  const selectedStyled = $derived(selected.filter((d) => STYLED_KINDS.has(d.kind)))
  const styledLead = $derived(
    selectedStyled.length > 0
      ? (selectedStyled[0]!.data as {
          stroke?: string
          strokeWidth?: number
          fill?: string
          cornerRadius?: number
          shape?: string
        })
      : null,
  )
  const selectedRects = $derived(
    selectedStyled.filter((d) => d.kind === 'shape' && (d.data as { shape?: string }).shape === 'rect'),
  )
  const selectedShapes = $derived(selectedStyled.filter((d) => d.kind === 'shape'))

  /** One UpdateDecoration per eligible selected decoration, each
   * composed from FRESH data (AI-IMP-049 lesson). `fill` and
   * `cornerRadius` only apply where they mean something. */
  function updateStyled(patch: {
    stroke?: string
    strokeWidth?: number
    fill?: string | null
    cornerRadius?: number
  }): void {
    const targets = selectedStyled.map((d) => ({ id: d.id, kind: d.kind }))
    if (targets.length === 0) return
    run(async () => {
      const response = await window.ew.project.query('getCanvasContents', {
        canvasId: handle.canvasId,
      })
      if (!response.ok) return
      const byId = new Map(
        (response.result as Array<{ id: string; data?: unknown }>).map((item) => [item.id, item]),
      )
      for (const target of targets) {
        const fresh = byId.get(target.id)
        if (!fresh || typeof fresh.data !== 'object' || fresh.data === null) continue
        const base = fresh.data as Record<string, unknown>
        const isShape = target.kind === 'shape'
        const isRect = isShape && base['shape'] === 'rect'
        const next: Record<string, unknown> = { ...base }
        if (patch.stroke !== undefined) next['stroke'] = patch.stroke
        if (patch.strokeWidth !== undefined) next['strokeWidth'] = patch.strokeWidth
        if (patch.fill !== undefined && isShape) {
          if (patch.fill === null) delete next['fill']
          else next['fill'] = patch.fill
        }
        if (patch.cornerRadius !== undefined && isRect) next['cornerRadius'] = patch.cornerRadius
        await handle.gateway.execute('UpdateDecoration', {
          decorationId: target.id,
          set: { data: next },
        })
      }
    })
  }
</script>

<div class="dock-stack" data-testid="dock">
  {#if toolOptionsVisible}
    <div class="dock-row contextual" data-testid="tool-options">
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
          value={fill ?? themeTokenValue('--ew-color-input-empty')}
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
  {/if}

  {#if styledLead}
    <div class="dock-row contextual" data-testid="selection-style-controls">
      <label>
        Stroke
        <input
          type="color"
          data-testid="sel-stroke"
          value={styledLead.stroke ?? themeTokenValue('--ew-text')}
          onchange={(e) => updateStyled({ stroke: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
      <label>
        Width
        <input
          type="number"
          min="0.1"
          step="0.5"
          data-testid="sel-stroke-width"
          value={styledLead.strokeWidth ?? 2}
          onchange={(e) => {
            const width = Number((e.currentTarget as HTMLInputElement).value)
            if (Number.isFinite(width) && width > 0) updateStyled({ strokeWidth: width })
          }}
        />
      </label>
      {#if selectedShapes.length > 0}
        <label>
          Fill
          <input
            type="color"
            data-testid="sel-fill"
            value={styledLead.fill ?? themeTokenValue('--ew-color-input-empty')}
            onchange={(e) => updateStyled({ fill: (e.currentTarget as HTMLInputElement).value })}
          />
          <button type="button" data-testid="sel-fill-none" onclick={() => updateStyled({ fill: null })}>
            none
          </button>
        </label>
      {/if}
      {#if selectedRects.length > 0}
        <label>
          Round %
          <input
            type="number"
            min="0"
            max="100"
            step="5"
            data-testid="sel-rounding"
            value={Math.round((styledLead.cornerRadius ?? 0) * 100)}
            onchange={(e) => {
              const percent = Number((e.currentTarget as HTMLInputElement).value)
              if (Number.isFinite(percent) && percent >= 0 && percent <= 100)
                updateStyled({ cornerRadius: percent / 100 })
            }}
          />
        </label>
      {/if}
    </div>
  {/if}

  {#if textData}
    <div class="dock-row contextual" data-testid="text-style-controls">
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

  {#if selectionCount > 0}
    <div class="dock-row contextual" data-testid="selection-controls">
      {#each reorderOps as entry (entry.op)}
        <button
          type="button"
          data-testid={`order-${entry.op}`}
          onclick={() => void tooling.reorder(entry.op)}
          use:tooltip={{ name: entry.label }}
        >
          {entry.label}
        </button>
      {/each}
      {#each alignOps as entry (entry.op)}
        <button
          type="button"
          data-testid={`align-${entry.op}`}
          disabled={selectionCount < 2}
          onclick={() => void tooling.align(entry.op)}
          use:tooltip={{ name: `Align ${entry.label.toLowerCase()}` }}
        >
          {entry.label}
        </button>
      {/each}
      {#each distributeOps as entry (entry.axis)}
        <button
          type="button"
          data-testid={`distribute-${entry.axis}`}
          disabled={selectionCount < 3}
          onclick={() => void tooling.distribute(entry.axis)}
          use:tooltip={{ name: entry.label }}
        >
          {entry.label}
        </button>
      {/each}
      {#each arrangeOps as entry (entry.key)}
        <button
          type="button"
          data-testid={`arrange-${entry.key}`}
          disabled={selectionCount < 2}
          onclick={() => void tooling.arrange(entry.key)}
          use:tooltip={{ name: entry.tip }}
        >
          {entry.label}
        </button>
      {/each}
      {#each normalizeOps as entry (entry.mode)}
        <button
          type="button"
          data-testid={`normalize-${entry.mode}`}
          disabled={selectionCount < 2}
          onclick={() => void tooling.normalize(entry.mode)}
          use:tooltip={{ name: entry.tip }}
        >
          {entry.label}
        </button>
      {/each}
      <button
        type="button"
        data-testid="zoom-selection"
        onclick={() => tooling.zoomToSelection()}
        use:tooltip={{ name: 'Zoom to selection' }}
      >
        Zoom selection
      </button>
      {#if selected.length > 0}
        <span class="count">{selected.length} selected</span>
        <button
          type="button"
          data-testid="deco-group"
          disabled={selected.length < 2}
          onclick={() => run(() => ui.groupSelection())}
          use:tooltip={{ name: 'Group decorations' }}
        >
          Group
        </button>
        <button
          type="button"
          data-testid="deco-ungroup"
          disabled={!hasGroup}
          onclick={() => run(() => ui.ungroupSelection())}
          use:tooltip={{ name: 'Ungroup decorations' }}
        >
          Ungroup
        </button>
        <button
          type="button"
          data-testid="deco-lock"
          onclick={() => run(() => ui.setLockedOnSelection(!allLocked))}
          use:tooltip={{ name: allLocked ? 'Unlock decorations' : 'Lock decorations' }}
        >
          {allLocked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          data-testid="deco-hide"
          onclick={() => run(() => ui.hideSelection())}
          use:tooltip={{ name: 'Hide decorations' }}
        >
          Hide
        </button>
      {/if}
    </div>
  {/if}

  {#if selectedFrameId}
    <div class="dock-row contextual" data-testid="frame-actions">
      <button
        type="button"
        data-testid="frame-sort"
        onclick={() => void tooling.sortFrame(selectedFrameId!)}
        use:tooltip={{ name: 'Compact-pack this frame’s contents' }}
      >
        Sort in frame
      </button>
      <button
        type="button"
        class:active={sortOnDrop}
        data-testid="frame-sort-on-drop"
        aria-pressed={sortOnDrop}
        onclick={toggleSortOnDrop}
        use:tooltip={{ name: 'Arrange items dropped into this frame' }}
      >
        Sort on drop: {sortOnDrop ? 'On' : 'Off'}
      </button>
      <button
        type="button"
        data-testid="frame-load"
        onclick={() => tooling.loadIntoFrame(selectedFrameId!)}
        use:tooltip={{ name: 'Add items from the library into this frame' }}
      >
        Add from library
      </button>
    </div>
  {/if}

  {#if shapeFlyoutOpen}
    <div class="dock-row flyout" data-testid="shape-flyout">
      {#each SHAPE_KINDS as shape (shape.kind)}
        <button
          type="button"
          class:active={activeTool === shape.kind}
          data-testid={`tool-${shape.kind}`}
          onclick={() => setTool(shape.kind)}
          use:tooltip={{ name: shape.label }}
        >
          <span class="glyph">{shape.glyph}</span>
          {shape.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="dock-row main">
    {#each PLAIN_TOOLS as tool (tool.kind)}
      <button
        type="button"
        class="tool"
        class:active={activeTool === tool.kind}
        data-testid={`tool-${tool.kind}`}
        onclick={() => setTool(tool.kind)}
        use:tooltip={{ name: tool.label, shortcut: formatBinding(tool.key) }}
      >
        {tool.glyph}
      </button>
    {/each}
    <button
      type="button"
      class="tool"
      class:active={shapeActive}
      data-testid="dock-shape"
      onclick={() => (shapeFlyoutOpen = !shapeFlyoutOpen)}
      use:tooltip={{ name: 'Shapes', shortcut: formatBinding(KEY.toolShapes) }}
    >
      {shapeGlyph}
    </button>
    {#each DRAW_TOOLS as tool (tool.kind)}
      <button
        type="button"
        class="tool"
        class:active={activeTool === tool.kind}
        data-testid={`tool-${tool.kind}`}
        onclick={() => setTool(tool.kind)}
        use:tooltip={{ name: tool.label, shortcut: formatBinding(tool.key) }}
      >
        {tool.glyph}
      </button>
    {/each}
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
      use:tooltip={{ name: 'Zoom to fit' }}
    >
      ⤢
    </button>
  </div>
</div>

<style>
  .dock-stack {
    position: absolute;
    bottom: 0.6rem;
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

  .tool {
    min-width: 1.9rem;
    height: 1.9rem;
    display: inline-grid;
    place-items: center;
    font-size: 0.95rem;
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

  .count {
    opacity: 0.7;
    margin: 0 0.2rem;
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

  label {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  input[type='color'] {
    width: 1.6rem;
    height: 1.3rem;
    padding: 0;
    border: 1px solid var(--ew-border-strong);
    background: transparent;
  }

  input[type='number'] {
    width: 3rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
  }

  select {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
  }
</style>
