<script lang="ts">
  /**
   * Board toolbar (AI-IMP-022): §6.9 align/distribute (one durable
   * command each, gated on selection size), camera-only zoom-to-fit/
   * selection, and the §6.7 background operation set including the
   * explicit background edit mode and the color-beneath-image picker.
   */
  import type { AlignOp, DistributeAxis, ReorderOp, SceneBackground } from '@ew/canvas-engine'
  import type { CanvasHostHandle } from './canvas/host'
  import type { BoardTooling } from './canvas/board-tooling'

  const { handle, tooling }: { handle: CanvasHostHandle; tooling: BoardTooling } = $props()

  const alignOps: Array<{ op: AlignOp; label: string }> = [
    { op: 'left', label: 'Left' },
    { op: 'hcenter', label: 'Center' },
    { op: 'right', label: 'Right' },
    { op: 'top', label: 'Top' },
    { op: 'vmiddle', label: 'Middle' },
    { op: 'bottom', label: 'Bottom' },
  ]
  const distributeOps: Array<{ axis: DistributeAxis; label: string }> = [
    { axis: 'horizontal', label: 'Distribute H' },
    { axis: 'vertical', label: 'Distribute V' },
  ]
  const reorderOps: Array<{ op: ReorderOp; label: string }> = [
    { op: 'forward', label: 'Forward' },
    { op: 'backward', label: 'Backward' },
    { op: 'front', label: 'To front' },
    { op: 'back', label: 'To back' },
  ]

  let selectionCount = $state(handle.controller.selection.size)
  let hasImageSelected = $state(tooling.selectedImagePlacement() !== null)
  let background = $state<SceneBackground | null>(tooling.background())
  let editing = $state(tooling.backgroundEditActive())
  let fileInput = $state<HTMLInputElement | null>(null)

  function refresh(): void {
    selectionCount = handle.controller.selection.size
    hasImageSelected = tooling.selectedImagePlacement() !== null
    background = tooling.background()
    editing = tooling.backgroundEditActive()
  }

  $effect(() => {
    const offSelection = handle.controller.selection.onChanged(() => refresh())
    const offTooling = tooling.onChanged(() => refresh())
    // Deterministic (AI-IMP-054): refresh when the host has actually
    // applied the fresh scene, not a 120 ms guess later.
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
</script>

<div class="board-toolbar" data-testid="board-toolbar">
  <div class="row">
    {#each alignOps as entry (entry.op)}
      <button
        type="button"
        data-testid={`align-${entry.op}`}
        disabled={selectionCount < 2}
        onclick={() => void tooling.align(entry.op)}
      >
        {entry.label}
      </button>
    {/each}
    {#each distributeOps as entry (entry.axis)}
      <button
        type="button"
        data-testid={`distribute-${entry.axis}`}
        disabled={selectionCount < 3}
        onclick={() => void tooling.distribute(entry.axis)}
      >
        {entry.label}
      </button>
    {/each}
    {#each reorderOps as entry (entry.op)}
      <button
        type="button"
        data-testid={`order-${entry.op}`}
        disabled={selectionCount < 1}
        onclick={() => void tooling.reorder(entry.op)}
      >
        {entry.label}
      </button>
    {/each}
    <button type="button" data-testid="zoom-fit" onclick={() => tooling.zoomToFit()}>
      Zoom fit
    </button>
    <button
      type="button"
      data-testid="zoom-selection"
      disabled={selectionCount < 1}
      onclick={() => tooling.zoomToSelection()}
    >
      Zoom selection
    </button>
  </div>
  <div class="row">
    {#if editing}
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
    {:else}
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
      <button
        type="button"
        data-testid="bg-edit"
        disabled={!hasBackground}
        onclick={() => tooling.enterBackgroundEdit()}
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
    {/if}
  </div>
</div>

<style>
  .board-toolbar {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    background: rgba(23, 25, 29, 0.88);
    border: 1px solid #2e3138;
    border-radius: 6px;
    font-size: 0.75rem;
    color: #dde3ea;
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
