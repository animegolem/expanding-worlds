<!--
  Tabbed main workspace (RFC-0001 §8.2). One canvas tab hosting the
  root canvas; real tab management arrives with EPIC-006. AI-IMP-020
  adds the Create Pin dialog, the placement-source panel, and their
  toolbar buttons.
-->
<script lang="ts">
  import CanvasHost from './CanvasHost.svelte'
  import CreatePinDialog from './CreatePinDialog.svelte'
  import PlacementSourcePanel from './PlacementSourcePanel.svelte'
  import type { CanvasHostHandle } from './canvas/host'

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
