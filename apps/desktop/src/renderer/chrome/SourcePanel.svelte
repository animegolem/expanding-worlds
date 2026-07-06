<!--
  The open-as-source panel (RFC §14.4, AI-IMP-091): "the placement
  picker is the compressed gallery" — a second project opened
  READ-ONLY in the 088 source slot presents as a screen-fixed pinned
  panel (NotePanel's pinned physics: header drag, close is the user's
  act, survives navigation because it is chrome) carrying the same
  facets over a mini thumbnail grid. Dragging a cell out carries
  {contentHash} under SOURCE_ITEM_MIME; the canvas drop handler runs
  090's ingest-by-copy with the session's tag border and places at
  the drop point — this-world material, ordinary in every way.

  The header owns the tag-border decision (none · all · pick): set
  once, applied to every pull, never a per-drag interrupt. Defaults
  by source kind — 'all' when the directory IS the designated
  library (curation facts travel), 'none' from a world (context does
  not). Slot ownership rides the source-slot registry: acquiring
  evicts the gallery's everything scope gracefully, and the gallery
  acquiring evicts this panel — it closes itself.
-->
<script lang="ts">
  import { SOURCE_ITEM_MIME } from '../canvas/import-surfaces'
  import GalleryFacets from '../views/GalleryFacets.svelte'
  import {
    acquireSourceSlot,
    closeSourcePanel,
    releaseSourceSlot,
    setSourceBorder,
  } from './source-slot'

  const { dir }: { dir: string } = $props()

  const SLOT_OWNER = 'source-panel'

  type GalleryKind = 'image' | 'note' | 'board'
  type GallerySort = 'date' | 'name' | 'size'

  interface IndexEntry {
    nodeId: string
    createdAt: string
    kind: GalleryKind
  }

  interface Item {
    nodeId: string
    kind: GalleryKind
    label: string
    contentHash: string | null
    tagNames: string[]
  }

  // ------------------------------------------------ slot lifecycle
  let slotState = $state<'opening' | 'open' | 'error'>('opening')
  let slotError = $state<string | null>(null)
  // Non-reactive fence (GalleryView's scopeEpoch idiom): a retarget
  // mid-open must not let the stale handshake win.
  let openEpoch = 0

  $effect(() => {
    const target = dir
    const epoch = ++openEpoch
    slotState = 'opening'
    slotError = null
    void (async () => {
      const opened = await acquireSourceSlot(SLOT_OWNER, target, () => closeSourcePanel())
      if (epoch !== openEpoch) return
      if (!opened.ok) {
        slotState = 'error'
        slotError = opened.message
        return
      }
      // §14.4 border default by source kind: the designated library
      // carries its curation facts; a world's context stays behind.
      const settings = await window.ew.settings.appAll()
      if (epoch !== openEpoch) return
      applyBorder(settings['libraryProjectDir'] === target ? 'all' : 'none')
      slotState = 'open'
    })()
  })

  // Unmount (close) releases the slot — a no-op if the gallery has
  // meanwhile evicted us — and parks the border on none: no panel,
  // no pulls, no stale decision.
  $effect(() => {
    return () => {
      openEpoch += 1
      releaseSourceSlot(SLOT_OWNER)
      setSourceBorder('none')
    }
  })

  // ------------------------------------------------ tag border UI
  type BorderMode = 'none' | 'all' | 'pick'
  const BORDER_MODES: BorderMode[] = ['none', 'all', 'pick']
  let borderMode = $state<BorderMode>('none')
  let picked = $state<Set<string>>(new Set())
  let sourceTagNames = $state<string[]>([])

  function pushBorder(): void {
    setSourceBorder(borderMode === 'pick' ? [...picked] : borderMode)
  }

  function applyBorder(mode: BorderMode): void {
    borderMode = mode
    if (mode !== 'pick') picked = new Set()
    pushBorder()
    if (mode === 'pick' && sourceTagNames.length === 0) {
      void sourceQuery<Array<{ name: string }>>('galleryTagCounts', {
        kinds: [],
        order: 'name',
      })
        .then((tags) => (sourceTagNames = tags.map((tag) => tag.name)))
        .catch(() => (sourceTagNames = []))
    }
  }

  function togglePick(name: string): void {
    const next = new Set(picked)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    picked = next
    pushBorder()
  }

  // ------------------------------------------------ browse (read-only)
  let sort = $state<GallerySort>('date')
  let kinds = $state<GalleryKind[]>([])
  let tagFilters = $state<Array<{ id: string; name: string }>>([])

  const facetArgs = $derived({
    sort,
    kinds: [...kinds],
    tagIds: tagFilters.map((tag) => tag.id),
    untagged: false,
    unplaced: false,
  })

  async function sourceQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.secondary.query('source', name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  let index = $state<IndexEntry[]>([])
  let loaded = $state(false)
  let items = $state<Record<string, Item>>({})
  let itemsGeneration = 0

  $effect(() => {
    if (slotState !== 'open') return
    const args = facetArgs
    itemsGeneration += 1
    const generation = itemsGeneration
    void sourceQuery<IndexEntry[]>('getGalleryIndex', args)
      .then((next) => {
        if (generation !== itemsGeneration) return
        index = next
        loaded = true
      })
      .catch(() => {
        if (generation !== itemsGeneration) return
        index = []
        loaded = true
      })
  })

  // Lazy hydration: cells announce themselves as they scroll into
  // the mini grid's viewport; visible ids batch into one query per
  // microtask flush (the full gallery virtualizes; the compression
  // observes — same contract, viewport-scaled work).
  const pending = new Set<string>()
  let wanted: string[] = []
  let flushQueued = false

  function flushWanted(): void {
    flushQueued = false
    const nodeIds = wanted.filter((id) => !(id in items) && !pending.has(id))
    wanted = []
    if (nodeIds.length === 0) return
    for (const id of nodeIds) pending.add(id)
    const generation = itemsGeneration
    void sourceQuery<Item[]>('getGalleryItems', { nodeIds })
      .then((fetched) => {
        if (generation !== itemsGeneration) return
        const next = { ...items }
        for (const item of fetched) next[item.nodeId] = item
        items = next
      })
      .catch(() => undefined)
      .then(() => {
        for (const id of nodeIds) pending.delete(id)
      })
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const nodeId = (entry.target as HTMLElement).dataset['nodeId']
      if (nodeId) wanted.push(nodeId)
    }
    if (wanted.length > 0 && !flushQueued) {
      flushQueued = true
      queueMicrotask(flushWanted)
    }
  })
  $effect(() => () => observer.disconnect())

  function lazyItem(element: HTMLElement): { destroy(): void } {
    observer.observe(element)
    return { destroy: () => observer.unobserve(element) }
  }

  /** 089's cross-store URL: ?scope=source re-roots ew-asset at the
   * source slot's managed store. */
  function thumbUrl(item: Item): string {
    return `ew-asset://${item.contentHash}/thumb?scope=source`
  }

  function fallbackToOriginal(event: Event, item: Item): void {
    const img = event.currentTarget as HTMLImageElement
    if (img.dataset['fallback'] === '1') return
    img.dataset['fallback'] = '1'
    img.src = `ew-asset://${item.contentHash}?scope=source`
  }

  /** Drag OUT is the panel's one verb: images carry their content
   * hash across the border; note/board cells (no bytes to hash-copy)
   * do not drag — v1's ingest is asset-shaped (090). */
  function beginCellDrag(event: DragEvent, nodeId: string): void {
    const item = items[nodeId]
    const dt = event.dataTransfer
    if (!item?.contentHash || !dt) {
      event.preventDefault()
      return
    }
    dt.setData(SOURCE_ITEM_MIME, JSON.stringify({ contentHash: item.contentHash }))
    dt.effectAllowed = 'copy'
  }

  // ------------------------------------------------ pinned physics
  // Screen-fixed with a header drag (NotePanel's pinned idiom);
  // closing and moving are the user's acts, nothing auto-dismisses.
  let pos = $state({ x: 14, y: 52 })

  function onHeaderPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    const start = { x: event.clientX, y: event.clientY }
    const origin = { ...pos }
    const onMove = (move: PointerEvent): void => {
      pos = {
        x: origin.x + (move.clientX - start.x),
        y: origin.y + (move.clientY - start.y),
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const dirName = $derived(dir.split(/[/\\]/).filter((part) => part.length > 0).pop() ?? dir)
</script>

<section
  class="source-panel"
  data-testid="source-panel"
  style={`left:${pos.x}px;top:${pos.y}px`}
  aria-label={`Source: ${dirName}`}
>
  <header onpointerdown={onHeaderPointerDown}>
    <span class="title" title={dir}>source · {dirName}</span>
    <button
      type="button"
      class="close"
      data-testid="source-panel-close"
      aria-label="Close source panel"
      onclick={() => closeSourcePanel()}
    >
      ✕
    </button>
  </header>

  {#if slotState === 'error'}
    <p class="state error" data-testid="source-panel-error">{slotError}</p>
  {:else if slotState === 'opening'}
    <p class="state">Opening the source…</p>
  {:else}
    <!-- §14.4 tag border: session-scoped, one decision for every pull. -->
    <div class="border-row" data-testid="source-border">
      <span class="border-label">tags cross:</span>
      <span class="segmented" role="group" aria-label="Tag border">
        {#each BORDER_MODES as mode (mode)}
          <button
            type="button"
            data-testid={`source-border-${mode}`}
            aria-pressed={borderMode === mode}
            class:on={borderMode === mode}
            onclick={() => applyBorder(mode)}
          >
            {mode}
          </button>
        {/each}
      </span>
    </div>
    {#if borderMode === 'pick'}
      <ul class="pick-list" data-testid="source-border-pick-list">
        {#each sourceTagNames as name (name)}
          <li>
            <label>
              <input
                type="checkbox"
                data-testid={`source-border-tag-${name}`}
                checked={picked.has(name)}
                onchange={() => togglePick(name)}
              />
              #{name}
            </label>
          </li>
        {:else}
          <li class="pick-empty">the source has no tags</li>
        {/each}
      </ul>
    {/if}

    <GalleryFacets
      {sort}
      {kinds}
      tags={tagFilters}
      untagged={false}
      unplaced={false}
      queryScope="everything"
      scopeReady={slotState === 'open'}
      showCleanup={false}
      onSort={(next) => (sort = next)}
      onToggleKind={(kind) =>
        (kinds = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind])}
      onAddTag={(tag) => {
        if (!tagFilters.some((t) => t.id === tag.id)) tagFilters = [...tagFilters, tag]
      }}
      onRemoveTag={(tagId) => (tagFilters = tagFilters.filter((t) => t.id !== tagId))}
      onToggleUntagged={() => undefined}
      onToggleUnplaced={() => undefined}
    />

    <div class="grid-scroll" data-testid="source-grid">
      {#if loaded && index.length === 0}
        <p class="state" data-testid="source-empty">Nothing here matches.</p>
      {:else}
        <div class="grid" role="list" aria-label="Source entries">
          {#each index as entry (entry.nodeId)}
            {@const item = items[entry.nodeId]}
            <div
              class="cell"
              data-testid="source-cell"
              data-node-id={entry.nodeId}
              data-kind={entry.kind}
              data-hydrated={item ? 'true' : 'false'}
              draggable={item?.contentHash != null}
              role="listitem"
              use:lazyItem
              ondragstart={(event) => beginCellDrag(event, entry.nodeId)}
            >
              {#if item && item.kind === 'image' && item.contentHash}
                <img
                  src={thumbUrl(item)}
                  alt={item.label}
                  loading="lazy"
                  onerror={(event) => fallbackToOriginal(event, item)}
                />
              {:else if item && item.kind === 'board'}
                <span class="glyph">▣</span>
              {:else if item}
                <span class="mini-label">{item.label}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Pinned-panel chrome (§8.5 grammar): screen-fixed, raised by the
     shadow token — the depth cue — above the takeover cover (z 9)
     and beside the rail's layer. */
  .source-panel {
    position: absolute;
    z-index: 11;
    display: flex;
    flex-direction: column;
    width: 360px;
    max-height: min(72vh, 640px);
    overflow: hidden;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border-strong);
    border-radius: 9px;
    box-shadow: 0 10px 30px var(--ew-shadow);
    pointer-events: auto;
    font-size: 0.78rem;
    color: var(--ew-text);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.4rem 0.4rem 0.7rem;
    border-bottom: 1px solid var(--ew-border);
    cursor: grab;
    user-select: none;
  }

  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close {
    flex: none;
    padding: 0.1rem 0.4rem;
    background: transparent;
    color: var(--ew-text-muted);
    border: none;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: var(--ew-surface-raised);
    color: var(--ew-text);
  }

  .state {
    margin: 0;
    padding: 0.9rem 0.8rem;
    color: var(--ew-text-muted);
  }

  .state.error {
    color: var(--ew-danger);
  }

  .border-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.7rem 0.1rem;
  }

  .border-label {
    color: var(--ew-text-muted);
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    overflow: hidden;
  }

  .segmented button {
    padding: 0.16rem 0.6rem;
    font: inherit;
    background: transparent;
    color: var(--ew-text-muted);
    border: none;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--ew-border);
  }

  .segmented button.on {
    background: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .pick-list {
    margin: 0.25rem 0 0;
    padding: 0 0.7rem;
    list-style: none;
    max-height: 7.5rem;
    overflow-y: auto;
  }

  .pick-list label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.12rem 0;
    cursor: pointer;
  }

  .pick-empty {
    color: var(--ew-text-muted);
    padding: 0.12rem 0;
  }

  .grid-scroll {
    flex: 1;
    min-height: 6rem;
    overflow-y: auto;
    padding: 0.5rem 0.6rem 0.6rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
    gap: 6px;
  }

  .cell {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 6px;
    background: var(--ew-surface-subtle);
    border: 1px solid var(--ew-border);
  }

  .cell[draggable='true'] {
    cursor: grab;
  }

  .cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .glyph {
    font-size: 1.4rem;
    color: var(--ew-text-muted);
  }

  .mini-label {
    padding: 0.2rem 0.3rem;
    font-size: 0.62rem;
    line-height: 1.25;
    color: var(--ew-text);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-align: center;
  }
</style>
