<!--
  In-panel Uses list (RFC §7.4, AI-IMP-065): the open note's
  locations grouped by canvas, unfolded from the panel header's
  "⌖ n places". The Unplaced group comes last; "here" marks the
  placement being read; cross-canvas rows are navigation events
  (§8.1) that fly after arrival. Rows keep the AI-IMP-049 placement
  actions (§6.10) unchanged.
-->
<script lang="ts" module>
  export interface UsesNode {
    nodeId: string
    appearanceKind: string | null
    appearanceColor: string | null
    tags: string[]
    placements: Array<{ placementId: string }>
  }

  export interface UsesData {
    canvases: Array<{
      canvasId: string
      canvasTitle: string | null
      isRoot: boolean
      nodes: UsesNode[]
    }>
    unplaced: UsesNode[]
    totalPlacements: number
  }
</script>

<script lang="ts">
  import { navigateTo } from '../chrome/navigation'
  import NodeRow from '../rows/NodeRow.svelte'
  import {
    requestCenterPlacements,
    requestPlaceNode,
    requestPlaceNote,
  } from './open-note'
  import { reserveTetheredPanelSpace } from './panels'

  let {
    uses,
    noteId,
    activeCanvasId,
    herePlacementId,
  }: {
    uses: UsesData
    noteId: string
    activeCanvasId: string | null
    herePlacementId: string | null
  } = $props()

  function isHere(node: UsesNode): boolean {
    return herePlacementId !== null &&
      node.placements.some((placement) => placement.placementId === herePlacementId)
  }

  function selectGroup(canvasId: string, canvasTitle: string | null, node: UsesNode): void {
    const ids = node.placements.map((placement) => placement.placementId)
    if (canvasId === activeCanvasId) {
      // This list lives in the open note's panel; the fly keeps it, so
      // reserve its band before the fit (AI-IMP-100).
      reserveTetheredPanelSpace()
      requestCenterPlacements(ids)
      return
    }
    // Cross-canvas rows fly as §8.1 history events, then center.
    void navigateTo(canvasId, canvasTitle ?? 'Board').then(() => {
      reserveTetheredPanelSpace()
      requestCenterPlacements(ids)
    })
  }
</script>

<section class="uses" data-testid="uses-sidebar">
  {#if uses.canvases.length > 0 || uses.unplaced.length > 0}
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
                title={canvas.canvasId === activeCanvasId
                  ? 'Center these placements'
                  : 'Fly to this board'}
                onclick={() => selectGroup(canvas.canvasId, canvas.canvasTitle, node)}
              >
                <NodeRow appearance={node} count={node.placements.length} tags={node.tags}>
                  {#snippet extra()}
                    {#if isHere(node)}
                      <span class="here" data-testid="uses-here">here</span>
                    {/if}
                  {/snippet}
                </NodeRow>
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
                <NodeRow appearance={node} label="Place on Current Canvas" />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else}
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
</section>

<style>
  .uses {
    flex: none;
    max-height: 11rem;
    overflow: auto;
    padding: 0.3rem 0.6rem 0.5rem;
    border-top: 1px solid var(--ew-paper-border);
    font-size: 0.8rem;
  }

  .group-title {
    margin: 0.3rem 0 0.15rem;
    color: var(--ew-paper-text-subtle);
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

  .row:hover {
    background: var(--ew-paper-hover);
  }

  .here {
    padding: 0 0.35rem;
    border-radius: 7px;
    background: var(--ew-paper-info-surface);
    color: var(--ew-paper-info-text);
    font-size: 0.68rem;
  }
</style>
