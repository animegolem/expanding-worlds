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
  import { appSettings, onAppSettingsChanged } from '../settings/settings'
  import { themeTokenValue } from '../theme'
  import { tooltip } from './tooltip'
  import { TITLE_STRIP_REVEAL_PX } from './feel'

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

  // Leaving the strip lowers it; the Board menu holds it up while
  // open and closes only on Escape or its own button — deliberately
  // NOT on click-away, so background work (pick image, click canvas,
  // adjust) doesn't fight the menu.
  function hide(): void {
    revealed = false
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
</script>

{#if stripMode === 'hover'}
  <div
    class="reveal-zone"
    style={`height: ${TITLE_STRIP_REVEAL_PX}px`}
    data-testid="title-strip-reveal"
    role="presentation"
    onpointerenter={() => (revealed = true)}
  ></div>
{/if}

{#if stripVisible}
  <!-- §8.2 "the shell eats the window": the strip root IS the window
       drag handle (-webkit-app-region: drag). Every interactive child
       carves itself back out with no-drag, or the OS would swallow the
       click as a window move. data-drag-region mirrors the CSS so e2e
       can assert the handle without depending on -webkit-app-region
       surfacing through getComputedStyle. -->
  <div
    class="title-strip"
    class:mac={isMac}
    data-testid="title-strip"
    data-drag-region="drag"
    role="toolbar"
    tabindex="-1"
    onpointerleave={hide}
  >
    <button
      type="button"
      class="no-drag"
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
    z-index: 2; /* above the path bar so the top edge always reveals */
    pointer-events: auto;
  }

  /* The strip and its sheets are a temporary top-edge layer and must
     paint over the path bar (which occupies the same corner). §8.2:
     a smoky near-black gradient (never a bar) that dissolves downward
     into the board, and the window drag handle. */
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
    background: linear-gradient(
      to bottom,
      var(--ew-strip-scrim) 0%,
      var(--ew-strip-scrim) 55%,
      var(--ew-strip-scrim-fade) 100%
    );
    font-size: 0.75rem;
    color: var(--ew-strip-text);
    pointer-events: auto;
    -webkit-app-region: drag;
  }

  /* macOS traffic lights sit in-board over the strip's left edge
     (trafficLightPosition x:14); clear them so strip content never
     collides with or hides behind the lights. */
  .title-strip.mac {
    padding-left: 5rem;
  }

  /* Every interactive child must opt back out of the drag region, or
     the OS eats the click as a window move. */
  .no-drag {
    -webkit-app-region: no-drag;
  }

  .window-controls {
    margin-left: auto;
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
    left: 0.5rem;
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
