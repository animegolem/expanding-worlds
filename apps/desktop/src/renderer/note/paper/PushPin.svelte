<!--
  The red glossy push pin (RFC §8.5 rev 0.55; AI-IMP-134 primitive,
  wired by AI-IMP-135). It marks the landmark — a note placed on the
  board — and the RFC's red glossy pin appears exactly three ways, all
  ON paper. A reusable paper primitive: a token-styled SVG pin with a
  metal stem and a glossed dome. Token-styled only.
-->
<script lang="ts">
  const { size = 22 }: { size?: number } = $props()
</script>

<svg
  class="push-pin"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
>
  <!-- Metal stem into the paper. -->
  <line class="stem" x1="12" y1="12" x2="12" y2="22" stroke-width="1.6" />
  <!-- Glossy red dome. -->
  <circle class="dome" cx="12" cy="9" r="7" />
  <!-- Center hole and a top-light gloss. -->
  <circle class="hole" cx="12" cy="9" r="2.1" />
  <ellipse class="gloss" cx="9.6" cy="6.8" rx="2.4" ry="1.5" />
</svg>

<style>
  .push-pin {
    pointer-events: none;
    overflow: visible;
  }

  .stem {
    stroke: var(--ew-pushpin-stem);
    stroke-linecap: round;
  }

  .dome {
    fill: var(--ew-obj-red-lo);
    stroke: var(--ew-obj-red-stroke);
    stroke-width: 0.8;
  }

  .hole {
    fill: var(--ew-obj-pin-hole);
  }

  .gloss {
    fill: var(--ew-obj-gloss);
  }
</style>
