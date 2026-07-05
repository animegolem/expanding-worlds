<!--
  Uses sidebar (RFC-0001 §7.4, AI-IMP-049): locations of the open
  note grouped canvas → node with placement counts, appearance hint,
  and tags; an Unplaced group whose rows place at view center; and,
  for a zero-node note, Place on Current Canvas (§6.10). Selecting a
  node group on the active canvas centers its placements. Cross-canvas
  selection and the grouped chooser are EPIC-006.
-->
<script lang="ts">
  import type { ProjectPort } from './note-editor'
  import {
    requestCenterPlacements,
    requestPlaceNode,
    requestPlaceNote,
  } from './open-note'

  interface UsesNode {
    nodeId: string
    appearanceKind: string | null
    appearanceColor: string | null
    tags: string[]
    placements: Array<{ placementId: string }>
  }

  interface Uses {
    canvases: Array<{ canvasId: string; canvasTitle: string | null; isRoot: boolean; nodes: UsesNode[] }>
    unplaced: UsesNode[]
    totalPlacements: number
  }

  let {
    port,
    noteId,
    activeCanvasId,
    refresh,
  }: {
    port: ProjectPort
    noteId: string
    /** Canvas the workspace currently shows; null when unknown. */
    activeCanvasId: string | null
    /** Bump to re-query (project-changed). */
    refresh: number
  } = $props()

  let uses = $state<Uses | null>(null)

  $effect(() => {
    void refresh
    const target = noteId
    void port.query<Uses>('getNoteUses', { noteId: target }).then((result) => {
      if (target === noteId) uses = result
    })
  })

  function dotStyle(node: UsesNode): string {
    return `background:${node.appearanceColor ?? '#8ab4d8'}`
  }
</script>

<section class="uses" data-testid="uses-sidebar">
  <h3>Uses</h3>
  {#if uses}
    {#each uses.canvases as canvas (canvas.canvasId)}
      <div class="group">
        <p class="group-title">
          {canvas.canvasTitle ?? (canvas.isRoot ? 'Root canvas' : 'Untitled canvas')}
        </p>
        <ul>
          {#each canvas.nodes as node (node.nodeId)}
            <li>
              <button
                type="button"
                class="row"
                data-testid="uses-node"
                disabled={canvas.canvasId !== activeCanvasId}
                title={canvas.canvasId === activeCanvasId
                  ? 'Center these placements'
                  : 'On another canvas (navigation arrives with EPIC-006)'}
                onclick={() =>
                  requestCenterPlacements(node.placements.map((p) => p.placementId))}
              >
                <span class="dot" style={dotStyle(node)}></span>
                <span class="count">×{node.placements.length}</span>
                {#if node.tags.length > 0}
                  <span class="tags">{node.tags.join(', ')}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
    {#if uses.unplaced.length > 0}
      <div class="group">
        <p class="group-title">Unplaced</p>
        <ul>
          {#each uses.unplaced as node (node.nodeId)}
            <li>
              <button
                type="button"
                class="row"
                data-testid="uses-place-node"
                onclick={() => requestPlaceNode(node.nodeId)}
              >
                <span class="dot" style={dotStyle(node)}></span>
                Place on Current Canvas
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if uses.canvases.length === 0 && uses.unplaced.length === 0}
      <!-- Zero nodes: the note is reachable but bodiless (§6.10). -->
      <button
        type="button"
        class="row"
        data-testid="uses-place-note"
        onclick={() => requestPlaceNote(noteId)}
      >
        Place on Current Canvas
      </button>
    {/if}
  {/if}
</section>

<style>
  .uses {
    flex: none;
    max-height: 40%;
    overflow: auto;
    padding: 0.4rem 0.75rem 0.6rem;
    border-top: 1px solid #ddd;
    font-size: 0.8rem;
  }

  h3 {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-title {
    margin: 0.3rem 0 0.15rem;
    color: #555;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.2rem 0.3rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }

  .row:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .row:not(:disabled):hover {
    background: #eee;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .count {
    color: #666;
  }

  .tags {
    overflow: hidden;
    color: #888;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
