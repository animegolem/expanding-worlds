<!--
  Hover-revealed title strip (RFC §8.2): file/view functions at the
  top edge, hidden otherwise. Carries the Board menu (the §6.7
  background operation set, ported from BoardToolbar) and the interim
  Create Pin… / Sources buttons until AI-IMP-067/065 retire them.
  Background EDIT mode renders as a persistent floating bar instead —
  Done/Cancel must not live behind a hover.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import type { BoardTooling } from '../canvas/board-tooling'
  import type { DecorationsUi } from '../canvas/decorations-ui'
  import type { SceneBackground, SceneDecoration } from '@ew/canvas-engine'
  import { tooltip } from './tooltip'
  import { TITLE_STRIP_REVEAL_PX } from './feel'

  const {
    handle,
    tooling,
    ui,
  }: { handle: CanvasHostHandle; tooling: BoardTooling; ui: DecorationsUi } = $props()

  let revealed = $state(false)
  let boardMenuOpen = $state(false)
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

  function fire(name: string): void {
    window.dispatchEvent(new CustomEvent(name))
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
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') boardMenuOpen = false
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
</script>

<div
  class="reveal-zone"
  style={`height: ${TITLE_STRIP_REVEAL_PX}px`}
  data-testid="title-strip-reveal"
  role="presentation"
  onpointerenter={() => (revealed = true)}
></div>

{#if revealed || boardMenuOpen}
  <div class="title-strip" data-testid="title-strip" role="toolbar" tabindex="-1" onpointerleave={hide}>
    <button
      type="button"
      data-testid="board-menu-button"
      class:active={boardMenuOpen}
      onclick={() => (boardMenuOpen = !boardMenuOpen)}
      use:tooltip={{ name: 'Board — background and hidden items' }}
    >
      Board
    </button>
    <span class="spacer"></span>
    <button
      type="button"
      data-testid="toggle-sources"
      onclick={() => fire('ew-toggle-sources')}
      use:tooltip={{ name: 'Placement sources (interim — the outline view replaces this)' }}
    >
      Sources
    </button>
    <button
      type="button"
      data-testid="open-create-pin"
      onclick={() => fire('ew-open-create-pin')}
      use:tooltip={{ name: 'Create Pin… (interim — the ◉ pin tool replaces this)' }}
    >
      Create Pin…
    </button>
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
          value={color ?? '#17191d'}
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
    pointer-events: auto;
  }

  .title-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.6rem;
    background: rgba(23, 25, 29, 0.92);
    border-bottom: 1px solid #2e3138;
    font-size: 0.75rem;
    color: #dde3ea;
    pointer-events: auto;
  }

  .spacer {
    flex: 1;
  }

  .board-menu {
    position: absolute;
    top: 2rem;
    left: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0.6rem;
    background: rgba(23, 25, 29, 0.95);
    border: 1px solid #2e3138;
    border-radius: 0 0 7px 7px;
    font-size: 0.75rem;
    color: #dde3ea;
    pointer-events: auto;
  }

  .bg-edit-bar {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    background: rgba(23, 25, 29, 0.95);
    border: 1px solid #2e3138;
    border-radius: 7px;
    font-size: 0.75rem;
    color: #dde3ea;
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
    background: #23262c;
    color: #dde3ea;
    border: 1px solid #3a3e46;
    border-radius: 4px;
    cursor: pointer;
  }

  button.active {
    background: #4a9df0;
    border-color: #4a9df0;
    color: #10131a;
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
    border: 1px solid #3a3e46;
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
