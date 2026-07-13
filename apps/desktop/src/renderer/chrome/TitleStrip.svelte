<!--
  Hover-revealed title strip (RFC §8.2): window furniture at the top
  edge, hidden otherwise. Board identity/actions live on PathBar's
  current crumb; this strip never owns a popover and never holds itself
  open after the pointer leaves the band.
  Background EDIT mode renders as a persistent floating bar instead —
  Done/Cancel must not live behind a hover.
-->
<script lang="ts">
  import type { BoardTooling } from '../canvas/board-tooling'
  import { fade } from 'svelte/transition'
  import { appSettings, onAppSettingsChanged } from '../settings/settings'
  import { tooltip } from './tooltip'
  import { onTitleBandEnter } from './engagement'
  import { TITLE_STRIP_REVEAL_PX } from './feel'

  // AI-IMP-191: decision-01's hover reveal is opacity-only — chrome
  // animates exactly one property. 220ms matches the ratified prototype
  // (Pin & Menu Motion Prototype, [data-strip]{transition:opacity 220ms
  // ease-out}). A real fade (not a plain mount) so it smokes in instead
  // of popping. INTRO ONLY (in:fade, never transition:fade): an outro
  // keeps the fading strip in the DOM for 220ms after hide, and
  // everything that polls "is the strip up?" (revealTitleStrip's
  // idempotence guard) reads that ghost as open, then clicks race the
  // detach — reproduced as a deterministic openBoardMenu deadlock in
  // board-tooling e2e. Hide stays the instant unmount it always was.
  const STRIP_FADE_MS = 220

  const { tooling }: { tooling: BoardTooling } = $props()

  // §8.2 frameless shell: the strip's dress depends on where the OS
  // window controls sit. macOS gets in-board traffic lights (pad the
  // strip's left edge to clear them); Windows gets the top-right
  // titleBarOverlay; Linux has neither, so the strip draws its own
  // min/max/close wired over window:* IPC.
  const platform = window.ew?.window?.platform ?? 'darwin'
  const isMac = platform === 'darwin'
  const isLinux = platform !== 'darwin' && platform !== 'win32'

  let revealed = $state(false)
  // §11.5 title-strip mode: hover-reveal (default) · always · never.
  let stripMode = $state(appSettings().titleStrip)
  $effect(() => onAppSettingsChanged((settings) => (stripMode = settings.titleStrip)))
  const stripVisible = $derived(stripMode === 'always' || (stripMode === 'hover' && revealed))
  let editing = $state(tooling.backgroundEditActive())

  function refresh(): void {
    editing = tooling.backgroundEditActive()
  }

  $effect(() => {
    const offTooling = tooling.onChanged(() => refresh())
    refresh()
    return offTooling
  })

  // AI-IMP-214: the reveal is sensed off the cursor's Y over the whole
  // would-be-chrome band (TITLE_STRIP_REVEAL_PX), NOT a pointer-events
  // overlay — the reveal-zone below is inert (pointer-events:none) so the
  // trigger arms reveal only and never sinks a canvas click beneath it.
  // Below the band lowers the strip (the Board menu still holds it up via
  // stripVisible while open). One source of truth for reveal/lower, so
  // there is no pointerleave-vs-band flicker in the strip's own gap.
  function onWindowPointerMove(event: PointerEvent): void {
    if (stripMode !== 'hover') return
    revealed = event.clientY <= TITLE_STRIP_REVEAL_PX
  }

  // AI-IMP-255: over the OS-owned drag band (mac hidden titlebar /
  // Windows titleBarOverlay) NO pointermove arrives, so the Y-sense
  // above can never reveal there — the band-enter signal (derived from
  // the synthetic pointerleave in engagement.ts) is the reveal trigger
  // for the packaged frameless shell. Lowering stays with the
  // pointermove (events resume below the band) plus blur, so a cursor
  // parked off-window above the strip can't pin it forever once focus
  // moves on.
  $effect(() =>
    onTitleBandEnter(() => {
      if (stripMode === 'hover') revealed = true
    }),
  )

  function onWindowBlur(): void {
    if (stripMode !== 'hover') return
    revealed = false
  }

</script>

<svelte:window onpointermove={onWindowPointerMove} onblur={onWindowBlur} />

