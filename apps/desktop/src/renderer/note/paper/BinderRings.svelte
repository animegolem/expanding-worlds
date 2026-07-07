<!--
  Binder rings straddling a bound page's seam (RFC §8.5 rev 0.55 "the
  open book"; AI-IMP-134). A reusable paper primitive: it draws in its
  OWN local (world-unit) coordinate space, centered on the seam axis
  (local x=0 for a vertical seam, y=0 for a horizontal one), so the
  caller mounts it with a translate-to-seam + scale-by-zoom wrapper and
  the rings ride the world exactly like the page they bind. Each ring is
  a PUNCH — a hole filled with the board color, as if the board shows
  through — wearing a metal binder ring. Token-styled only; no NotePanel
  state leaks in (the caller passes plain geometry).

  Degraded stage (shrink ladder, §8.2): below the page floor the rings
  collapse to a single bound-edge stroke — the seam still reads, the
  hardware does not clutter a thumbnail-sized page.
-->
<script lang="ts">
  import type { PageDegradeStage } from '@ew/canvas-engine'

  const {
    orientation,
    offsets,
    radius,
    edgeLength,
    stage = 'full',
  }: {
    /** 'vertical' = a side binding (seam runs top→bottom, local x=0);
     * 'horizontal' = a bottom binding (seam runs left→right, local y=0). */
    orientation: 'vertical' | 'horizontal'
    /** Along-seam centers of the rings (world units), from ringOffsets. */
    offsets: number[]
    /** Ring radius in world units. */
    radius: number
    /** Full seam length in world units — the degraded stroke's span. */
    edgeLength: number
    stage?: PageDegradeStage
  } = $props()

  const holeRadius = $derived(radius * 0.5)
  const ringStroke = $derived(Math.max(1, radius * 0.32))
</script>

<svg class="binder-rings" aria-hidden="true">
  {#if stage === 'degraded'}
    <!-- The whole binder reduced to the spine stroke. -->
    {#if orientation === 'vertical'}
      <line x1={0} y1={0} x2={0} y2={edgeLength} stroke-width={ringStroke} />
    {:else}
      <line x1={0} y1={0} x2={edgeLength} y2={0} stroke-width={ringStroke} />
    {/if}
  {:else}
    {#each offsets as offset, i (i)}
      {@const cx = orientation === 'vertical' ? 0 : offset}
      {@const cy = orientation === 'vertical' ? offset : 0}
      <!-- The punch: board shows through the page. -->
      <circle class="hole" {cx} {cy} r={holeRadius} />
      <!-- The metal ring around the seam. -->
      <circle class="ring" {cx} {cy} r={radius} fill="none" stroke-width={ringStroke} />
    {/each}
  {/if}
</svg>

<style>
  .binder-rings {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    pointer-events: none;
  }

  .hole {
    fill: var(--ew-board-color);
  }

  .ring {
    stroke: var(--ew-binder-ring);
  }

  .binder-rings line {
    stroke: var(--ew-binder-ring);
    stroke-linecap: round;
  }
</style>
