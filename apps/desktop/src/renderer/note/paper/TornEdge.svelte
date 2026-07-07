<!--
  A torn paper edge (RFC §8.5 rev 0.55; AI-IMP-134 primitive, wired by
  AI-IMP-135). The scar that marks a page torn out of its book — it
  persists onto the sticky and the landmark. A reusable paper primitive:
  a token-colored ragged strip laid along one edge via clip-path. The
  caller places it on the edge that tore; `side` says which edge the
  teeth point away from. Token-styled only.
-->
<script lang="ts">
  const {
    side = 'top',
    teeth = 12,
  }: {
    /** Which edge of the parent the tear runs along. */
    side?: 'top' | 'bottom' | 'left' | 'right'
    /** How many jags across the edge — denser reads as a finer tear. */
    teeth?: number
  } = $props()

  const horizontal = $derived(side === 'top' || side === 'bottom')

  // A ragged polygon: alternating peaks/valleys across the edge, with a
  // solid backing to the parent's interior so the strip reads as the
  // page's own torn margin rather than a floating band.
  const points = $derived.by(() => {
    const steps = Math.max(2, teeth) * 2
    const pts: string[] = []
    for (let i = 0; i <= steps; i += 1) {
      const along = (i / steps) * 100
      const jag = i % 2 === 0 ? 0 : 42
      if (side === 'top') pts.push(`${along}% ${jag}%`)
      else if (side === 'bottom') pts.push(`${along}% ${100 - jag}%`)
      else if (side === 'left') pts.push(`${jag}% ${along}%`)
      else pts.push(`${100 - jag}% ${along}%`)
    }
    // Close the polygon along the parent's interior edge.
    if (side === 'top') pts.push('100% 100%', '0% 100%')
    else if (side === 'bottom') pts.push('100% 0%', '0% 0%')
    else if (side === 'left') pts.push('100% 100%', '100% 0%')
    else pts.push('0% 100%', '0% 0%')
    return pts.join(', ')
  })
</script>

<div
  class="torn-edge"
  class:horizontal
  aria-hidden="true"
  style={`clip-path: polygon(${points})`}
></div>

<style>
  .torn-edge {
    position: absolute;
    background: var(--ew-paper-torn);
    pointer-events: none;
  }

  /* A thin band hugging the torn edge; the caller anchors it with the
     inline `inset` it wants. Default: full-width top strip. */
  .torn-edge.horizontal {
    left: 0;
    right: 0;
    height: 10px;
  }

  .torn-edge:not(.horizontal) {
    top: 0;
    bottom: 0;
    width: 10px;
  }
</style>
