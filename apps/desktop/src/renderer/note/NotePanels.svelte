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
  import LocationChooser from './LocationChooser.svelte'
  import NotePanel from './NotePanel.svelte'
  import {
    onChooserChanged,
    onPanelsChanged,
    type ChooserState,
    type PanelRecord,
  } from './panels'

  const { handle, hostElement }: { handle: CanvasHostHandle; hostElement: HTMLElement } = $props()

  let records = $state<readonly PanelRecord[]>([])
  $effect(() => onPanelsChanged((next) => (records = next)))

  let chooser = $state<ChooserState | null>(null)
  $effect(() => onChooserChanged((next) => (chooser = next)))

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
    <NotePanel {handle} {record} />
  {/each}
  {#if chooser}
    <LocationChooser state={chooser} {hostElement} />
  {/if}
</div>

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
