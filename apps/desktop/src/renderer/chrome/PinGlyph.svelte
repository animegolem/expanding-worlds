<!--
  The canonical signature pin — silhouette iv (RFC §8.2 rev 0.64,
  decision 03; AI-IMP-166): sweeping concave sides, a soft rounded tip,
  and a carved-red meridian head. It replaces the flat 50/50/50/0 teardrop
  wherever pins mean places; its one chrome home is the path-tail bookmark
  control, where it is the ONE colored element in the mono chrome.

  Drawn as clean geometric SVG (viewBox 100 20 312 440, from the design
  kit's pin-canonical master): a top-lit red gradient body, the two
  meridian ellipses + equator carved into the head under a clip, and one
  restrained gloss. Every colour is a theme token — the raw-color guard
  keeps chrome hex confined to theme.css, so the ONE sanctioned colour
  paints only through --ew-pin-* (aliasing the ratified red-object
  palette). The gradient/clip ids are fixed: exactly one pin exists.
-->
<svg
  class="pin-glyph"
  viewBox="100 20 312 440"
  role="img"
  aria-hidden="true"
  focusable="false"
>
  <defs>
    <linearGradient id="ew-pin-red-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--ew-pin-red-hi)" />
      <stop offset="1" stop-color="var(--ew-pin-red-lo)" />
    </linearGradient>
    <clipPath id="ew-pin-head-clip">
      <circle cx="256" cy="178" r="118" />
    </clipPath>
  </defs>
  <path
    d="M138 178 A118 118 0 1 1 374 178 C374 290 300 332 264 414 C258 434 250 434 244 414 C212 332 138 290 138 178 Z"
    fill="url(#ew-pin-red-grad)"
    stroke="var(--ew-pin-red-stroke)"
    stroke-width="10"
  />
  <g clip-path="url(#ew-pin-head-clip)" fill="none" stroke="var(--ew-pin-red-stroke)" stroke-width="14">
    <ellipse cx="256" cy="178" rx="44" ry="116" />
    <ellipse cx="256" cy="178" rx="88" ry="116" />
    <path d="M138 178 H374" />
  </g>
  <ellipse cx="210" cy="114" rx="40" ry="20" fill="var(--ew-pin-gloss)" transform="rotate(-20 210 114)" />
</svg>

<style>
  /* Cap-height beside the board name — a hair over the line, so the
     signature reads as pinned INTO the path rather than floating. Aspect
     comes from the viewBox (312:440). */
  .pin-glyph {
    display: block;
    height: 1.25em;
    width: auto;
  }
</style>
