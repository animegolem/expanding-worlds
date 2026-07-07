<!--
  A strip of tape (RFC §8.5 rev 0.55; AI-IMP-134 primitive, wired by
  AI-IMP-135). Marks the sticky: a note torn out and taped to the glass.
  A reusable paper primitive — a translucent token-colored strip the
  caller drops over an edge, optionally rotated for a hand-torn slant.
  Token-styled only.
-->
<script lang="ts">
  const {
    angle = -4,
    width = 72,
  }: {
    /** Slant in degrees — a little off-square reads as hand-applied. */
    angle?: number
    /** Strip length in px. */
    width?: number
  } = $props()
</script>

<div
  class="tape"
  aria-hidden="true"
  style={`width:${width}px; transform: translateX(-50%) rotate(${angle}deg)`}
></div>

<style>
  .tape {
    position: absolute;
    height: 22px;
    background: var(--ew-tape-surface);
    border-left: 1px solid var(--ew-tape-border);
    border-right: 1px solid var(--ew-tape-border);
    pointer-events: none;
  }
</style>
