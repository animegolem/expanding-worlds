<!--
  Outline takeover (RFC §14.1, AI-IMP-069): the world as an outline,
  canvas ▸ children, realizing the node-library MUST. Containment is
  a graph with legal cycles, so the tree is assembled here with a
  per-branch path: a canvas already on its own ancestry renders as
  an alias row that flies to the real entry instead of unfolding
  again. Unplaced material gathers in the root-level loose bin —
  keeping stashed nodes is a legitimate workflow, not an error.
  Filter chips: hide content-less · disconnected (orphan ∪ loose,
  §14.1 vocabulary) · one tag. Placement flows (drag, Place on
  Current Canvas) arrive with AI-IMP-070.
-->
<script lang="ts">
  import { shortCode } from '@ew/domain'

  interface OutlineChildRow {
    placementId: string
    nodeId: string
    renderOrder: number
    appearanceKind: string | null
    appearanceColor: string | null
    appearanceIcon: string | null
    noteId: string | null
    noteTitle: string | null
    childCanvasId: string | null
    placementCount: number
    tags: string[]
  }

  interface OutlineCanvasRow {
    canvasId: string
    nodeId: string
    label: string
    isRoot: boolean
    isRootLevel: boolean
    children: OutlineChildRow[]
  }

  interface LibraryRow {
    id: string
    noteId: string | null
    noteTitle: string | null
    appearanceKind: string | null
    appearanceColor: string | null
    appearanceIcon: string | null
    placementCount: number
    tags: string[]
  }

  interface TagRow {
    id: string
    name: string
  }

  let canvases = $state<OutlineCanvasRow[]>([])
  let unplacedNodes = $state<LibraryRow[]>([])
  let looseNotes = $state<Array<{ id: string; title: string }>>([])
  let tagNames = $state<string[]>([])
  let errorMessage = $state<string | null>(null)

  // Filter chips (§14.1): view state, never domain state.
  let hideContentless = $state(false)
  let disconnectedOnly = $state(false)
  let tagFilter = $state('')
  let tagFocus = $state(false)

  function tagCompletions(): string[] {
    const needle = tagFilter.toLowerCase()
    return tagNames.filter((name) => name.toLowerCase().startsWith(needle) && name !== tagFilter)
  }

  // Expansion state keyed by branch path so the same canvas can be
  // open under one parent and closed under another.
  let expanded = $state<Record<string, boolean>>({})

  const byCanvas = $derived(new Map(canvases.map((c) => [c.canvasId, c])))
  const rootLevel = $derived(canvases.filter((c) => c.isRootLevel))

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(response.message)
    return response.result as T
  }

  async function refresh(): Promise<void> {
    try {
      const [tree, unplaced, loose, tags] = await Promise.all([
        runQuery<OutlineCanvasRow[]>('getOutlineTree'),
        runQuery<LibraryRow[]>('listNodeLibrary', { filter: 'unplaced' }),
        runQuery<Array<{ id: string; title: string }>>('listLooseNotes'),
        runQuery<TagRow[]>('listTags'),
      ])
      canvases = tree
      unplacedNodes = unplaced
      looseNotes = loose
      tagNames = tags.map((tag) => tag.name)
      errorMessage = null
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
  }

  $effect(() => {
    void refresh()
    return window.ew.project.onChanged(() => void refresh())
  })

  function childTitle(child: OutlineChildRow): string {
    return child.noteTitle ?? shortCode(child.nodeId)
  }

  function contentless(child: OutlineChildRow): boolean {
    return child.noteId === null && child.childCanvasId === null
  }

  function visibleChildren(canvas: OutlineCanvasRow): OutlineChildRow[] {
    return canvas.children.filter((child) => {
      if (hideContentless && contentless(child)) return false
      // In-tree rows are placed by construction; "disconnected"
      // keeps only the orphan half here (loose lives in the bin).
      if (disconnectedOnly && child.noteId !== null) return false
      if (tagFilter && !child.tags.includes(tagFilter)) return false
      return true
    })
  }

  const rootNodeId = $derived(canvases.find((c) => c.isRoot)?.nodeId ?? null)

  function binNodes(): LibraryRow[] {
    return unplacedNodes.filter((node) => {
      // The library lists every active node (§14.1) including the
      // root node, which is unplaced by construction — but the root
      // board heads the outline; it is not stashed material.
      if (node.id === rootNodeId) return false
      // Canvas-owning unplaced nodes surface as root-level canvas
      // entries above, not as bin rows.
      if (canvases.some((c) => c.nodeId === node.id)) return false
      if (tagFilter && !node.tags.includes(tagFilter)) return false
      return true
    })
  }

  function toggle(key: string): void {
    expanded[key] = !isExpanded(key)
  }

  function isExpanded(key: string): boolean {
    // Top-level canvas entries start open; nested branches closed.
    return expanded[key] ?? !key.includes('/')
  }

  /** Alias click: fly to the first real rendering of that canvas. */
  function flyToEntry(canvasId: string): void {
    const target = document.querySelector(
      `[data-testid="outline-view"] [data-canvas="${canvasId}"]`,
    )
    if (!(target instanceof HTMLElement)) return
    target.scrollIntoView({ block: 'center' })
    target.classList.remove('flash')
    // Restart the animation on repeat flights.
    void target.offsetWidth
    target.classList.add('flash')
  }
</script>

{#snippet childRow(child: OutlineChildRow, path: string[], key: string)}
  {@const cyclic = child.childCanvasId !== null && path.includes(child.childCanvasId)}
  {@const nested = child.childCanvasId !== null && !cyclic ? byCanvas.get(child.childCanvasId) : undefined}
  <li>
    {#if cyclic}
      <button
        type="button"
        class="row alias"
        data-testid="outline-alias-row"
        onclick={() => flyToEntry(child.childCanvasId!)}
        title="Already open above — jump to it"
      >
        <span class="glyphs">⤴</span>
        <span class="title">{childTitle(child)}</span>
      </button>
    {:else}
      <div class="row" class:has-children={nested !== undefined} data-testid="outline-child-row">
        {#if nested}
          <button
            type="button"
            class="caret"
            data-testid="outline-expand"
            aria-expanded={isExpanded(key)}
            onclick={() => toggle(key)}
          >
            {isExpanded(key) ? '▾' : '▸'}
          </button>
        {:else}
          <span class="caret-space"></span>
        {/if}
        {#if child.appearanceKind === 'dot'}
          <span class="swatch" style={`background:${child.appearanceColor ?? 'var(--ew-node-dot-default)'}`}></span>
        {:else if child.appearanceKind === 'icon'}
          <span class="swatch icon">{child.appearanceIcon ?? '◇'}</span>
        {:else}
          <span class="swatch image"></span>
        {/if}
        <span class="glyphs">
          {#if child.noteId !== null}<span class="glyph" title="has a note">¶</span>{/if}
          {#if child.childCanvasId !== null}<span class="glyph" title="has a canvas">⊡</span>{/if}
        </span>
        <span class="title">{childTitle(child)}</span>
        {#if child.placementCount > 1}
          <span class="count" data-testid="outline-count">×{child.placementCount}</span>
        {/if}
        {#if disconnectedOnly && child.noteId === null}
          <span class="badge" data-testid="badge-orphan">orphan</span>
        {/if}
        {#if child.tags.length > 0}
          <span class="tags">
            {#each child.tags as tag (tag)}
              <span class="tag-chip">{tag}</span>
            {/each}
          </span>
        {/if}
      </div>
      {#if nested && isExpanded(key)}
        {@render canvasBranch(nested, [...path, nested.canvasId], key)}
      {/if}
    {/if}
  </li>
{/snippet}

{#snippet canvasBranch(canvas: OutlineCanvasRow, path: string[], parentKey: string)}
  <ul class="branch" data-canvas={canvas.canvasId}>
    {#each visibleChildren(canvas) as child (child.placementId)}
      {@render childRow(child, path, `${parentKey}/${child.placementId}`)}
    {/each}
  </ul>
{/snippet}

<div class="outline" data-testid="outline-view">
  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}

  <div class="filters" data-testid="outline-filters">
    <button
      type="button"
      class="chip"
      class:on={hideContentless}
      aria-pressed={hideContentless}
      data-testid="outline-filter-contentless"
      onclick={() => (hideContentless = !hideContentless)}
    >
      hide content-less
    </button>
    <button
      type="button"
      class="chip"
      class:on={disconnectedOnly}
      aria-pressed={disconnectedOnly}
      data-testid="outline-filter-disconnected"
      onclick={() => (disconnectedOnly = !disconnectedOnly)}
    >
      disconnected
    </button>
    <!-- Completion is a custom list, NOT a <datalist>: the native
         autocomplete popup segfaults Electron's main process when the
         window is hidden (e2e mode) — found the hard way, AI-IMP-069. -->
    <span class="tag-filter-wrap">
      <input
        class="tag-filter"
        type="text"
        placeholder="one tag…"
        data-testid="outline-filter-tag"
        bind:value={tagFilter}
        onfocus={() => (tagFocus = true)}
        onblur={() => (tagFocus = false)}
      />
      {#if tagFocus && tagFilter && tagCompletions().length > 0}
        <span class="tag-completions" data-testid="outline-tag-completions">
          {#each tagCompletions() as name (name)}
            <button
              type="button"
              data-testid="outline-tag-option"
              onpointerdown={(e) => {
                e.preventDefault()
                tagFilter = name
              }}
            >
              {name}
            </button>
          {/each}
        </span>
      {/if}
    </span>
  </div>

  {#each rootLevel as canvas (canvas.canvasId)}
    <section class="canvas-entry" data-testid={`outline-canvas-${canvas.canvasId}`}>
      <div class="row canvas-row" data-canvas-header={canvas.canvasId}>
        <button
          type="button"
          class="caret"
          data-testid="outline-expand"
          aria-expanded={isExpanded(canvas.canvasId)}
          onclick={() => toggle(canvas.canvasId)}
        >
          {isExpanded(canvas.canvasId) ? '▾' : '▸'}
        </button>
        <span class="glyph">⊡</span>
        <span class="title canvas-title">{canvas.label}{canvas.isRoot ? ' (home)' : ''}</span>
      </div>
      {#if isExpanded(canvas.canvasId)}
        {@render canvasBranch(canvas, [canvas.canvasId], canvas.canvasId)}
      {/if}
    </section>
  {/each}

  <!-- Loose IS disconnected: the bin stays under every filter. -->
  <section class="loose-bin" data-testid="outline-loose-bin">
      <p class="bin-title">Loose</p>
      {#if binNodes().length === 0 && looseNotes.length === 0}
        <p class="bin-empty">Nothing unplaced — every node and note has a home.</p>
      {/if}
      <ul>
        {#each binNodes() as node (node.id)}
          <li>
            <div class="row" data-testid="loose-node-row" data-node-id={node.id}>
              <span class="caret-space"></span>
              {#if node.appearanceKind === 'dot'}
                <span class="swatch" style={`background:${node.appearanceColor ?? 'var(--ew-node-dot-default)'}`}></span>
              {:else if node.appearanceKind === 'icon'}
                <span class="swatch icon">{node.appearanceIcon ?? '◇'}</span>
              {:else}
                <span class="swatch image"></span>
              {/if}
              {#if node.noteId !== null}<span class="glyph" title="has a note">¶</span>{/if}
              <span class="title">{node.noteTitle ?? shortCode(node.id)}</span>
              <span class="badge" data-testid="badge-loose">loose</span>
              {#if node.noteId === null}
                <span class="badge" data-testid="badge-orphan">orphan</span>
              {/if}
              {#if node.tags.length > 0}
                <span class="tags">
                  {#each node.tags as tag (tag)}
                    <span class="tag-chip">{tag}</span>
                  {/each}
                </span>
              {/if}
            </div>
          </li>
        {/each}
        {#if !tagFilter}
          {#each looseNotes as note (note.id)}
            <li>
              <div class="row" data-testid="loose-note-row" data-note-id={note.id}>
                <span class="caret-space"></span>
                <span class="glyph" title="note">¶</span>
                <span class="title">{note.title}</span>
                <span class="badge" data-testid="badge-loose">loose</span>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
    </section>
</div>

<style>
  .outline {
    font-size: 0.8rem;
    color: var(--ew-text);
  }

  .error {
    color: var(--ew-danger);
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.8rem;
  }

  .chip {
    padding: 0.15rem 0.55rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .chip.on {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  .tag-filter-wrap {
    position: relative;
  }

  .tag-filter {
    padding: 0.15rem 0.5rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 999px;
    font-size: 0.72rem;
  }

  .tag-completions {
    position: absolute;
    top: calc(100% + 0.2rem);
    left: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 8rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .tag-completions button {
    padding: 0.2rem 0.55rem;
    background: transparent;
    border: none;
    color: var(--ew-text);
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
  }

  .tag-completions button:hover {
    background: var(--ew-surface-raised);
  }

  ul {
    margin: 0;
    padding: 0 0 0 1.1rem;
    list-style: none;
  }

  .canvas-entry > .row,
  .loose-bin ul {
    padding-left: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.3rem;
    border-radius: 4px;
    min-width: 0;
  }

  .row:hover {
    background: var(--ew-surface-raised);
  }

  .outline :global(.flash) {
    animation: outline-flash 700ms ease-out 1;
  }

  @keyframes outline-flash {
    0% {
      background: var(--ew-accent);
    }
    100% {
      background: transparent;
    }
  }

  button.row {
    width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .alias {
    color: var(--ew-text-muted);
    font-style: italic;
  }

  .caret {
    flex: none;
    width: 1.1rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--ew-text-muted);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .caret-space {
    flex: none;
    width: 1.1rem;
  }

  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .swatch.icon {
    width: auto;
    height: auto;
    border-radius: 0;
    font-size: 0.72rem;
  }

  .swatch.image {
    border-radius: 2px;
    background: var(--ew-border-strong);
  }

  .glyphs {
    flex: none;
    display: inline-flex;
    gap: 0.1rem;
  }

  .glyph {
    color: var(--ew-text-muted);
    font-size: 0.72rem;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .canvas-title {
    font-weight: 600;
  }

  .count {
    color: var(--ew-text-muted);
    font-size: 0.72rem;
  }

  .badge {
    flex: none;
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    color: var(--ew-warn);
    font-size: 0.62rem;
  }

  .tags {
    display: inline-flex;
    gap: 0.2rem;
    overflow: hidden;
  }

  .tag-chip {
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    font-size: 0.62rem;
    white-space: nowrap;
  }

  .loose-bin {
    margin-top: 1rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--ew-border);
  }

  .bin-title {
    margin: 0 0 0.3rem;
    font-weight: 600;
    color: var(--ew-text-muted);
  }

  .bin-empty {
    margin: 0;
    color: var(--ew-text-muted);
    font-size: 0.72rem;
  }
</style>
