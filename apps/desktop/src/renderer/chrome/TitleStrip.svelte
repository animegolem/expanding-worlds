<!--
  Hover-revealed title strip (RFC §8.2): file/view functions at the
  top edge, hidden otherwise. Carries the Board menu (the §6.7
  background operation set, ported from BoardToolbar); the interim
  Create Pin… and Sources buttons retired with AI-IMP-067/070.
  Background EDIT mode renders as a persistent floating bar instead —
  Done/Cancel must not live behind a hover.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import type { BoardTooling } from '../canvas/board-tooling'
  import type { DecorationsUi } from '../canvas/decorations-ui'
  import type { SceneBackground, SceneDecoration } from '@ew/canvas-engine'
  import { fade } from 'svelte/transition'
  import { appSettings, onAppSettingsChanged } from '../settings/settings'
  import { themeTokenValue } from '../theme'
  import { tooltip } from './tooltip'
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

  const {
    handle,
    tooling,
    ui,
  }: { handle: CanvasHostHandle; tooling: BoardTooling; ui: DecorationsUi } = $props()

  // §8.2 frameless shell: the strip's dress depends on where the OS
  // window controls sit. macOS gets in-board traffic lights (pad the
  // strip's left edge to clear them); Windows gets the top-right
  // titleBarOverlay; Linux has neither, so the strip draws its own
  // min/max/close wired over window:* IPC.
  const platform = window.ew?.window?.platform ?? 'darwin'
  const isMac = platform === 'darwin'
  const isLinux = platform !== 'darwin' && platform !== 'win32'

  let revealed = $state(false)
  let boardMenuOpen = $state(false)
  // §11.5 title-strip mode: hover-reveal (default) · always · never.
  let stripMode = $state(appSettings().titleStrip)
  $effect(() => onAppSettingsChanged((settings) => (stripMode = settings.titleStrip)))
  const stripVisible = $derived(
    stripMode === 'always' || (stripMode === 'hover' && (revealed || boardMenuOpen)),
  )
  // Switching to never while the Board menu is up would strand an
  // unreachable menu — fold it with the strip.
  $effect(() => {
    if (stripMode === 'never') boardMenuOpen = false
  })
  let hasImageSelected = $state(tooling.selectedImagePlacement() !== null)
  let background = $state<SceneBackground | null>(tooling.background())
  let editing = $state(tooling.backgroundEditActive())
  let hidden = $state<SceneDecoration[]>([])
  let fileInput = $state<HTMLInputElement | null>(null)

  function refresh(): void {
    hasImageSelected = tooling.selectedImagePlacement() !== null
    background = tooling.background()
    editing = tooling.backgroundEditActive()
    hidden = ui.hiddenDecorations()
  }

  $effect(() => {
    const offSelection = handle.controller.selection.onChanged(() => refresh())
    const offTooling = tooling.onChanged(() => refresh())
    const offScene = handle.onSceneApplied(() => refresh())
    refresh()
    return () => {
      offSelection()
      offTooling()
      offScene()
    }
  })

  const hasBackground = $derived(background?.assetId != null)
  const color = $derived(background?.color ?? null)

  function onFilePicked(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void tooling.setBackgroundFromFile(file)
  }

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

  $effect(() => {
    if (!boardMenuOpen) return
    // AI-IMP-183 (M-24): consume Escape (capture + stopPropagation) so it
    // closes the Board menu without leaking to the canvas underneath.
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      boardMenuOpen = false
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })

  // AI-IMP-215: §8.2 desk physics — a pointerdown on the BOARD (empty ground)
  // puts the open Board menu down, the grammar 188 gave the gallery's
  // onGalleryGroundPointerDown. The board surface is the Pixi <canvas> itself
  // (the .canvas-host div wraps the whole chrome layer, so it can't stand in
  // for "the board"); a chrome click — the menu, a notice, the dock — targets
  // a div/button, never the canvas, so the menu is left standing (only empty
  // ground puts things down, and background work like a notice-dismiss must
  // not fold the menu it belongs to). Escape (above) still peels it first.
  //
  // SWALLOW RULE (stated + pinned by e2e): the dismissing board click is
  // SWALLOWED (stopPropagation at capture, before the canvas' own capture
  // listener) so it ONLY lowers the menu and does not also act on the board
  // beneath — no stray deselect/marquee. This matches the gallery precedent
  // (the dismissing click is consumed). No race with the strip's lower: the
  // strip hides by instant unmount (the 191 ghost lesson — no outros),
  // reveal/lower is the pointermove above and never the click, so dropping
  // boardMenuOpen here just unmounts the strip in the same tick.
  $effect(() => {
    if (!boardMenuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target?.tagName !== 'CANVAS') return
      boardMenuOpen = false
      event.stopPropagation()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  })
</script>

