<!--
  Main workspace (RFC-0001 §8.2 rev 0.17): the window is the board —
  the canvas fills the region; chrome floats. The Create Pin dialog
  retired with the ◉ pin tool (§6.2, AI-IMP-067); the interim
  placement-source panel retired when the outline takeover became the
  §6.10 placement source (AI-IMP-070).
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import { onMount } from 'svelte'
  import CanvasHost from './CanvasHost.svelte'
  import type { CanvasHostHandle } from './canvas/host'
  import { unionBounds } from '@ew/canvas-engine'
  import { themeTokenValue } from './theme'
  import {
    onCenterPlacements,
    onCreateAndPlace,
    onPlaceNode,
    onPlaceNote,
    requestOpenNote,
  } from './note/open-note'

  let hostHandle = $state<CanvasHostHandle | null>(null)
  let hostElement = $state<HTMLElement | null>(null)

  function viewCenterWorld(): { x: number; y: number } {
    if (!hostHandle || !hostElement) return { x: 0, y: 0 }
    const bounds = hostElement.getBoundingClientRect()
    return hostHandle.controller.camera.screenToWorld({
      x: bounds.width / 2,
      y: bounds.height / 2,
    })
  }

  function boardNotice(message: string): void {
    hostElement?.dispatchEvent(
      new CustomEvent('ew-board-notice', { detail: { message }, bubbles: true }),
    )
  }

  // §6.10/§7.4 placement flows from the Uses sidebar (AI-IMP-049).
  onMount(() =>
    onPlaceNode((nodeId) => {
      const h = hostHandle
      if (!h) return
      const center = viewCenterWorld()
      void h.gateway
        .execute('CreatePlacement', {
          placementId: uuidv7(),
          canvasId: h.canvasId,
          nodeId,
          x: center.x,
          y: center.y,
        })
        .then((result) => {
          if (result.status !== 'committed')
            boardNotice('Place on Current Canvas failed — retry')
        })
    }),
  )

  // §6.10 zero-node note: node + default dot + attach + placement as
  // one CreatePin; the label defaults visible, so the dot shows the
  // note's title immediately.
  onMount(() =>
    onPlaceNote((noteId) => {
      const h = hostHandle
      if (!h) return
      const center = viewCenterWorld()
      void h.gateway
        .execute('CreatePin', {
          nodeId: uuidv7(),
          canvasId: h.canvasId,
          placementId: uuidv7(),
          x: center.x,
          y: center.y,
          appearance: { kind: 'dot', color: themeTokenValue('--ew-node-dot-default') },
          note: { kind: 'attach', noteId },
        })
        .then((result) => {
          if (result.status !== 'committed')
            boardNotice('Place on Current Canvas failed — retry')
        })
    }),
  )

  onMount(() =>
    onCenterPlacements((placementIds) => {
      const h = hostHandle
      if (!h) return
      const wanted = new Set(placementIds)
      const center = (): boolean => {
        const items = h.controller.items().filter((item) => wanted.has(item.id))
        if (items.length === 0) return false
        h.controller.selection.marquee(placementIds)
        const bounds = unionBounds(items)
        if (bounds) h.flyTo(bounds)
        return true
      }
      if (center()) return
      // Cross-canvas rows (AI-IMP-065) fire right after navigateTo,
      // but the destination scene applies asynchronously — wait for
      // it, bounded.
      const off = h.onSceneApplied(() => {
        if (center()) {
          off()
          clearTimeout(timer)
        }
      })
      const timer = setTimeout(() => off(), 2000)
    }),
  )

  // §7.2 Create and Place on Current Canvas: phantom materialization
  // that needs the active canvas and view center — one CreatePin
  // (note + node + default dot + placement), then the pane opens the
  // created note. Same semantics as §6.10.
  onMount(() =>
    onCreateAndPlace(({ title, body }) => {
      const h = hostHandle
      if (!h) return
      void (async () => {
        const noteId = uuidv7()
        const center = viewCenterWorld()
        const result = await h.gateway.execute('CreatePin', {
          nodeId: uuidv7(),
          canvasId: h.canvasId,
          placementId: uuidv7(),
          x: center.x,
          y: center.y,
          appearance: { kind: 'dot', color: themeTokenValue('--ew-node-dot-default') },
          note: { kind: 'create', noteId, title, ...(body !== undefined ? { body } : {}) },
        })
        if (result.status === 'committed') {
          requestOpenNote(noteId)
        } else {
          const message =
            result.status === 'error' ? result.message : 'the project changed underneath (retry)'
          hostElement?.dispatchEvent(
            new CustomEvent('ew-board-notice', {
              detail: { message: `Create and Place failed: ${message}` },
              bubbles: true,
            }),
          )
        }
      })()
    }),
  )
</script>

<main class="workspace" data-testid="workspace">
  <div class="canvas-slot">
    <CanvasHost
      onready={(handle, element) => {
        hostHandle = handle
        hostElement = element
      }}
    />
  </div>
</main>

<style>
  .workspace {
    grid-area: workspace;
    display: flex;
    min-width: 0;
    overflow: hidden;
    position: relative;
  }

  .canvas-slot {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
</style>
