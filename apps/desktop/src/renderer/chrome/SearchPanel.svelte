<!--
  ⌕ panel (RFC §8.3, AI-IMP-073): panel physics over the canvas,
  anchored to the rail charm. Search mode runs debounced searchProject
  over the four corpora into labeled kind groups; one flat keyboard
  cursor (ArrowUp/Down) walks every activatable row across groups and
  Enter activates. Activation per kind: note → note panel; tag → the
  tag panel (§4.8's third door); asset filename → the row expands into
  its using nodes' placement locations, each a fly-to (cross-canvas is
  a §8.1 navigation event first, then the workspace center seam);
  canvas text → navigate to the containing canvas, then center the
  decoration through the same seam (it waits for the scene, bounded).
  A leading # flips the field to tag mode with name completion — a
  CUSTOM list, never <datalist> (native popup segfaults hidden e2e
  windows, AI-IMP-069). Quick-open mode (Mod+P) runs quickOpen over
  title_key: no groups, no # handling; Enter opens the note panel or
  navigates to the canvas as a history entry.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import TextInput from '../ui/TextInput.svelte'
  import { requestCenterPlacements, requestOpenNote } from '../note/open-note'
  import { openTagPanel } from '../tags/tag-panel'
  import { navigateTo } from './navigation'
  import { closeSearchPanel, type SearchPanelState } from './search'

  // Read-model shapes (persistence queries-search / queries-structure).
  interface SearchResults {
    notes: Array<{ noteId: string; title: string; snippet: string }>
    tags: Array<{ tagId: string; name: string }>
    assets: Array<{ assetId: string; filename: string; usingNodeIds: string[] }>
    canvasText: Array<{ decorationId: string; canvasId: string; snippet: string }>
  }
  interface QuickOpenEntry {
    kind: 'note' | 'canvas'
    id: string
    canvasId?: string
    label: string
  }
  interface NodeLocations {
    nodeId: string
    label: string
    placements: Array<{ placementId: string; canvasId: string; canvasLabel: string }>
  }

  type Row =
    | { group: 'Notes'; kind: 'note'; id: string; label: string; detail: string }
    | { group: 'Tags'; kind: 'tag'; id: string; label: string; detail: '' }
    | { group: 'Assets'; kind: 'asset'; id: string; label: string; detail: string }
    | {
        group: 'Assets'
        kind: 'asset-loc'
        id: string
        label: string
        detail: string
        placementId: string
        canvasId: string
        canvasLabel: string
      }
    | {
        group: 'Assets'
        kind: 'asset-bg'
        id: string
        label: string
        detail: string
        canvasId: string
        canvasLabel: string
      }
    | { group: 'Canvas text'; kind: 'canvas-text'; id: string; label: string; detail: string; canvasId: string }
    | { group: 'Tags'; kind: 'tag-completion'; id: string; label: string; detail: '' }
    | { group: 'Quick open'; kind: 'quick'; id: string; label: string; detail: string; entry: QuickOpenEntry }

  const {
    handle,
    hostElement,
    panel,
  }: { handle: CanvasHostHandle; hostElement: HTMLElement; panel: SearchPanelState } = $props()

  let query = $state('')
  let results = $state<SearchResults | null>(null)
  let quick = $state<QuickOpenEntry[]>([])
  let allTags = $state<Array<{ id: string; name: string }>>([])
  let expanded = $state<Record<string, NodeLocations[]>>({})
  let cursor = $state(0)
  let inputEl = $state<HTMLInputElement | null>(null)
  let listEl = $state<HTMLElement | null>(null)

  const PANEL_WIDTH = 340

  // Same §8.5 point grammar as the tag panel: client coords of the
  // summoning charm, clamped into the host; the panel hangs to the
  // charm's left (the rail lives at the right edge). Mod+P (no
  // anchor) centers near the top, quick-switcher style.
  const pos = $derived.by(() => {
    const bounds = hostElement.getBoundingClientRect()
    if (!panel.anchor) return { x: Math.max(8, bounds.width / 2 - PANEL_WIDTH / 2), y: 64 }
    const x = Math.min(
      Math.max(8, panel.anchor.x - bounds.left - PANEL_WIDTH - 8),
      bounds.width - PANEL_WIDTH - 8,
    )
    const y = Math.min(Math.max(8, panel.anchor.y - bounds.top), bounds.height - 320)
    return { x, y }
  })

  const tagMode = $derived(panel.mode === 'search' && query.startsWith('#'))

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  // Reopen/re-target replaces the state: fresh field, fresh focus.
  $effect(() => {
    void panel // identity dependency: every open call resets
    query = ''
    results = null
    quick = []
    expanded = {}
    cursor = 0
    void runQuery<Array<{ id: string; name: string }>>('listTags').then((tags) => {
      allTags = tags
    })
    setTimeout(() => inputEl?.focus(), 0)
  })

  // Debounced query per keystroke; tag mode is client-side over the
  // vocabulary. Stale responses are dropped (the field moved on).
  $effect(() => {
    const q = query
    const mode = panel.mode
    if (mode === 'search' && q.startsWith('#')) return
    const timer = setTimeout(() => {
      void (async () => {
        if (q.trim().length === 0) {
          results = null
          quick = []
          return
        }
        if (mode === 'quick') {
          const entries = await runQuery<QuickOpenEntry[]>('quickOpen', { query: q })
          if (query === q && panel.mode === mode) {
            quick = entries
            cursor = 0
          }
        } else {
          const next = await runQuery<SearchResults>('searchProject', { query: q })
          if (query === q && panel.mode === mode) {
            results = next
            expanded = {}
            cursor = 0
          }
        }
      })()
    }, 120)
    return () => clearTimeout(timer)
  })

  const completions = $derived.by(() => {
    if (!tagMode) return []
    const needle = query.slice(1).trim().toLowerCase()
    return allTags.filter((tag) => tag.name.toLowerCase().startsWith(needle))
  })

  const rows = $derived.by((): Row[] => {
    if (panel.mode === 'quick') {
      return quick.map((entry) => ({
        group: 'Quick open' as const,
        kind: 'quick' as const,
        id: `${entry.kind}-${entry.id}`,
        label: entry.label,
        detail: entry.kind === 'canvas' ? 'canvas' : 'note',
        entry,
      }))
    }
    if (tagMode) {
      return completions.map((tag) => ({
        group: 'Tags' as const,
        kind: 'tag-completion' as const,
        id: tag.id,
        label: tag.name,
        detail: '' as const,
      }))
    }
    if (!results) return []
    const flat: Row[] = []
    for (const note of results.notes)
      flat.push({ group: 'Notes', kind: 'note', id: note.noteId, label: note.title, detail: note.snippet })
    for (const tag of results.tags)
      flat.push({ group: 'Tags', kind: 'tag', id: tag.tagId, label: tag.name, detail: '' })
    for (const asset of results.assets) {
      const parts = [`${asset.usingNodeIds.length} node${asset.usingNodeIds.length === 1 ? '' : 's'}`]
      if (asset.usingCanvases.length > 0)
        parts.push(
          `${asset.usingCanvases.length} background${asset.usingCanvases.length === 1 ? '' : 's'}`,
        )
      flat.push({
        group: 'Assets',
        kind: 'asset',
        id: asset.assetId,
        label: asset.filename,
        detail: parts.join(' · '),
      })
      // Background usage renders directly from the result — canvases
      // are navigable without the per-node location fetch.
      if (expanded[asset.assetId])
        for (const bg of asset.usingCanvases)
          flat.push({
            group: 'Assets',
            kind: 'asset-bg',
            id: `bg-${bg.canvasId}`,
            label: bg.canvasLabel,
            detail: 'background',
            canvasId: bg.canvasId,
            canvasLabel: bg.canvasLabel,
          })
      for (const node of expanded[asset.assetId] ?? []) {
        for (const placement of node.placements) {
          flat.push({
            group: 'Assets',
            kind: 'asset-loc',
            id: placement.placementId,
            label: node.label,
            detail: placement.canvasLabel,
            placementId: placement.placementId,
            canvasId: placement.canvasId,
            canvasLabel: placement.canvasLabel,
          })
        }
        if (node.placements.length === 0)
          flat.push({
            group: 'Assets',
            kind: 'asset-loc',
            id: `loose-${node.nodeId}`,
            label: node.label,
            detail: 'loose',
            placementId: '',
            canvasId: '',
            canvasLabel: '',
          })
      }
    }
    for (const hit of results.canvasText)
      flat.push({
        group: 'Canvas text',
        kind: 'canvas-text',
        id: hit.decorationId,
        label: hit.snippet,
        detail: '',
        canvasId: hit.canvasId,
      })
    return flat
  })

  /** §8.3 activation per kind. Asset rows expand in place; everything
   * else acts and closes the panel. */
  async function activate(row: Row): Promise<void> {
    switch (row.kind) {
      case 'note':
        requestOpenNote(row.id)
        closeSearchPanel()
        break
      case 'tag':
      case 'tag-completion':
        // The §4.8 third door: land the tag panel where this one was.
        openTagPanel(row.id, panel.anchor)
        closeSearchPanel()
        break
      case 'asset': {
        if (expanded[row.id]) {
          const next = { ...expanded }
          delete next[row.id]
          expanded = next
          break
        }
        const asset = results?.assets.find((a) => a.assetId === row.id)
        if (!asset) break
        const nodes = await Promise.all(
          asset.usingNodeIds.map((nodeId) =>
            runQuery<NodeLocations | null>('getNodeLocations', { nodeId }),
          ),
        )
        expanded = { ...expanded, [row.id]: nodes.filter((n): n is NodeLocations => n !== null) }
        break
      }
      case 'asset-loc':
        if (row.placementId === '') break // loose node: nowhere to fly
        if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, row.canvasLabel)
        requestCenterPlacements([row.placementId])
        closeSearchPanel()
        break
      case 'asset-bg':
        // A background is the canvas itself: open it, nothing to center.
        if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, row.canvasLabel)
        closeSearchPanel()
        break
      case 'canvas-text':
        // §8.3: open the containing canvas centered on the decoration.
        // The workspace center seam matches scene items by id —
        // decorations included — and waits (bounded) for the
        // destination scene after a cross-canvas navigateTo.
        if (row.canvasId !== handle.canvasId) await navigateTo(row.canvasId, 'Board')
        requestCenterPlacements([row.id])
        closeSearchPanel()
        break
      case 'quick':
        if (row.entry.kind === 'note') requestOpenNote(row.entry.id)
        else if (row.entry.canvasId) await navigateTo(row.entry.canvasId, row.entry.label)
        closeSearchPanel()
        break
    }
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      cursor = Math.min(Math.max(0, cursor + delta), Math.max(0, rows.length - 1))
      listEl?.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const row = rows[cursor] ?? rows[0]
      if (row) void activate(row)
    }
  }

  // Escape closes and CONSUMES the press (capture, same pattern as
  // the tag panel) so the host does not also clear the selection or
  // drop a tool underneath.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeSearchPanel()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<div class="search-panel" data-testid="search-panel" data-mode={panel.mode} style={`left:${pos.x}px;top:${pos.y}px`}>
  <header>
    <span class="glyph">{panel.mode === 'quick' ? '»' : '⌕'}</span>
    <TextInput
      variant="pill"
      data-testid="search-input"
      placeholder={panel.mode === 'quick' ? 'open by title…' : 'search — # for tags…'}
      style="flex: 1; min-width: 0"
      bind:ref={inputEl}
      bind:value={query}
      onkeydown={onInputKeydown}
    />
    <button
      type="button"
      class="close"
      data-testid="search-close"
      aria-label="Close"
      onclick={closeSearchPanel}
    >
      ✕
    </button>
  </header>

  {#if rows.length > 0}
    <ul class="results" bind:this={listEl} role="listbox">
      {#each rows as row, index (`${row.kind}-${row.id}`)}
        {#if row.group !== rows[index - 1]?.group && panel.mode === 'search' && !tagMode}
          <li class="group-label" data-testid={`search-group-${row.group}`}>{row.group}</li>
        {/if}
        <li>
          <button
            type="button"
            class="row"
            class:cursor={index === cursor}
            class:nested={row.kind === 'asset-loc' || row.kind === 'asset-bg'}
            role="option"
            aria-selected={index === cursor}
            data-testid="search-hit"
            data-kind={row.kind}
            data-id={row.id}
            onclick={() => void activate(row)}
          >
            {#if row.kind === 'asset'}
              <span class="twist">{expanded[row.id] ? '▾' : '▸'}</span>
            {:else if row.kind === 'asset-loc'}
              <span class="twist">⌖</span>
            {:else if row.kind === 'asset-bg'}
              <span class="twist">▣</span>
            {/if}
            <span class="label">{row.label}</span>
            {#if row.detail}
              <span class="detail">{row.detail}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else if query.trim().length > 0 && !tagMode}
    <p class="empty" data-testid="search-empty">No matches.</p>
  {/if}
</div>

<style>
  .search-panel {
    position: absolute;
    /* rung: popover (Z.popover = 500). Was a pre-ladder 9; §8.3
       quick-open floats over panels and chrome alike. */
    z-index: 500;
    width: 340px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    padding: 0.45rem 0.55rem 0.55rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 9px;
    box-shadow: 0 6px 22px var(--ew-shadow);
    pointer-events: auto;
    font-size: 0.78rem;
    color: var(--ew-text);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .glyph {
    flex: none;
    color: var(--ew-text-muted);
    font-weight: 600;
  }

  .close {
    flex: none;
    min-width: 22px;
    height: 22px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--ew-text-muted);
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
  }

  .results {
    margin: 0.4rem 0 0;
    padding: 0;
    list-style: none;
    overflow: auto;
  }

  .group-label {
    padding: 0.3rem 0.3rem 0.1rem;
    color: var(--ew-text-muted);
    font-size: 0.62rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.2rem 0.35rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--ew-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--ew-surface-raised);
  }

  .row.cursor {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .row.cursor .detail,
  .row.cursor .twist {
    color: var(--ew-on-accent);
  }

  .row.nested {
    padding-left: 1.1rem;
  }

  .twist {
    flex: none;
    color: var(--ew-text-muted);
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail {
    flex: none;
    margin-left: auto;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ew-text-muted);
    font-size: 0.68rem;
  }

  .empty {
    margin: 0.4rem 0 0;
    color: var(--ew-text-muted);
  }
</style>
