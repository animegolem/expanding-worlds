<!--
  Outline takeover (RFC §14.1, AI-IMP-069): the world as an outline,
  canvas ▸ children, realizing the node-library MUST. Containment is
  a graph with legal cycles, so the tree is assembled here with a
  per-branch path: a canvas already on its own ancestry renders as
  an alias row that flies to the real entry instead of unfolding
  again. Unplaced material gathers in the root-level loose bin —
  keeping stashed nodes is a legitimate workflow, not an error.
  Filter chips: hide content-less · disconnected (orphan ∪ loose,
  §14.1 vocabulary) · one tag. Placement flows (AI-IMP-070): rows are
  §6.10 placement sources — Place on Current Canvas fires the same
  requests the Uses sidebar does (Workspace commits and toasts
  failures), drag sets the import-surface mimes so the board's drop
  handler places at the drop point, canvas rows dive via navigateTo,
  note rows open via requestOpenNote. Every action closes the
  takeover so the user sees the result land.
-->
<script lang="ts">
  import { shortCode } from '@ew/domain'
  import NodeRow from '../rows/NodeRow.svelte'
  import { NODE_DRAG_MIME, NOTE_DRAG_MIME } from '../canvas/import-surfaces'
  import { closeTakeover } from '../chrome/takeover'
  import { navigateTo } from '../chrome/navigation'
  import { toast } from '../chrome/status'
  import { tooltip } from '../chrome/tooltip'
  import { requestOpenNote, requestPlaceNode, requestPlaceNote } from '../note/open-note'
  import { createNoteProjectPort } from '../note/project-port'
  import type { ProjectPort } from '../note/note-editor'

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

  // §9.2 the loose-note exit (AI-IMP-260): Trash on a loose bin row.
  // The outline owns no canvas gateway, so the verb goes through a
  // lazily-created note project port — the CommandGateway seam, never
  // a hand-rolled envelope (FR-23 direction). TrashNote is undo-EXEMPT
  // (AI-IMP-233: trash-is-recovery-home); recovery is the Trash view.
  // The refresh above hears the commit and the row leaves the list.
  let trashPort: ProjectPort | null = null
  let disposeTrashPort: (() => void) | null = null
  $effect(() => () => {
    disposeTrashPort?.()
    disposeTrashPort = null
    trashPort = null
  })

  async function trashLooseNote(note: { id: string; title: string }): Promise<void> {
    if (!trashPort) {
      const { port, dispose } = await createNoteProjectPort()
      trashPort = port
      disposeTrashPort = dispose
    }
    const result = await trashPort.execute('TrashNote', { noteId: note.id })
    if (result.status === 'committed') toast(`“${note.title}” moved to Trash`)
    else if (result.status === 'error') toast(result.message, { kind: 'error' })
    else toast('the project changed underneath (retry)', { kind: 'error' })
  }

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

  /** §6.10: one placement at view center. Workspace owns the commit
   * and toasts failures; closing first lets the user watch it land. */
  function placeNodeOnBoard(nodeId: string): void {
    closeTakeover()
    requestPlaceNode(nodeId)
  }

  /** §6.10 zero-node note: dot + attach + placement as one CreatePin. */
  function placeNoteOnBoard(noteId: string): void {
    closeTakeover()
    requestPlaceNote(noteId)
  }

  /** Canvas rows dive — through navigateTo, so every jump enters
   * history (§8.1) — and the takeover yields to the destination. */
  function dive(canvasId: string, label: string): void {
    closeTakeover()
    void navigateTo(canvasId, label)
  }

  /** Note rows open the note panel; panels live under the takeover
   * (z-order), so the takeover closes to reveal them. */
  function openNote(noteId: string): void {
    closeTakeover()
    requestOpenNote(noteId)
  }

  /**
   * Row dragstart: set the import-surface payload (the board's drop
   * handler executes CreatePlacement/CreatePin at the drop's world
   * point, import-surfaces.ts) and watch the drag — the outline
   * sheet is full-bleed, so the operative "sheet edge" (§6.10 drag
   * out of the takeover) is the originating row's own bounds: the
   * moment the pointer drags past them, the takeover closes so the
   * board is visible to receive the drop.
   */
  function beginRowDrag(event: DragEvent, mime: string, id: string): void {
    const dt = event.dataTransfer
    if (!dt) return
    dt.setData(mime, id)
    dt.effectAllowed = 'copy'
    const row = event.currentTarget as HTMLElement
    const edge = row.getBoundingClientRect()
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

  /** Row body activation: canvas rows dive, note rows open. */
  function activateChild(child: OutlineChildRow): void {
    if (child.childCanvasId !== null) dive(child.childCanvasId, childTitle(child))
    else if (child.noteId !== null) openNote(child.noteId)
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
        use:tooltip={{ name: 'Already open above — jump to it' }}
      >
        <span class="glyph">⤴</span>
        <span class="title">{childTitle(child)}</span>
      </button>
    {:else}
      <div
        class="row"
        class:has-children={nested !== undefined}
        data-testid="outline-child-row"
        data-node-id={child.nodeId}
        draggable="true"
        ondragstart={(event) => beginRowDrag(event, NODE_DRAG_MIME, child.nodeId)}
      >
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
        <button
          type="button"
          class="row-main"
          data-testid="outline-row-activate"
          disabled={child.childCanvasId === null && child.noteId === null}
          onclick={() => activateChild(child)}
        >
          <NodeRow
            appearance={child}
            label={childTitle(child)}
            count={child.placementCount > 1 ? child.placementCount : null}
            tags={child.tags}
            hasNote={child.noteId !== null}
            hasCanvas={child.childCanvasId !== null}
          >
            {#snippet extra()}
              {#if disconnectedOnly && child.noteId === null}
                <span class="badge" data-testid="badge-orphan">orphan</span>
              {/if}
            {/snippet}
          </NodeRow>
        </button>
        <button
          type="button"
          class="row-action"
          data-testid="outline-place-node"
          onclick={() => placeNodeOnBoard(child.nodeId)}
          use:tooltip={{ name: 'Place on current canvas' }}
        >
          Place
        </button>
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
        <button
          type="button"
          class="row-main"
          data-testid="outline-canvas-activate"
          onclick={() => dive(canvas.canvasId, canvas.label)}
        >
          <span class="glyph">⊡</span>
          <span class="title canvas-title">{canvas.label}{canvas.isRoot ? ' (home)' : ''}</span>
        </button>
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
            <div
              class="row"
              data-testid="loose-node-row"
              data-node-id={node.id}
              draggable="true"
              ondragstart={(event) => beginRowDrag(event, NODE_DRAG_MIME, node.id)}
            >
              <span class="caret-space"></span>
              <button
                type="button"
                class="row-main"
                data-testid="outline-row-activate"
                disabled={node.noteId === null}
                onclick={() => node.noteId !== null && openNote(node.noteId)}
              >
                <NodeRow
                  appearance={node}
                  label={node.noteTitle ?? shortCode(node.id)}
                  tags={node.tags}
                  hasNote={node.noteId !== null}
                >
                  {#snippet extra()}
                    <span class="badge" data-testid="badge-loose">loose</span>
                    {#if node.noteId === null}
                      <span class="badge" data-testid="badge-orphan">orphan</span>
                    {/if}
                  {/snippet}
                </NodeRow>
              </button>
              <button
                type="button"
                class="row-action"
                data-testid="outline-place-node"
                onclick={() => placeNodeOnBoard(node.id)}
                use:tooltip={{ name: 'Place on current canvas' }}
              >
                Place
              </button>
            </div>
          </li>
        {/each}
        {#if !tagFilter}
          {#each looseNotes as note (note.id)}
            <li>
              <div
                class="row"
                data-testid="loose-note-row"
                data-note-id={note.id}
                draggable="true"
                ondragstart={(event) => beginRowDrag(event, NOTE_DRAG_MIME, note.id)}
              >
                <span class="caret-space"></span>
                <button
                  type="button"
                  class="row-main"
                  data-testid="outline-row-activate"
                  onclick={() => openNote(note.id)}
                >
                  <span class="glyph" title="note">¶</span>
                  <span class="title">{note.title}</span>
                  <span class="badge" data-testid="badge-loose">loose</span>
                </button>
                <button
                  type="button"
                  class="row-action"
                  data-testid="outline-place-note"
                  onclick={() => placeNoteOnBoard(note.id)}
                  use:tooltip={{ name: 'Place on current canvas' }}
                >
                  Place
                </button>
                <button
                  type="button"
                  class="row-action destructive"
                  data-testid="outline-trash-note"
                  onclick={() => void trashLooseNote(note)}
                  use:tooltip={{ name: 'Trash — recover from the Trash view' }}
                >
                  Trash
                </button>
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

  /* Row body: the activation target (dive / open note). Inherits the
     row grammar; disabled rows (bare nodes) read as plain rows. */
  .row-main {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    padding: 0;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row-main:disabled {
    cursor: default;
  }

  /* Hover-revealed per-row action (opacity, not display — Playwright
     and focus users still reach it). Inline after the row content,
     NOT right-aligned: the chrome layer's charm rail floats over the
     sheet's right edge and would swallow the clicks. */
  .row-action {
    flex: none;
    margin-left: 0.3rem;
    padding: 0 0.4rem;
    opacity: 0;
    background: var(--ew-surface-raised);
    color: var(--ew-text-muted);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .row:hover .row-action,
  .row:focus-within .row-action {
    opacity: 1;
  }

  /* §16 grammar: destructive reads as destructive, even as a row
     action (AI-IMP-260 — the loose bin's Trash). */
  .row-action.destructive {
    color: var(--ew-danger);
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

  .badge {
    flex: none;
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-surface-raised);
    border: 1px solid var(--ew-border-strong);
    color: var(--ew-warn);
    font-size: 0.62rem;
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
