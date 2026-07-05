<!--
  Placement sources (RFC-0001 §6.3/§6.10, AI-IMP-020): a minimal
  panel listing nodes (drag onto the canvas or Place on Current Canvas
  = one CreatePlacement) and zero-node notes (Place on Current Canvas
  = one CreatePin: default dot + attach + placement in one
  transaction). The full node library view is EPIC-005/006 scope.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import type { CommandResult } from '@ew/commands'
  import type { CanvasHostHandle } from './canvas/host'
  import { NODE_DRAG_MIME, ZERO_NODE_NOTE_DOT_COLOR } from './canvas/import-surfaces'

  let {
    handle,
    viewCenter,
  }: {
    handle: CanvasHostHandle
    viewCenter: () => { x: number; y: number }
  } = $props()

  interface LibraryNode {
    id: string
    noteTitle: string | null
    placementCount: number
    appearanceKind: string | null
    tags: string[]
  }
  interface NoteRow {
    id: string
    title: string
  }

  let tab = $state<'nodes' | 'notes'>('nodes')
  let filter = $state<'all' | 'unplaced'>('all')
  let nodes = $state<LibraryNode[]>([])
  let zeroNodeNotes = $state<NoteRow[]>([])
  let errorMessage = $state<string | null>(null)

  async function runQuery<T>(name: string, args?: unknown): Promise<T> {
    const response = await window.ew.project.query(name, args)
    if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
    return response.result as T
  }

  async function refresh(): Promise<void> {
    try {
      nodes = await runQuery<LibraryNode[]>('listNodeLibrary', { filter })
      // §6.10: zero-node notes filter server-side on listNotes.nodeCount.
      const notes = await runQuery<Array<NoteRow & { nodeCount: number }>>('listNotes')
      zeroNodeNotes = notes.filter((note) => note.nodeCount === 0)
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
  }

  $effect(() => {
    void filter
    void refresh()
    const unsubscribe = window.ew.project.onChanged(() => void refresh())
    return unsubscribe
  })

  function failureText(what: string, result: CommandResult): string {
    if (result.status === 'error') return `${what} failed: ${result.message}`
    if (result.status === 'conflict') return `${what} failed: the project changed underneath`
    return `${what} failed: ${result.status}`
  }

  function onNodeDragStart(event: DragEvent, nodeId: string): void {
    event.dataTransfer?.setData(NODE_DRAG_MIME, nodeId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  /** §6.3: Place on Current Canvas creates one placement at view center. */
  async function placeNode(nodeId: string): Promise<void> {
    const center = viewCenter()
    const result = await handle.gateway.execute('CreatePlacement', {
      placementId: uuidv7(),
      canvasId: handle.canvasId,
      nodeId,
      x: center.x,
      y: center.y,
    })
    if (result.status !== 'committed') errorMessage = failureText('CreatePlacement', result)
  }

  /** §6.10: dot + attach + placement in ONE user-level transaction;
   * the labeled dot appears because labels default to visible. */
  async function placeNote(noteId: string): Promise<void> {
    const center = viewCenter()
    const result = await handle.gateway.execute('CreatePin', {
      nodeId: uuidv7(),
      canvasId: handle.canvasId,
      placementId: uuidv7(),
      x: center.x,
      y: center.y,
      appearance: { kind: 'dot', color: ZERO_NODE_NOTE_DOT_COLOR },
      note: { kind: 'attach', noteId },
    })
    if (result.status !== 'committed') errorMessage = failureText('CreatePin', result)
  }
</script>

<aside class="sources" data-testid="placement-sources">
  <div class="tabs">
    <button
      type="button"
      class:active={tab === 'nodes'}
      onclick={() => (tab = 'nodes')}
      data-testid="sources-tab-nodes"
    >
      Nodes
    </button>
    <button
      type="button"
      class:active={tab === 'notes'}
      onclick={() => (tab = 'notes')}
      data-testid="sources-tab-notes"
    >
      Notes
    </button>
  </div>

  {#if errorMessage}
    <p class="error" role="alert" data-testid="sources-error">{errorMessage}</p>
  {/if}

  {#if tab === 'nodes'}
    <label class="filter">
      <input
        type="checkbox"
        checked={filter === 'unplaced'}
        onchange={() => (filter = filter === 'unplaced' ? 'all' : 'unplaced')}
        data-testid="sources-filter-unplaced"
      />
      Unplaced only
    </label>
    <ul>
      {#each nodes as node (node.id)}
        <li
          draggable="true"
          ondragstart={(event) => onNodeDragStart(event, node.id)}
          data-testid="sources-node-row"
          data-node-id={node.id}
        >
          <span class="label">
            {node.noteTitle ?? `${node.appearanceKind ?? 'node'} ${node.id.slice(0, 8)}`}
            <small>×{node.placementCount}</small>
          </span>
          <button type="button" onclick={() => void placeNode(node.id)} data-testid="sources-place-node">
            Place
          </button>
        </li>
      {:else}
        <li class="empty">No nodes</li>
      {/each}
    </ul>
  {:else}
    <ul>
      {#each zeroNodeNotes as note (note.id)}
        <li data-testid="sources-note-row" data-note-id={note.id}>
          <span class="label">{note.title}</span>
          <button type="button" onclick={() => void placeNote(note.id)} data-testid="sources-place-note">
            Place
          </button>
        </li>
      {:else}
        <li class="empty">No zero-node notes</li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .sources {
    flex: none;
    width: 230px;
    overflow: auto;
    border-right: 1px solid #ddd;
    background: #fafafa;
    font-size: 0.85rem;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #ddd;
  }

  .tabs button {
    flex: 1;
    padding: 0.35rem 0;
    border: none;
    background: transparent;
    font: inherit;
    color: #666;
    cursor: pointer;
  }

  .tabs button.active {
    background: #fff;
    color: #222;
    font-weight: 600;
  }

  .filter {
    display: block;
    padding: 0.4rem 0.75rem;
    color: #555;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid #eee;
    cursor: grab;
  }

  li.empty {
    color: #999;
    cursor: default;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label small {
    color: #999;
  }

  li button {
    flex: none;
    padding: 0.1rem 0.5rem;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .error {
    margin: 0;
    padding: 0.4rem 0.75rem;
    background: #fbeaea;
    color: #8c2f2f;
  }
</style>
