<!--
  Gallery takeover (RFC §14.4, AI-IMP-077): the file-browser
  projection over the project's nodes. A VIRTUALIZED thumbnail grid —
  DOM and hydration scale with the viewport, never the collection —
  grouped into date buckets whose sticky header names where you are
  and opens the period list for random access into deep time (one
  control, two jobs). Thumbnails load over ew-asset://<hash>/thumb
  with a one-line fallback to the original, and repaint as the
  background generator (076) lands derivatives.

  078 adds the retrieval half: a facet strip (sort · kind mask · tag
  filter · cleanup toggles) whose state composes into the index
  query's arguments — filtering happens in SQL, the virtualization
  core is untouched. Buckets are DATE sort's presentation; name and
  size render the flat grid. Note-kind cells are text posts (FR-8):
  title plus a clamped body excerpt, tags on hover.

  079 adds the pointer selection model (rev 0.25): click selects one
  cell and sets the anchor; Shift+click extends the LINEAR
  document-order range from the anchor across bucket boundaries —
  never a rectangle; Mod+click toggles membership without disturbing
  the anchor. A non-empty selection mounts the floating action bar
  (tag · place · trash, GalleryActionBar). Place closes the takeover
  FIRST (070 precedent), then runs every id through the §6.10
  requestPlaceNode seam; a single-cell HTML5 drag-out mirrors the
  outline's beginRowDrag (NODE_DRAG_MIME + close at the cell's
  bounds). Escape peels selection before the takeover's own Escape
  (capture phase). The keyboard model arrives with 080.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { NODE_DRAG_MIME } from '../canvas/import-surfaces'
  import { closeTakeover } from '../chrome/takeover'
  import { requestPlaceNode } from '../note/open-note'
  import GalleryActionBar from './GalleryActionBar.svelte'
  import GalleryFacets from './GalleryFacets.svelte'
  import { bucketByDate, type GalleryBucket } from './gallery-buckets'

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
    appearanceColor: string | null
    contentHash: string | null
    width: number | null
    height: number | null
    childCanvasId: string | null
    noteExcerpt: string | null
    tagNames: string[]
  }

  const CELL = 168
  const GAP = 10
  const PAD = 16
  const HEADER_H = 40
  const OVERSCAN = 400

  let index = $state<IndexEntry[]>([])
  let loaded = $state(false)
  let items = $state<Record<string, Item>>({})
  let thumbNonce = $state<Record<string, number>>({})
  let scroller = $state<HTMLElement | null>(null)
  let viewportWidth = $state(900)
  let viewportHeight = $state(700)
  let scrollTop = $state(0)
  let jumpOpen = $state(false)

  // ------------------------------------------- 079 pointer selection
  // View state (rev 0.25): a set of node ids plus the anchor the
  // Shift range extends from. Document order is the CURRENT index
  // array — whatever sort/filter produced it.
  let selected = $state<Set<string>>(new Set())
  let anchor = $state<string | null>(null)
  let tagOpen = $state(false)

  // ---------------------------------------------------- 078 facets
  // Facet state is view state (§14.4): it composes into the index
  // query's arguments and never writes.
  let sort = $state<GallerySort>('date')
  let kinds = $state<GalleryKind[]>([])
  let tagFilters = $state<Array<{ id: string; name: string }>>([])
  let untagged = $state(false)
  let unplaced = $state(false)

  const facetArgs = $derived({
    sort,
    kinds: [...kinds],
    tagIds: tagFilters.map((tag) => tag.id),
    untagged,
    unplaced,
  })

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(args: typeof facetArgs): Promise<void> {
    try {
      index = await runQuery<IndexEntry[]>('getGalleryIndex', args)
    } catch {
      index = []
    }
    loaded = true
    // A project push (trash, external edits) can retire selected
    // nodes: prune the selection to ids still in the grid. Runs after
    // the await, so these reads are outside the effect's tracking.
    const live = new Set(index.map((entry) => entry.nodeId))
    if ([...selected].some((id) => !live.has(id))) {
      selected = new Set([...selected].filter((id) => live.has(id)))
    }
    if (anchor !== null && !live.has(anchor)) anchor = null
  }

  // A facet change re-queries AND rehomes the viewport: the old
  // scroll offset points into a grid that no longer exists — and so
  // does the selection that referenced it (079).
  $effect(() => {
    void refresh(facetArgs)
    untrack(() => {
      scroller?.scrollTo({ top: 0 })
      scrollTop = 0
      selected = new Set()
      anchor = null
      tagOpen = false
    })
  })
  $effect(() => window.ew.project.onChanged(() => void refresh(facetArgs)))
  // 076's push: a landed derivative repaints its cells by cache-bust.
  $effect(() =>
    window.ew.derivatives.onThumbnailReady(({ contentHash }) => {
      thumbNonce = { ...thumbNonce, [contentHash]: (thumbNonce[contentHash] ?? 0) + 1 }
    }),
  )

  // Buckets are DATE sort's presentation (§14.4): name and size
  // render the flat grid — no headers, no period control.
  const buckets = $derived(sort === 'date' ? bucketByDate(index, new Date()) : [])
  const columns = $derived(
    Math.max(2, Math.floor((viewportWidth - PAD * 2 + GAP) / (CELL + GAP))),
  )

  type Row =
    | { kind: 'header'; bucket: GalleryBucket; top: number }
    | { kind: 'cells'; entries: IndexEntry[]; top: number }

  const layout = $derived.by(() => {
    const rows: Row[] = []
    let top = 0
    if (sort === 'date') {
      for (const bucket of buckets) {
        rows.push({ kind: 'header', bucket, top })
        top += HEADER_H
        const end = bucket.startIndex + bucket.count
        for (let i = bucket.startIndex; i < end; i += columns) {
          rows.push({ kind: 'cells', entries: index.slice(i, Math.min(i + columns, end)), top })
          top += CELL + GAP
        }
      }
    } else {
      top = PAD
      for (let i = 0; i < index.length; i += columns) {
        rows.push({ kind: 'cells', entries: index.slice(i, i + columns), top })
        top += CELL + GAP
      }
    }
    return { rows, totalHeight: top + PAD }
  })

  const visibleRows = $derived(
    layout.rows.filter((row) => {
      const height = row.kind === 'header' ? HEADER_H : CELL + GAP
      return row.top + height >= scrollTop - OVERSCAN && row.top <= scrollTop + viewportHeight + OVERSCAN
    }),
  )

  // The sticky header names the bucket the viewport is inside.
  const currentBucket = $derived.by(() => {
    let current: GalleryBucket | null = buckets[0] ?? null
    for (const row of layout.rows) {
      if (row.kind !== 'header') continue
      if (row.top <= scrollTop + HEADER_H) current = row.bucket
      else break
    }
    return current
  })

  // Hydrate exactly the visible window; in-flight ids are not
  // re-requested. Item records are immutable per node, so a stale
  // response can never clobber a fresher one.
  const pending = new Set<string>()
  $effect(() => {
    const wanted: string[] = []
    for (const row of visibleRows) {
      if (row.kind !== 'cells') continue
      for (const entry of row.entries) {
        if (!(entry.nodeId in items) && !pending.has(entry.nodeId)) wanted.push(entry.nodeId)
      }
    }
    if (wanted.length === 0) return
    for (const id of wanted) pending.add(id)
    void runQuery<Item[]>('getGalleryItems', { nodeIds: wanted })
      .then((fetched) => {
        const next = { ...items }
        for (const item of fetched) next[item.nodeId] = item
        items = next
      })
      .catch(() => undefined)
      .then(() => {
        for (const id of wanted) pending.delete(id)
      })
  })

  function thumbUrl(item: Item): string {
    const nonce = thumbNonce[item.contentHash ?? ''] ?? 0
    return `ew-asset://${item.contentHash}/thumb${nonce > 0 ? `?v=${nonce}` : ''}`
  }

  /** 076's contract: a missing thumbnail 404s → fall back to the
   * original bytes, once (the flag stops an error loop). */
  function fallbackToOriginal(event: Event, item: Item): void {
    const img = event.currentTarget as HTMLImageElement
    if (img.dataset['fallback'] === '1') return
    img.dataset['fallback'] = '1'
    img.src = `ew-asset://${item.contentHash}`
  }

  function jumpTo(bucket: GalleryBucket): void {
    jumpOpen = false
    const row = layout.rows.find((r) => r.kind === 'header' && r.bucket.key === bucket.key)
    if (row && scroller) scroller.scrollTo({ top: row.top })
  }

  function onScroll(): void {
    if (scroller) scrollTop = scroller.scrollTop
  }

  // ------------------------------------------- 079 selection gestures
  /** Rev 0.25 mouse model: plain click selects only this cell and
   * sets the anchor; Shift+click selects the linear document-order
   * range from the anchor (bucket boundaries are invisible to it);
   * Mod+click toggles membership without disturbing the anchor. A
   * Shift+click with no live anchor degrades to a plain click. */
  function onCellClick(event: MouseEvent, nodeId: string): void {
    if (event.shiftKey && anchor !== null) {
      const from = index.findIndex((entry) => entry.nodeId === anchor)
      const to = index.findIndex((entry) => entry.nodeId === nodeId)
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from <= to ? [from, to] : [to, from]
        selected = new Set(index.slice(lo, hi + 1).map((entry) => entry.nodeId))
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      const next = new Set(selected)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      selected = next
      return
    }
    selected = new Set([nodeId])
    anchor = nodeId
  }

  function clearSelection(): void {
    selected = new Set()
    anchor = null
    tagOpen = false
  }

  // Escape peels one layer per press (rev 0.25), BEFORE the takeover
  // layer's window-level close listener: capture phase, the TagPanel
  // pattern. Field open → close it; selection → clear it; empty →
  // decline, and the takeover closes as today.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (tagOpen) {
        event.preventDefault()
        event.stopPropagation()
        tagOpen = false
        return
      }
      if (selected.size > 0) {
        event.preventDefault()
        event.stopPropagation()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  /** §6.10 place for the whole selection: close the takeover FIRST
   * (070 precedent — the user watches the result land), then request
   * one placement per id in selection order. The workspace owns the
   * commits, the cascade offsets, and failure toasts. */
  function placeSelection(): void {
    const ids = [...selected]
    if (ids.length === 0) return
    closeTakeover()
    for (const id of ids) requestPlaceNode(id)
  }

  /**
   * Cell dragstart, mirroring OutlineView's beginRowDrag: set the
   * import-surface payload and watch the drag — the moment the
   * pointer leaves the originating cell's bounds (§6.10's operative
   * "sheet edge"), the takeover closes so the board can receive the
   * drop.
   */
  function beginCellDrag(event: DragEvent, nodeId: string): void {
    const dt = event.dataTransfer
    if (!dt) return
    dt.setData(NODE_DRAG_MIME, nodeId)
    dt.effectAllowed = 'copy'
    const cell = event.currentTarget as HTMLElement
    const edge = cell.getBoundingClientRect()
    const stop = (): void => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragend', stop)
      window.removeEventListener('drop', stop)
    }
    const onDragOver = (over: DragEvent): void => {
      const inside =
        over.clientX >= edge.left &&
        over.clientX <= edge.right &&
        over.clientY >= edge.top &&
        over.clientY <= edge.bottom
      if (inside) return
      stop()
      closeTakeover()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragend', stop)
    window.addEventListener('drop', stop)
  }
</script>

<div class="gallery" data-testid="gallery-view">
  <GalleryFacets
    {sort}
    {kinds}
    tags={tagFilters}
    {untagged}
    {unplaced}
    onSort={(next) => (sort = next)}
    onToggleKind={(kind) =>
      (kinds = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind])}
    onAddTag={(tag) => {
      if (!tagFilters.some((t) => t.id === tag.id)) tagFilters = [...tagFilters, tag]
    }}
    onRemoveTag={(tagId) => (tagFilters = tagFilters.filter((t) => t.id !== tagId))}
    onToggleUntagged={() => (untagged = !untagged)}
    onToggleUnplaced={() => (unplaced = !unplaced)}
  />

  {#if currentBucket}
    <div class="current-header">
      <button
        type="button"
        class="period"
        data-testid="gallery-period"
        aria-expanded={jumpOpen}
        onclick={() => (jumpOpen = !jumpOpen)}
      >
        {currentBucket.label} ▾
      </button>
      {#if jumpOpen}
        <ul class="period-list" data-testid="gallery-period-list">
          {#each buckets as bucket (bucket.key)}
            <li>
              <button type="button" onclick={() => jumpTo(bucket)}>
                {bucket.label} <span class="count">{bucket.count}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div
    class="scroller"
    data-testid="gallery-scroller"
    bind:this={scroller}
    bind:clientWidth={viewportWidth}
    bind:clientHeight={viewportHeight}
    onscroll={onScroll}
  >
    {#if loaded && index.length === 0}
      <p class="empty" data-testid="gallery-empty">
        {#if kinds.length > 0 || tagFilters.length > 0 || untagged || unplaced}
          Nothing matches the current filters.
        {:else}
          Nothing here yet — anything imported or created lands in the gallery.
        {/if}
      </p>
    {:else}
      <div
        class="canvas"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Gallery items"
        style={`height: ${layout.totalHeight}px`}
      >
        {#each visibleRows as row (row.kind === 'header' ? `h-${row.bucket.key}` : `r-${row.entries[0]?.nodeId}`)}
          {#if row.kind === 'header'}
            <h2
              class="bucket-header"
              data-testid="gallery-bucket"
              data-bucket={row.bucket.key}
              style={`top: ${row.top}px`}
            >
              {row.bucket.label}
            </h2>
          {:else}
            <div class="row" style={`top: ${row.top}px`}>
              {#each row.entries as entry (entry.nodeId)}
                {@const item = items[entry.nodeId]}
                <div
                  class="cell"
                  class:selected={selected.has(entry.nodeId)}
                  role="option"
                  tabindex="-1"
                  aria-selected={selected.has(entry.nodeId)}
                  data-testid="gallery-cell"
                  data-node-id={entry.nodeId}
                  data-kind={entry.kind}
                  data-selected={selected.has(entry.nodeId) ? 'true' : 'false'}
                  draggable="true"
                  onclick={(event) => onCellClick(event, entry.nodeId)}
                  ondragstart={(event) => beginCellDrag(event, entry.nodeId)}
                >
                  {#if item && item.kind === 'image' && item.contentHash}
                    <img
                      src={thumbUrl(item)}
                      alt={item.label}
                      loading="lazy"
                      onerror={(event) => fallbackToOriginal(event, item)}
                    />
                    <span class="cell-label">{item.label}</span>
                  {:else if item && item.kind === 'board'}
                    <span class="glyph">▣</span>
                    <span class="cell-label">{item.label}</span>
                  {:else if item}
                    <!-- FR-8 text post: the clipping reads in place;
                         tags surface on hover. -->
                    <div
                      class="text-post"
                      title={item.tagNames.length > 0
                        ? item.tagNames.map((t) => `#${t}`).join('  ')
                        : undefined}
                    >
                      <span class="post-title">{item.label}</span>
                      {#if item.noteExcerpt}
                        <p class="post-excerpt">{item.noteExcerpt}</p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if selected.size > 0}
    <GalleryActionBar
      selectedIds={[...selected]}
      bind:tagOpen
      onClear={clearSelection}
      onPlace={placeSelection}
    />
  {/if}
</div>

<style>
  .gallery {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .current-header {
    position: relative;
    flex: none;
    padding: 0.25rem 1rem;
    border-bottom: 1px solid var(--ew-border);
  }

  .period {
    font: inherit;
    font-weight: 600;
    color: var(--ew-text);
    background: none;
    border: none;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .period:hover {
    background: var(--ew-surface-subtle);
  }

  .period-list {
    position: absolute;
    top: 100%;
    left: 1rem;
    z-index: 2;
    margin: 0.2rem 0 0;
    padding: 0.3rem;
    list-style: none;
    max-height: 50vh;
    overflow-y: auto;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 8px;
  }

  .period-list button {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
    width: 100%;
    font: inherit;
    color: var(--ew-text);
    background: none;
    border: none;
    padding: 0.35rem 0.6rem;
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
  }

  .period-list button:hover {
    background: var(--ew-surface-subtle);
  }

  .count {
    color: var(--ew-text-muted);
  }

  .scroller {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
  }

  .canvas {
    position: relative;
  }

  .bucket-header {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    height: 40px;
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ew-text-muted);
  }

  .row {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    gap: 10px;
  }

  .cell {
    position: relative;
    width: 168px;
    height: 168px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    background: var(--ew-surface-subtle);
    border: 1px solid var(--ew-border);
    cursor: pointer;
  }

  /* 079 selection ring: the highlight vocabulary, distinct from the
     080 cursor's focus ring to come. */
  .cell.selected {
    border-color: var(--ew-accent);
    box-shadow: 0 0 0 2px var(--ew-accent);
  }

  .cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .cell-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ew-text);
    background: var(--ew-scrim);
  }

  .glyph {
    font-size: 2.2rem;
    color: var(--ew-text-muted);
  }

  .text-post {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.65rem;
    overflow: hidden;
    text-align: left;
  }

  .post-title {
    flex: none;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ew-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .post-excerpt {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--ew-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 7;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .empty {
    padding: 2rem 1rem;
    color: var(--ew-text-muted);
  }
</style>
