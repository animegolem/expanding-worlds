<!--
  The note-panel layer (RFC §8.5, AI-IMP-064): hosts the one tethered
  panel and every pinned panel, plus the escalating indicator for how
  broken each pinned panel's spatial link is — node on-screen ⇒ an
  accent halo (distinct from selection); node off-screen on this
  canvas ⇒ an edge chip that flies home; node on another canvas ⇒ the
  panel's own header origin label (rendered by NotePanel). Each state
  exists exactly as long as its condition holds.
-->
<script lang="ts">
  import { itemWorldAABB } from '@ew/canvas-engine'
  import type { CanvasHostHandle } from '../canvas/host'
  import { importFilesAt } from '../canvas/import-surfaces'
  import LocationChooser from './LocationChooser.svelte'
  import NotePanel from './NotePanel.svelte'
  import {
    closeBigEditor,
    onBigEditorChanged,
    onChooserChanged,
    onPanelsChanged,
    overlayPortal,
    type ChooserState,
    type PanelRecord,
  } from './panels'

  const { handle, hostElement }: { handle: CanvasHostHandle; hostElement: HTMLElement } = $props()

  let records = $state<readonly PanelRecord[]>([])
  $effect(() => onPanelsChanged((next) => (records = next)))

  let chooser = $state<ChooserState | null>(null)
  $effect(() => onChooserChanged((next) => (chooser = next)))

  // §8.5 big editor (rev 0.31): at most ONE, tracked in the store.
  // This layer mounts the dimmed backdrop + centered container; the
  // owning NotePanel moves its live CM buffer in via `overlayHost`.
  let bigEditorKey = $state<number | null>(null)
  $effect(() => onBigEditorChanged((next) => (bigEditorKey = next)))
  let bigEditorHost = $state<HTMLElement | null>(null)

  // §6.1 note-pane image drop (AI-IMP-097): the big editor is a note
  // surface too. An image dropped on it imports onto the active board
  // beside the note's placement (same rule as the panel), while text
  // drops stay with CodeMirror. World point per the owning record's
  // anchor: a live placement → beside its node; a provisional pin
  // point → the point; otherwise the view center.
  function bigEditorDropWorld(): { x: number; y: number } {
    const camera = handle.controller.camera
    const record = records.find((candidate) => candidate.key === bigEditorKey)
    const anchor = record?.anchor
    if (anchor?.kind === 'placement' && anchor.canvasId === handle.canvasId) {
      const item = handle.controller.items().find((candidate) => candidate.id === anchor.placementId)
      const aabb = item ? itemWorldAABB(item) : null
      if (aabb) {
        const gap = 32 / camera.zoom
        return { x: aabb.x + aabb.width + gap, y: aabb.y }
      }
    }
    if (anchor?.kind === 'point' && anchor.canvasId === handle.canvasId) {
      return { x: anchor.x, y: anchor.y }
    }
    const bounds = hostElement.getBoundingClientRect()
    return camera.screenToWorld({ x: bounds.width / 2, y: bounds.height / 2 })
  }

  function onBigEditorDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onBigEditorDrop(event: DragEvent): void {
    const dt = event.dataTransfer
    if (!dt || dt.files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const images = [...dt.files].filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const canvasId = handle.canvasId // gesture-time board (AI-IMP-085)
    void importFilesAt(handle, images, bigEditorDropWorld(), canvasId, {
      x: event.clientX,
      y: event.clientY,
    })
    window.dispatchEvent(
      new CustomEvent('ew-board-notice', {
        detail: { message: 'Images live on the board — placed beside the note.' },
      }),
    )
  }

  // Escape maps to Done (§8.5): back to the prior panel state.
  function onWindowKeydown(event: KeyboardEvent): void {
    if (bigEditorKey === null || event.key !== 'Escape') return
    event.stopPropagation()
    closeBigEditor()
  }

  interface Indicator {
    key: number
    kind: 'halo' | 'edge'
    x: number
    y: number
    width: number
    height: number
    angle: number
    flyTo: () => void
  }

  let indicators = $state<Indicator[]>([])

  function computeIndicators(): void {
    const bounds = hostElement.getBoundingClientRect()
    const camera = handle.controller.camera
    const next: Indicator[] = []
    for (const record of records) {
      if (!record.pinned) continue
      if (record.anchor.kind !== 'placement') continue
      if (record.anchor.canvasId !== handle.canvasId) continue // origin label's job
      const anchor = record.anchor
      const item = handle.controller.items().find((candidate) => candidate.id === anchor.placementId)
      const aabb = item ? itemWorldAABB(item) : null
      if (!aabb) continue // anchor gone: no surface, no debt
      const topLeft = camera.worldToScreen({ x: aabb.x, y: aabb.y })
      const size = { width: aabb.width * camera.zoom, height: aabb.height * camera.zoom }
      const onScreen =
        topLeft.x + size.width > 0 &&
        topLeft.y + size.height > 0 &&
        topLeft.x < bounds.width &&
        topLeft.y < bounds.height
      if (onScreen) {
        next.push({
          key: record.key,
          kind: 'halo',
          x: topLeft.x - 5,
          y: topLeft.y - 5,
          width: size.width + 10,
          height: size.height + 10,
          angle: 0,
          flyTo: () => {},
        })
      } else {
        // Edge chip: clamped toward the node, pointing along the way.
        // The 48px margin keeps chips out from under the corner
        // chrome (path bar, rail, dock), which floats a layer above.
        const center = camera.worldToScreen({
          x: aabb.x + aabb.width / 2,
          y: aabb.y + aabb.height / 2,
        })
        const x = Math.min(Math.max(48, center.x), bounds.width - 48)
        const y = Math.min(Math.max(48, center.y), bounds.height - 48)
        const angle = Math.atan2(center.y - y, center.x - x)
        next.push({
          key: record.key,
          kind: 'edge',
          x,
          y,
          width: 24,
          height: 24,
          angle,
          flyTo: () => handle.flyTo(aabb),
        })
      }
    }
    indicators = next
  }

  let frame = 0
  function schedule(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      computeIndicators()
    })
  }

  $effect(() => {
    const offCamera = handle.controller.camera.onChanged(() => schedule())
    const offScene = handle.onSceneApplied(() => schedule())
    const offPanels = onPanelsChanged(() => schedule())
    schedule()
    return () => {
      offCamera()
      offScene()
      offPanels()
      if (frame) cancelAnimationFrame(frame)
    }
  })
