<script module lang="ts">
  export interface GalleryPlacementChoice {
    placementId: string
    canvasId: string
    canvasLabel: string
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { placeAnchored } from '../chrome/anchored-placement'
  import { dismissOnOutside } from '../chrome/dismissal-guard'
  import { Z } from '../z'

  let {
    x,
    y,
    label,
    placements,
    onchoose,
    onclose,
  }: {
    x: number
    y: number
    label: string
    placements: readonly GalleryPlacementChoice[]
    onchoose: (placement: GalleryPlacementChoice) => void
    onclose: () => void
  } = $props()

  let chooser: HTMLElement
  let left = $state(0)
  let top = $state(0)

  onMount(() => {
    const rect = chooser.getBoundingClientRect()
    const placed = placeAnchored({
      anchor: { x, y, width: 0, height: 0 },
      surface: { width: rect.width, height: rect.height },
      host: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      x: { preferred: 'start', fallback: 'end' },
      y: { preferred: 'start', fallback: 'end' },
    })
    left = placed.x
    top = placed.y
    chooser.focus({ preventScroll: true })
  })
</script>

<div
  bind:this={chooser}
  class="chooser"
  role="dialog"
  aria-label={`Places for ${label}`}
  tabindex="-1"
  data-testid="gallery-placement-chooser"
  style:z-index={Z.popover}
  style:left={`${left}px`}
  style:top={`${top}px`}
  use:dismissOnOutside={{ dismiss: onclose }}
>
  <p>⌖ {placements.length} places</p>
  {#each placements as placement (placement.placementId)}
    <button type="button" data-testid="gallery-placement-choice" onclick={() => onchoose(placement)}>
      <span>⌖</span><span>{placement.canvasLabel}</span>
    </button>
  {/each}
</div>

<style>
  .chooser { position:fixed; width:17rem; max-height:20rem; overflow:auto; padding:0.4rem; border:1px solid var(--ew-border); border-radius:7px; background:var(--ew-surface-menu); box-shadow:0 6px 22px var(--ew-shadow); pointer-events:auto; }
  p { margin:0 0 0.3rem; padding:0.2rem 0.4rem; color:var(--ew-text-muted); font-size:0.75rem; }
  button { display:grid; grid-template-columns:auto 1fr; gap:0.5rem; width:100%; padding:0.4rem; border:0; border-radius:4px; background:transparent; color:var(--ew-text); text-align:left; font:inherit; cursor:pointer; }
  button:hover { background:var(--ew-surface-hover); }
</style>