{#if stripMode === 'hover'}
  <!-- AI-IMP-214: the reveal is cursor-Y sensed (onWindowPointerMove); this
       zone is inert (pointer-events:none) and stays only as the hover TARGET
       e2e boundingBoxes against — so the widened band never sinks a canvas
       click that lands in it. -->
  <div
    class="reveal-zone"
    style={`height: ${TITLE_STRIP_REVEAL_PX}px`}
    data-testid="title-strip-reveal"
    role="presentation"
  ></div>
{/if}

{#if stripVisible}
  <!-- §8.2 "the shell eats the window": the strip root IS the window
       drag handle (-webkit-app-region: drag). AI-IMP-191's reveal is a
       genuine fade (in:fade, opacity only — chrome animates exactly one
       property) rather than a hard mount pop; hide stays an instant
       unmount (see STRIP_FADE_MS above for why an outro is forbidden),
       so the reveal-zone hover contract e2e already relies on keeps
       working. Every interactive child carves itself back out with
       no-drag, or the OS would swallow the click as a window move.
       data-drag-region mirrors the CSS so e2e can assert the handle
       without depending on -webkit-app-region surfacing through
       getComputedStyle. -->
  <div
    class="title-strip"
    class:mac={isMac}
    data-testid="title-strip"
    data-drag-region="drag"
    role="toolbar"
    tabindex="-1"
    in:fade={{ duration: STRIP_FADE_MS }}
  >
    {#if isLinux}
      <!-- §8.2: Linux frame:false has no OS controls; draw them here,
           pushed to the right, wired over IPC. Untested off macOS. -->
      <div class="window-controls no-drag" data-testid="window-controls">
        <button
          type="button"
          class="no-drag"
          data-testid="window-minimize"
          aria-label="Minimize"
          onclick={() => void window.ew.window.minimize()}
          use:tooltip={{ name: 'Minimize' }}>–</button
        >
        <button
          type="button"
          class="no-drag"
          data-testid="window-maximize"
          aria-label="Maximize"
          onclick={() => void window.ew.window.toggleMaximize()}
          use:tooltip={{ name: 'Maximize' }}>▢</button
        >
        <button
          type="button"
          class="no-drag close"
          data-testid="window-close"
          aria-label="Close"
          onclick={() => void window.ew.window.close()}
          use:tooltip={{ name: 'Close' }}>✕</button
        >
      </div>
    {/if}
  </div>
{/if}

{#if editing}
  <div class="bg-edit-bar" data-testid="bg-edit-bar">
    <span data-testid="bg-edit-active">Editing background — drag to move, wheel to scale</span>
    <button type="button" data-testid="bg-scale-up" onclick={() => tooling.scaleBackgroundBy(1.1)}>
      +
    </button>
    <button type="button" data-testid="bg-scale-down" onclick={() => tooling.scaleBackgroundBy(1 / 1.1)}>
      −
    </button>
    <button type="button" data-testid="bg-edit-done" onclick={() => void tooling.commitBackgroundEdit()}>
      Done
    </button>
    <button type="button" data-testid="bg-edit-cancel" onclick={() => tooling.cancelBackgroundEdit()}>
      Cancel
    </button>
  </div>
{/if}

<style>
  .reveal-zone {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    /* AI-IMP-214: inert — the reveal is cursor-Y sensed, so this zone must
       never sink a canvas click that lands in the widened band. It stays in
       the DOM purely as the e2e hover target's boundingBox anchor. */
    pointer-events: none;
  }

  /* The strip is now pure window furniture: it supplies the drag band
     and Linux controls, never a smoky paint layer. Identity/action
     containers in PathBar carry their own legibility. */
  .title-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    /* AI-IMP-272: the band is FIXED at the prototype's 46px (=
       TITLE_STRIP_REVEAL_PX — the reveal threshold IS the band).
       The old content-height (~30px, asymmetric padding) collapsed
       the .82→.28 gradient onto a near-invisible sliver — the
       owner's "the gradient doesn't fire" — and floated the row off
       the traffic-light axis. Row centers at y=23 with the lights
       (main: trafficLightPosition y:17 + 12px dots). */
    height: var(--ew-reserve-strip);
    box-sizing: border-box;
    border-bottom: 1px solid var(--ew-strip-hairline);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.6rem;
    background: transparent;
    font-size: 0.75rem;
    color: var(--ew-strip-text);
    pointer-events: auto;
    -webkit-app-region: drag;
  }

  /* macOS traffic lights sit in-board over the strip's left edge
     (trafficLightPosition x:14); reserve the clearance even though
     nothing of the strip's own draws there any more (§8.2 decision-01:
     that corner is the signature spot's alone — see .board-trigger). */
  .title-strip.mac {
    padding-left: 5rem;
  }

  /* Every interactive child must opt back out of the drag region, or
     the OS eats the click as a window move. */
  .no-drag {
    -webkit-app-region: no-drag;
  }

  .window-controls {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  .window-controls button {
    min-width: 1.5rem;
    line-height: 1;
  }

  .window-controls .close:hover {
    background: var(--ew-danger);
    border-color: var(--ew-danger);
    color: var(--ew-on-accent);
  }

  .bg-edit-bar {
    position: absolute;
    top: 0.5rem;
    z-index: 3;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
  }

  button {
    padding: 0.15rem 0.45rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

</style>
