<!--
  Location chooser (RFC §7.3–7.4, AI-IMP-065): a note with MANY
  placements resolves space by asking — a panel anchored to the
  activated link, sharing the uses-row grammar. Choosing a row runs
  the one-placement behavior: fly (cross-canvas as history), select,
  re-tether. Esc or ✕ dismisses; the viewport stays put until chosen.
-->
<script lang="ts">
  import { pointAnchor } from '../chrome/anchored-placement'
  import {
    placeAnchoredElement,
    type AnchoredElementOptions,
  } from '../chrome/anchored-placement-dom'
  import { dismissChooser, jumpToPlacement, type ChooserState } from './panels'
  import { tooltip } from '../chrome/tooltip'

  const { state, hostElement }: { state: ChooserState; hostElement: HTMLElement } = $props()

  function placement(current: ChooserState): AnchoredElementOptions {
    const bounds = hostElement.getBoundingClientRect()
    return {
      anchor: current.anchor
        ? pointAnchor(current.anchor.x - bounds.left, current.anchor.y - bounds.top)
        : pointAnchor(bounds.width / 2, 80),
      host: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      x: { preferred: current.anchor ? 'start' : 'center' },
      y: { preferred: current.anchor ? 'after' : 'start', fallback: 'before' },
      gap: { y: current.anchor ? 6 : 0 },
      margin: 8,
    }
  }

  // §7.3 (AI-IMP-183 M-10): Esc dismisses the chooser and CONSUMES the
  // press (capture + stopPropagation, the search-palette pattern) so the
  // dismissal never also selects or drags the content underneath it.
  $effect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      dismissChooser()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

<div
  class="chooser"
  use:placeAnchoredElement={() => placement(state)}
  data-testid="location-chooser"
>
  <header>
    <span class="title">“{state.title}” — {state.uses.totalPlacements} places</span>
    <button
      type="button"
      data-testid="chooser-close"
      onclick={dismissChooser}
      aria-label="Close"
      use:tooltip={{ name: 'Close' }}
    >
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
