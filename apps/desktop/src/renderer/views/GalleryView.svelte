<!--
  Gallery takeover (RFC §14.4, AI-IMP-077): the file-browser
  projection over the project's nodes. A VIRTUALIZED thumbnail grid —
  DOM and hydration scale with the viewport, never the collection —
  grouped into date buckets whose sticky header names where you are
  and opens the period list for random access into deep time (one
  control, two jobs). Thumbnails load over ew-asset://<hash>/thumb
  with a one-line fallback to the original, and repaint as the
  background generator (076) lands derivatives. Facets, selection,
  and the keyboard model arrive with 078/079/080.
-->
<script lang="ts">
  import { bucketByDate, type GalleryBucket } from './gallery-buckets'

  type GalleryKind = 'image' | 'note' | 'board'

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

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(): Promise<void> {
    try {
      index = await runQuery<IndexEntry[]>('getGalleryIndex')
    } catch {
      index = []
    }
    loaded = true
  }

  $effect(() => {
    void refresh()
  })
  $effect(() => window.ew.project.onChanged(() => void refresh()))
  // 076's push: a landed derivative repaints its cells by cache-bust.
  $effect(() =>
    window.ew.derivatives.onThumbnailReady(({ contentHash }) => {
      thumbNonce = { ...thumbNonce, [contentHash]: (thumbNonce[contentHash] ?? 0) + 1 }
    }),
  )

  const buckets = $derived(bucketByDate(index, new Date()))
  const columns = $derived(
    Math.max(2, Math.floor((viewportWidth - PAD * 2 + GAP) / (CELL + GAP))),
  )

  type Row =
    | { kind: 'header'; bucket: GalleryBucket; top: number }
    | { kind: 'cells'; entries: IndexEntry[]; top: number }

  const layout = $derived.by(() => {
    const rows: Row[] = []
    let top = 0
    for (const bucket of buckets) {
      rows.push({ kind: 'header', bucket, top })
      top += HEADER_H
      const end = bucket.startIndex + bucket.count
      for (let i = bucket.startIndex; i < end; i += columns) {
        rows.push({ kind: 'cells', entries: index.slice(i, Math.min(i + columns, end)), top })
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
</script>

<div class="gallery" data-testid="gallery-view">
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
        Nothing here yet — anything imported or created lands in the gallery.
      </p>
    {:else}
      <div class="canvas" style={`height: ${layout.totalHeight}px`}>
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
                  data-testid="gallery-cell"
                  data-node-id={entry.nodeId}
                  data-kind={entry.kind}
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
                    <span class="glyph note">¶</span>
                    <span class="cell-label">{item.label}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
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
    color: var(--ew-text-dim);
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
    color: var(--ew-text-dim);
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
    color: var(--ew-text-dim);
  }

  .empty {
    padding: 2rem 1rem;
    color: var(--ew-text-dim);
  }
</style>
