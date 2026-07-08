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
  import { EW_BEAT_TEAR_MS, EW_BEAT_UNTAPE_MS } from '../chrome/beats'
  import { tooltip } from '../chrome/tooltip'
  import LocationChooser from './LocationChooser.svelte'
  import NotePanel from './NotePanel.svelte'
  import PushPin from './paper/PushPin.svelte'
  import TornEdge from './paper/TornEdge.svelte'
  import { landmarkFacts, onLandmarksChanged, tornEdgeSide } from './paper/lifecycle'
  import {
    bigEditorIsTorn,
    closeBigEditor,
    onBigEditorChanged,
    onChooserChanged,
    onPanelsChanged,
    overlayPortal,
    pullLandmarkPin,
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
  //
  // §8.5 rev 0.55 (AI-IMP-135): the CENTERED TEAR variant wears the
  // torn-page chrome and beats. Its close is a TUCK: the store clears
  // its key immediately, but this layer keeps rendering for the
  // ~200ms reverse beat before unmounting — the page visibly tucks
  // home. Ordinary (untorn) big editors keep the instant close.
  let bigEditorKey = $state<number | null>(null)
  let bigTorn = $state(false)
  let bigTucking = $state(false)
  let tuckTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() =>
    onBigEditorChanged((next) => {
      if (next !== null) {
        if (tuckTimer !== null) clearTimeout(tuckTimer)
        tuckTimer = null
        bigEditorKey = next
        bigTorn = bigEditorIsTorn()
        bigTucking = false
        return
      }
      if (bigEditorKey !== null && bigTorn && !bigTucking) {
        bigTucking = true
        tuckTimer = setTimeout(() => {
          tuckTimer = null
          bigEditorKey = null
          bigTorn = false
          bigTucking = false
        }, EW_BEAT_UNTAPE_MS)
        return
      }
      if (!bigTucking) bigEditorKey = null
    }),
  )
  $effect(() => () => {
    if (tuckTimer !== null) clearTimeout(tuckTimer)
  })
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

  /** §8.5 rev 0.55 (AI-IMP-135): a LANDMARK — a torn page placed on
   * the board — keeps its torn edge and wears the red push pin, both
   * as world-tracked DOM hardware over the placement (the paper
   * primitives are Svelte components; the Pixi body stays untouched).
   * The pin is the pull-pin verb. */
  interface LandmarkView {
    placementId: string
    x: number
    y: number
    width: number
    height: number
    scar: 'left' | 'right' | 'top'
    pinSize: number
  }

  let landmarkViews = $state<LandmarkView[]>([])

  function computeLandmarks(): void {
    const camera = handle.controller.camera
    const next: LandmarkView[] = []
    for (const [placementId, fact] of landmarkFacts()) {
      const item = handle.controller
        .items()
        .find((candidate) => candidate.itemKind === 'placement' && candidate.id === placementId)
      const aabb = item ? itemWorldAABB(item) : null
      if (!aabb) continue // a stale fact decorates nothing
      const topLeft = camera.worldToScreen({ x: aabb.x, y: aabb.y })
      next.push({
        placementId,
        x: topLeft.x,
        y: topLeft.y,
        width: aabb.width * camera.zoom,
        height: aabb.height * camera.zoom,
        scar: tornEdgeSide(fact.tornFrom),
        // Hardware rides the world but stays legible: nominal 22px at
        // zoom 1, clamped so deep zoom keeps a graspable pin.
        pinSize: Math.max(12, Math.min(30, 22 * camera.zoom)),
      })
    }
    landmarkViews = next
  }

  function computeIndicators(): void {
    computeLandmarks()
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
    const offLandmarks = onLandmarksChanged(() => schedule())
    schedule()
    return () => {
      offCamera()
      offScene()
      offPanels()
      offLandmarks()
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
        use:tooltip={{ name: "Fly to this panel's node" }}
      >
        <span style={`transform: rotate(${indicator.angle}rad)`}>➤</span>
      </button>
    {/if}
  {/each}
  {#each landmarkViews as view (view.placementId)}
    <!-- §8.5 rev 0.55 (AI-IMP-135): the landmark's paper hardware —
         torn scar on the old binding edge, the red glossy push pin ON
         the paper (one of its three ratified appearances). FLAT: no
         shadow, board content. The pin is the pull-pin verb. -->
    <div
      class="landmark-hardware"
      data-testid={`landmark-hardware-${view.placementId}`}
      style={`left:${view.x}px;top:${view.y}px;width:${view.width}px;height:${view.height}px`}
    >
      <div class={`landmark-scar scar-${view.scar}`} data-testid="landmark-torn-edge">
        <TornEdge side={view.scar} />
      </div>
      <button
        type="button"
        class="landmark-pin"
        data-testid={`landmark-pin-${view.placementId}`}
        style={`width:${view.pinSize}px;height:${view.pinSize}px;margin-left:${-view.pinSize / 2}px;top:${-view.pinSize * 0.45}px`}
        onclick={() => void pullLandmarkPin(view.placementId)}
        aria-label="Pull the pin — lift this page back off the board"
        use:tooltip={{ name: 'Pull the pin — lift this page back off the board' }}
      >
        <PushPin size={view.pinSize} />
      </button>
    </div>
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
      class:tucking={bigTucking}
      data-testid="big-editor-backdrop"
      onclick={() => closeBigEditor()}
      use:overlayPortal
    ></div>
    <section
      class="big-editor"
      class:torn={bigTorn}
      class:tucking={bigTucking}
      style={`--big-tear-ms:${EW_BEAT_TEAR_MS}ms;--big-tuck-ms:${EW_BEAT_UNTAPE_MS}ms`}
      data-testid="big-editor"
      data-torn={bigTorn ? 'true' : null}
      aria-modal="true"
      role="dialog"
      use:overlayPortal
      ondragovercapture={onBigEditorDragOver}
      ondropcapture={onBigEditorDrop}
    >
      {#if bigTorn}
        <!-- The centered page IS the torn-out page: the scar rides its
             spine edge (§8.5 rev 0.55). -->
        <div class="big-editor-scar" data-testid="big-editor-torn-edge">
          <TornEdge side="left" teeth={18} />
        </div>
      {/if}
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
    /* rung: panel (Z.panel = 200). Was a pre-ladder 8, which sat the
       panels BENEATH the charms layer (Z.affordance = 100) — §8.8
       inversion: the charm bar intercepted clicks into panel content
       the moment AI-IMP-161 moved it below the label. Panels beat
       affordances; chrome still beats panels. */
    z-index: 200;
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

  /* §8.5 rev 0.55 (AI-IMP-135): the CENTERED TEAR. The open beat rides
     the independent translate/scale properties, composing with the
     centering transform instead of stomping it; one-shot always. The
     tuck reverses it (forwards-filled so the last frame holds while the
     unmount timer lands). */
  .big-editor.torn {
    animation: big-tear-in var(--big-tear-ms) ease-out 1;
  }

  @keyframes big-tear-in {
    0% {
      translate: -18px -10px;
      rotate: -1.5deg;
      opacity: 0.6;
    }
    100% {
      translate: 0 0;
      rotate: 0deg;
      opacity: 1;
    }
  }

  .big-editor.torn.tucking {
    animation: big-tuck-out var(--big-tuck-ms) ease-in 1 forwards;
  }

  @keyframes big-tuck-out {
    0% {
      translate: 0 0;
      scale: 1;
      opacity: 1;
    }
    100% {
      translate: 10px 6px;
      scale: 0.96;
      opacity: 0;
    }
  }

  .big-editor-backdrop.tucking {
    opacity: 0;
    transition: opacity var(--big-tuck-ms, 200ms) ease-in;
  }

  /* The centered page's spine scar: an interior band on the left edge. */
  .big-editor-scar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 10px;
    overflow: hidden;
    pointer-events: none;
  }

  /* §8.5 rev 0.55 (AI-IMP-135): landmark hardware — world-tracked,
     FLAT (no shadow: it is board content), inert except the pin. */
  .landmark-hardware {
    position: absolute;
    overflow: visible;
    pointer-events: none;
  }

  .landmark-scar {
    position: absolute;
    overflow: hidden;
  }

  .landmark-scar.scar-left {
    left: 0;
    top: 0;
    bottom: 0;
    width: 10px;
  }

  .landmark-scar.scar-right {
    right: 0;
    top: 0;
    bottom: 0;
    width: 10px;
  }

  .landmark-scar.scar-top {
    left: 0;
    right: 0;
    top: 0;
    height: 10px;
  }

  .landmark-pin {
    position: absolute;
    left: 50%;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
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
