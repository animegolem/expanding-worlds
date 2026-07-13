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
  import DropBehaviorAsk from './DropBehaviorAsk.svelte'
  import ImportProgressStrip from './ImportProgressStrip.svelte'
  import MirrorAsk from './MirrorAsk.svelte'
  import PathBar from './PathBar.svelte'
  import RecognitionChip from './RecognitionChip.svelte'
  import SourcePanel from './SourcePanel.svelte'
  import TitleStrip from './TitleStrip.svelte'
  import Toasts from './Toasts.svelte'
  import { onEngagementChanged } from './engagement'
  import { attachNavigation } from './navigation'
  import { onSourcePanelChanged, type SourcePanelState } from './source-slot'
  import { onTakeoverChanged } from './takeover'
  import { CHROME_FADE_MS, CHROME_REST_OPACITY } from './feel'
  import { onReservationChanged } from './reservation'
  import { reservationsVisible } from '../dev/reservation-debug'

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
  // §14.4 source panel (AI-IMP-091): screen-fixed chrome, one at most.
  let sourcePanel = $state<SourcePanelState | null>(null)
  let showReservations = $state(false)
  $effect(() => onEngagementChanged((next) => (engaged = next)))
  $effect(() => onTakeoverChanged((kind) => (takeoverOpen = kind !== null)))
  $effect(() => onSourcePanelChanged((next) => (sourcePanel = next)))
  $effect(() => attachNavigation(handle))
  $effect(() => onReservationChanged(() => (showReservations = reservationsVisible())))
</script>

<div
  class="chrome-layer"
  class:faded={!engaged}
  style={`--chrome-fade-ms: ${CHROME_FADE_MS}ms; --chrome-rest-opacity: ${CHROME_REST_OPACITY}`}
  data-testid="chrome-layer"
  data-engaged={engaged}
>
  {#if showReservations}
    <div class="reservation-debug" aria-hidden="true" data-testid="reservation-debug">
      <i class="reserve top"></i><i class="reserve right"></i>
      <i class="reserve bottom"></i><i class="reserve left"></i>
    </div>
  {/if}
  <!-- Board-scoped chrome retires under a takeover (its surfaces sit
       below the takeover cover and its shortcuts are dead); the mode
       rail and toasts stay — the rail is the way back (§8.2), and
       errors surface everywhere. -->
  {#if !takeoverOpen}
    <TitleStrip {handle} {tooling} {ui} />
    <PathBar {handle} />
    <Dock {handle} {tooling} {hostElement} />
  {/if}
  <CharmRail />
  <Toasts {handle} />
  <!-- §14.4 inbox mirror (AI-IMP-092): both surfaces ride the drop
       and obey the engagement fade — INSIDE the fading root, unlike
       the strip below: dissolving at the next idle is their designed
       dismissal, so they must share the layer's clock. -->
  <MirrorAsk />
  <RecognitionChip {handle} />
  <!-- §4.9 multi-drop ask (AI-IMP-129): same fading root as the mirror
       ask — ignoring it keeps the drop separate. -->
  <DropBehaviorAsk />
</div>

<!-- §14.4 batch import strip (AI-IMP-081): a SIBLING of the fading
     root on purpose — a running batch is fade-exempt, so the strip
     must not inherit the layer's opacity clock. -->
<ImportProgressStrip />

<!-- §14.4 open-as-source panel (AI-IMP-091): pinned chrome — also a
     fade-exempt sibling (a panel the user pinned open must not dim
     with the idle chrome). Retargeting to another dir re-runs the
     panel's own slot handshake; replace-on-open swaps the transport. -->
{#if sourcePanel}
  <SourcePanel dir={sourcePanel.dir} />
{/if}

<style>
  .chrome-layer {
    position: absolute;
    inset: 0;
    /* rung: chrome (Z.chrome = 400). Ported from the pre-ladder 10 in
       the AI-IMP-161 inversion fix so chrome stays above panels after
       panels rose to their rung. */
    z-index: 400;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--chrome-fade-ms) ease-out;
  }

  .chrome-layer.faded {
    opacity: 0;
  }

  .reservation-debug {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .reserve { position: absolute; background: color-mix(in srgb, var(--ew-accent) 16%, transparent); }
  .reserve.top { inset: 0 0 auto; height: var(--ew-reserve-strip); }
  .reserve.right { inset: var(--ew-reserve-strip) 0 var(--ew-reserve-dock) auto; width: var(--ew-reserve-rail); }
  .reserve.bottom { inset: auto 0 0; height: var(--ew-reserve-dock); }
  .reserve.left { inset: var(--ew-reserve-strip) auto var(--ew-reserve-dock) 0; width: 0; }

  /* §8.2: controls rest at partial opacity; hovering lights that
     control alone to full. */
  .chrome-layer :global(button) {
    opacity: var(--chrome-rest-opacity);
  }

  .chrome-layer :global(button:hover) {
    opacity: 1;
  }
</style>