<svelte:window onpointermove={onWindowPointerMove} />

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
    <button
      type="button"
      class="no-drag board-trigger"
      data-testid="board-menu-button"
      class:active={boardMenuOpen}
      onclick={() => (boardMenuOpen = !boardMenuOpen)}
      use:tooltip={{ name: 'Board — background and hidden items' }}
    >
      Board
    </button>
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

{#if boardMenuOpen}
  <div class="board-menu" data-testid="board-menu">
    <div class="row">
      <button
        type="button"
        data-testid="bg-set-from-selection"
        disabled={!hasImageSelected}
        onclick={() => void tooling.setBackgroundFromSelection()}
      >
        {hasBackground ? 'Replace BG with selection' : 'Set BG from selection'}
      </button>
      <button type="button" data-testid="bg-set-from-file" onclick={() => fileInput?.click()}>
        BG from file…
      </button>
      <input
        type="file"
        accept="image/*"
        class="file-input"
        data-testid="bg-file-input"
        bind:this={fileInput}
        onchange={onFilePicked}
      />
    </div>
    <div class="row">
      <button
        type="button"
        data-testid="bg-edit"
        disabled={!hasBackground}
        onclick={() => {
          tooling.enterBackgroundEdit()
          boardMenuOpen = false
        }}
      >
        Edit BG position
      </button>
      <button
        type="button"
        data-testid="bg-reset"
        disabled={!hasBackground}
        onclick={() => void tooling.resetBackgroundTransform()}
      >
        Reset BG
      </button>
      <button
        type="button"
        data-testid="bg-remove"
        disabled={!hasBackground}
        onclick={() => void tooling.removeBackground()}
      >
        Remove BG
      </button>
    </div>
    <div class="row">
      <label>
        Color
        <input
          type="color"
          data-testid="bg-color"
          value={color ?? themeTokenValue('--ew-surface-solid')}
          onchange={(e) => void tooling.setBackgroundColor((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <button
        type="button"
        data-testid="bg-color-clear"
        disabled={color === null}
        onclick={() => void tooling.setBackgroundColor(null)}
      >
        Clear color
      </button>
    </div>
    {#if hidden.length > 0}
      <div class="row hidden-list" data-testid="hidden-list">
        <span>Hidden:</span>
        {#each hidden as d (d.id)}
          <button type="button" data-testid={`deco-show-${d.id}`} onclick={() => void ui.show(d.id)}>
            Show {d.kind}
          </button>
        {/each}
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

  /* The strip is a temporary top-edge layer: a smoky near-black gradient
     (never a bar, §8.2) that dissolves downward into the board and IS
     the window drag handle. PathBar (z-index 4, the signature spot)
     reads ABOVE it on purpose — the gradient is a backdrop, not a
     cover, so the bare path text stays legible while it fades in.
     AI-IMP-191: the mount now carries in:fade (script block) instead of
     popping — opacity is the only property that animates (§8.2
     decision-01: chrome animates exactly one property), matching the
     ratified prototype's 220ms ease-out. */
  .title-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.32rem 0.6rem 0.7rem;
    /* AI-IMP-191: matches the ratified prototype's exact stops (stripzone
       [data-strip]) — a continuous smoky decay (.82 → .55 → .28), not a
       flat cap that cuts to fully transparent. All three stops are
       :root-only strip tokens (chrome-mono, never re-themed — --ew-scrim
       would have flipped the middle stop light in the light theme). */
    background: linear-gradient(
      to bottom,
      var(--ew-strip-scrim) 0%,
      var(--ew-strip-scrim-mid) 55%,
      var(--ew-strip-scrim-fade) 100%
    );
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

  /* AI-IMP-191: PathBar (the signature spot) now reads above the strip
     at the traffic-light corner (z-index 4), so Board can no longer
     share that corner without silently losing its hit target underneath
     the path's buttons. Pushed to the strip's own right edge instead —
     the auto margin also carries window-controls (Linux) along with it. */
  .board-trigger {
    margin-left: auto;
  }

  .window-controls {
    display: flex;
    gap: 0.25rem;
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

  .board-menu {
    position: absolute;
    top: 2rem;
    /* AI-IMP-191: mirrors .board-trigger's move to the strip's right
       edge — the dropdown stays anchored under its own opener. */
    right: 0.5rem;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.6rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 0 0 7px 7px;
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
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

  .row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  button {
    padding: 0.15rem 0.45rem;
    background: var(--ew-surface-raised);
    color: var(--ew-text);
    border: 1px solid var(--ew-border-strong);
    border-radius: 4px;
    cursor: pointer;
  }

  button.active {
    background: var(--ew-accent);
    border-color: var(--ew-accent);
    color: var(--ew-on-accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  input[type='color'] {
    width: 1.6rem;
    height: 1.3rem;
    padding: 0;
    border: 1px solid var(--ew-border-strong);
    background: transparent;
  }

  /* Kept in the DOM (not display:none) so e2e setInputFiles can reach it. */
  .file-input {
    width: 1px;
    height: 1px;
    opacity: 0;
    position: absolute;
    pointer-events: none;
  }
</style>
