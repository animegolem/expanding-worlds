<!--
  Location chooser (RFC §7.3–7.4, AI-IMP-065): a note with MANY
  placements resolves space by asking — a panel anchored to the
  activated link, sharing the uses-row grammar. Choosing a row runs
  the one-placement behavior: fly (cross-canvas as history), select,
  re-tether. Esc or ✕ dismisses; the viewport stays put until chosen.
-->
<script lang="ts">
  import { dismissChooser, jumpToPlacement, type ChooserState } from './panels'

  const { state, hostElement }: { state: ChooserState; hostElement: HTMLElement } = $props()

  const pos = $derived.by(() => {
    const bounds = hostElement.getBoundingClientRect()
    if (!state.anchor) return { x: bounds.width / 2 - 130, y: 80 }
    const x = Math.min(Math.max(8, state.anchor.x - bounds.left), bounds.width - 270)
    const y = Math.min(Math.max(8, state.anchor.y - bounds.top + 6), bounds.height - 240)
    return { x, y }
  })

  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismissChooser()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div class="chooser" style={`left:${pos.x}px;top:${pos.y}px`} data-testid="location-chooser">
  <header>
    <span class="title">“{state.title}” — {state.uses.totalPlacements} places</span>
    <button type="button" data-testid="chooser-close" onclick={dismissChooser} aria-label="Close">
      ✕
    </button>
  </header>
  {#each state.uses.canvases as canvas (canvas.canvasId)}
    <p class="group-title">
      {canvas.canvasTitle ?? (canvas.isRoot ? 'Root canvas' : 'Untitled canvas')}
    </p>
    <ul>
      {#each canvas.nodes as node (node.nodeId)}
        {#each node.placements as placement (placement.placementId)}
          <li>
            <button
              type="button"
              class="row"
              data-testid="chooser-row"
              onclick={() =>
                void jumpToPlacement(
                  state.noteId,
                  state.title,
                  canvas.canvasId,
                  placement.placementId,
                )}
            >
              <span class="dot" style={`background:${node.appearanceColor ?? 'var(--ew-node-dot-default)'}`}></span>
              Fly here
            </button>
          </li>
        {/each}
      {/each}
    </ul>
  {/each}
</div>

<style>
  .chooser {
    position: absolute;
    z-index: 9;
    width: 260px;
    max-height: 230px;
    overflow: auto;
    padding: 0.4rem 0.55rem 0.55rem;
    background: var(--ew-paper-surface);
    border: 1px solid var(--ew-paper-border-strong);
    border-radius: 9px;
    box-shadow: 0 6px 22px var(--ew-shadow);
    pointer-events: auto;
    font-size: 0.78rem;
    color: var(--ew-paper-text);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .title {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header button {
    flex: none;
    border: none;
    background: transparent;
    color: var(--ew-paper-text-muted);
    font: inherit;
    cursor: pointer;
  }

  .group-title {
    margin: 0.35rem 0 0.1rem;
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

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
</style>
