<!--
  The floating chrome layer (RFC §8.2, AI-IMP-059): rail, dock, title
  strip — all children of one root whose opacity is driven by the
  shared engagement clock, so the whole layer fades together by
  construction. The layer never affects canvas layout: it is an
  absolute overlay with pointer-events off at the root and on at the
  controls.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import type { DecorationsUi } from '../canvas/decorations-ui'
  import type { BoardTooling } from '../canvas/board-tooling'
  import CharmRail from './CharmRail.svelte'
  import Dock from './Dock.svelte'
  import PathBar from './PathBar.svelte'
  import TitleStrip from './TitleStrip.svelte'
  import Toasts from './Toasts.svelte'
  import { onEngagementChanged } from './engagement'
  import { attachNavigation } from './navigation'
  import { onTakeoverChanged } from './takeover'
  import { CHROME_FADE_MS, CHROME_REST_OPACITY } from './feel'

  const {
    handle,
    ui,
    tooling,
    hostElement,
  }: {
    handle: CanvasHostHandle
    ui: DecorationsUi
    tooling: BoardTooling
    hostElement: HTMLElement
  } = $props()

  let engaged = $state(true)
  let takeoverOpen = $state(false)
  $effect(() => onEngagementChanged((next) => (engaged = next)))
  $effect(() => onTakeoverChanged((kind) => (takeoverOpen = kind !== null)))
  $effect(() => attachNavigation(handle))
</script>

<div
  class="chrome-layer"
  class:faded={!engaged}
  style={`--chrome-fade-ms: ${CHROME_FADE_MS}ms; --chrome-rest-opacity: ${CHROME_REST_OPACITY}`}
  data-testid="chrome-layer"
  data-engaged={engaged}
>
  <!-- Board-scoped chrome retires under a takeover (its surfaces sit
       below the takeover cover and its shortcuts are dead); the mode
       rail and toasts stay — the rail is the way back (§8.2), and
       errors surface everywhere. -->
  {#if !takeoverOpen}
    <TitleStrip {handle} {tooling} {ui} />
    <PathBar {handle} />
    <Dock {handle} {ui} {tooling} {hostElement} />
  {/if}
  <CharmRail />
  <Toasts {handle} />
</div>

<style>
  .chrome-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--chrome-fade-ms) ease-out;
  }

  .chrome-layer.faded {
    opacity: 0;
  }

  /* §8.2: controls rest at partial opacity; hovering lights that
     control alone to full. */
  .chrome-layer :global(button) {
    opacity: var(--chrome-rest-opacity);
  }

  .chrome-layer :global(button:hover) {
    opacity: 1;
  }
</style>
