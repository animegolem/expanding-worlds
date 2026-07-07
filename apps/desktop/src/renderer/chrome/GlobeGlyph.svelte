<!--
  A tiny GLOBE glyph (RFC §8.2 rev 0.64, decision 07; AI-IMP-166): the
  bookmark menu's rows wear small globes in place of dots — every bookmark
  is a world, the pin pinning down into a globe, echoing the app icon.

  Drawn from the design kit's globe glyph: an ocean-blue top-lit sphere
  with two green landmasses and a rimming stroke, all through the ratified
  object-icon palette (--ew-obj-blue-* ocean, --ew-obj-green-lo land) — the
  same materials the world is made of. Many rows render, so the ocean
  gradient id is uniquified per instance (a document may hold only one of a
  given id, and url(#id) resolves to the first match otherwise).
-->
<script lang="ts">
  let uid = globeUid++
  const oceanId = `ew-globe-ocean-${uid}`
</script>

<script lang="ts" module>
  let globeUid = 0
</script>

<svg class="globe-glyph" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id={oceanId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--ew-obj-blue-hi)" />
      <stop offset="1" stop-color="var(--ew-obj-blue-lo)" />
    </linearGradient>
  </defs>
  <circle cx="12" cy="12" r="9.5" fill={`url(#${oceanId})`} />
  <path d="M6.5 8.5 q2.5 -2 5.5 -1.2 q2 .5 1.2 2.2 q-1 1.8 -3.6 1.4 q-3 -.4 -3.1 -2.4 Z" fill="var(--ew-obj-green-lo)" />
  <path d="M12.5 14 q2.8 -.8 4.6 .6 q1.2 1 .4 2.4 q-1.2 1.6 -3.5 .8 q-2.3 -.8 -1.5 -3.8 Z" fill="var(--ew-obj-green-lo)" />
  <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--ew-obj-blue-stroke)" stroke-width="1.6" />
</svg>

<style>
  .globe-glyph {
    display: block;
    width: 0.85rem;
    height: 0.85rem;
    flex: none;
  }
</style>