</script>

<div class="panels-layer" data-testid="note-panels">
  {#each indicators as indicator (`${indicator.kind}-${indicator.key}`)}
    {#if indicator.kind === 'halo'}
      <div
        class="halo"
        data-testid={`panel-halo-${indicator.key}`}
        style={`left:${indicator.x}px;top:${indicator.y}px;width:${indicator.width}px;height:${indicator.height}px`}
      ></div>
    {:else}
      <button
        type="button"
        class="edge-chip"
        data-testid={`panel-edge-chip-${indicator.key}`}
        style={`left:${indicator.x - 12}px;top:${indicator.y - 12}px`}
        onclick={indicator.flyTo}
        aria-label="Fly to this panel's node"
      >
        <span style={`transform: rotate(${indicator.angle}rad)`}>➤</span>
      </button>
    {/if}
  {/each}
  {#each records as record (record.key)}
    <NotePanel
      {handle}
      {record}
      overlayHost={bigEditorKey === record.key ? bigEditorHost : null}
    />
  {/each}
  {#if bigEditorKey !== null}
    <!-- Dimmed board, not a hidden one: clicking the surround is
         Done (§8.5). The container below receives the panel's live
         editor DOM — the buffer moves, it is never re-created. Both
         elements portal to the root overlay host (§8.8 law 2), so the
         scrim covers chrome; the buffer-move survives the reparent
         exactly as it already survives note-editor's own reparent. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="big-editor-backdrop"
      data-testid="big-editor-backdrop"
      onclick={() => closeBigEditor()}
      use:overlayPortal
    ></div>
    <section
      class="big-editor"
      data-testid="big-editor"
      aria-modal="true"
      role="dialog"
      use:overlayPortal
      ondragovercapture={onBigEditorDragOver}
      ondropcapture={onBigEditorDrop}
    >
      <header class="big-editor-header">
        <button
          type="button"
          class="big-editor-done"
          data-testid="big-editor-done"
          onclick={() => closeBigEditor()}
        >
          Done
        </button>
      </header>
      <div class="big-editor-body" bind:this={bigEditorHost}></div>
    </section>
  {/if}
  {#if chooser}
    <LocationChooser state={chooser} {hostElement} />
  {/if}
</div>

<svelte:window onkeydown={onWindowKeydown} />

<style>
  .panels-layer {
    position: absolute;
    inset: 0;
    z-index: 8;
    pointer-events: none;
    overflow: hidden;
  }

  .panels-layer :global(.note-panel),
  .panels-layer .edge-chip {
    pointer-events: auto;
  }

  /* The big editor portals out of .panels-layer into the root overlay
     host (pointer-events:none), so it opts back into hit-testing on
     its own elements rather than inheriting it from the layer. */
  .big-editor-backdrop {
    position: absolute;
    inset: 0;
    background: var(--ew-scrim);
    z-index: 40;
    pointer-events: auto;
  }

  /* Centered over a DIMMED board — not full-screen; the board stays
     visible around it (§8.5). Shadow tokens only: the depth cue. */
  .big-editor {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    width: min(760px, 78%);
    height: min(70vh, 640px);
    overflow: hidden;
    background: var(--ew-paper-surface);
    border: 1px solid var(--ew-paper-border-strong);
    border-radius: 10px;
    box-shadow: 0 18px 60px var(--ew-dialog-shadow);
    z-index: 41;
    pointer-events: auto;
  }

  .big-editor-header {
    display: flex;
    justify-content: flex-end;
    padding: 0.4rem 0.5rem 0.25rem;
  }

  .big-editor-done {
    padding: 0.15rem 0.7rem;
    border: 1px solid var(--ew-paper-border-strong);
    border-radius: 6px;
    background: var(--ew-paper-page);
    color: var(--ew-paper-text-heading);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .big-editor-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-size: 0.92rem;
  }

  .big-editor-body :global(.cm-editor) {
    height: 100%;
    background: var(--ew-paper-page);
  }

  .big-editor-body :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .halo {
    position: absolute;
    border: 2px solid var(--ew-accent-halo);
    border-radius: 7px;
    box-shadow: 0 0 10px var(--ew-accent-halo-shadow);
    pointer-events: none;
  }

  .edge-chip {
    position: absolute;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    background: var(--ew-surface);
    color: var(--ew-accent-soft);
    border: 1px solid var(--ew-border-accent-subtle);
    border-radius: 50%;
    cursor: pointer;
    font-size: 11px;
  }

  .edge-chip span {
    display: inline-block;
  }
</style>
