<!--
  Tabbed main workspace (RFC-0001 §8.2). One canvas tab hosting the
  root canvas; real tab management arrives with EPIC-006. AI-IMP-020
  adds the Create Pin dialog, the placement-source panel, and their
  toolbar buttons.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import CanvasHost from './CanvasHost.svelte'
  import CreatePinDialog from './CreatePinDialog.svelte'
  import PlacementSourcePanel from './PlacementSourcePanel.svelte'
  import type { CanvasHostHandle } from './canvas/host'
  import { itemWorldAABB } from '@ew/canvas-engine'
  import { onCreateAndPlace, onRevealNote, requestOpenNote } from './note/open-note'

  let hostHandle = $state<CanvasHostHandle | null>(null)
  let hostElement = $state<HTMLElement | null>(null)
  let dialogOpen = $state(false)
  let panelOpen = $state(false)

  function viewCenterWorld(): { x: number; y: number } {
    if (!hostHandle || !hostElement) return { x: 0, y: 0 }
    const bounds = hostElement.getBoundingClientRect()
    return hostHandle.controller.camera.screenToWorld({
      x: bounds.width / 2,
      y: bounds.height / 2,
    })
  }

  function boardNotice(message: string): void {
    hostElement?.dispatchEvent(
      new CustomEvent('ew-board-notice', { detail: { message }, bubbles: true }),
    )
  }

  // §7.3 spatial resolution on bound-link activation. Zero: canvas
  // unchanged + notice. One, on the active canvas: eased flight to
  // the placement, selected. Anything else (many, or on another
  // canvas — navigation is EPIC-006): viewport kept, non-blocking
  // location-count notice; the grouped chooser is EPIC-006 scope.
  onMount(() =>
    onRevealNote(({ noteId, title }) => {
      const h = hostHandle
      if (!h) return
      void (async () => {
        const response = await window.ew.project.query('getNoteUses', { noteId })
        if (!response.ok) return
        const uses = response.result as {
          totalPlacements: number
          canvases: Array<{ canvasId: string; nodes: Array<{ placements: Array<{ placementId: string }> }> }>
        }
        if (uses.totalPlacements === 0) {
          boardNotice(`“${title}” has no placed locations`)
          return
        }
        const active = uses.canvases.find((canvas) => canvas.canvasId === h.canvasId)
        const activePlacements = active?.nodes.flatMap((node) => node.placements) ?? []
        if (uses.totalPlacements === 1 && activePlacements.length === 1) {
          const placementId = activePlacements[0]!.placementId
          const item = h.controller.items().find((candidate) => candidate.id === placementId)
          if (!item) return
          h.controller.selection.click(placementId)
          h.flyTo(itemWorldAABB(item))
          return
        }
        boardNotice(
          `“${title}” has ${uses.totalPlacements} locations — the location chooser arrives with navigation`,
        )
      })()
    }),
  )

  // §7.2 Create and Place on Current Canvas: phantom materialization
  // that needs the active canvas and view center — one CreatePin
  // (note + node + default dot + placement), then the pane opens the
  // created note. Same semantics as §6.10.
  onMount(() =>
    onCreateAndPlace((title) => {
      const h = hostHandle
      if (!h) return
      void (async () => {
        const noteId = crypto.randomUUID()
        const center = viewCenterWorld()
        const result = await h.gateway.execute('CreatePin', {
          nodeId: crypto.randomUUID(),
          canvasId: h.canvasId,
          placementId: crypto.randomUUID(),
          x: center.x,
          y: center.y,
          appearance: { kind: 'dot', color: '#8ab4d8' },
          note: { kind: 'create', noteId, title },
        })
        if (result.status === 'committed') {
          requestOpenNote(noteId)
        } else {
          const message =
            result.status === 'error' ? result.message : 'the project changed underneath (retry)'
          hostElement?.dispatchEvent(
            new CustomEvent('ew-board-notice', {
              detail: { message: `Create and Place failed: ${message}` },
              bubbles: true,
            }),
          )
        }
      })()
    }),
  )
</script>

<main class="workspace" data-testid="workspace">
  <div class="tab-bar" role="tablist">
    <button class="tab active" role="tab" aria-selected="true">Canvas</button>
    <span class="toolbar">
      <button
        type="button"
        disabled={!hostHandle}
        onclick={() => (panelOpen = !panelOpen)}
        data-testid="toggle-sources"
      >
        Sources
      </button>
      <button
        type="button"
        disabled={!hostHandle}
        onclick={() => (dialogOpen = true)}
        data-testid="open-create-pin"
      >
        Create Pin…
      </button>
    </span>
  </div>
  <section class="tab-content" role="tabpanel">
    {#if panelOpen && hostHandle}
      <PlacementSourcePanel handle={hostHandle} viewCenter={viewCenterWorld} />
    {/if}
    <div class="canvas-slot">
      <CanvasHost
        onready={(handle, element) => {
          hostHandle = handle
          hostElement = element
        }}
      />
    </div>
  </section>
  {#if dialogOpen && hostHandle}
    <CreatePinDialog
      handle={hostHandle}
      viewCenter={viewCenterWorld}
      onclose={() => (dialogOpen = false)}
    />
  {/if}
</main>

<style>
  .workspace {
    grid-area: workspace;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #ddd;
    background: #f4f4f4;
  }

  .tab {
    padding: 0.4rem 1rem;
    border: none;
    border-right: 1px solid #ddd;
    background: transparent;
    font: inherit;
    color: #666;
    cursor: default;
  }

  .tab.active {
    background: #fff;
    color: #222;
  }

  .toolbar {
    display: flex;
    gap: 0.4rem;
    margin-left: auto;
    padding-right: 0.5rem;
  }

  .toolbar button {
    padding: 0.2rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .tab-content {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .canvas-slot {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
</style>
