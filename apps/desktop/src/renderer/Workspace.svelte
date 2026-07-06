<!--
  Main workspace (RFC-0001 §8.2 rev 0.17): the window is the board —
  the canvas fills the region with no tab bar (AI-IMP-059 retired it;
  there are no workspace tabs in the shell model). The interim Create
  Pin dialog and placement-source panel open from title-strip buttons
  via window events until AI-IMP-067/065 retire them.
-->
<script lang="ts">
  import { uuidv7 } from '@ew/domain'
  import { onMount } from 'svelte'
  import CanvasHost from './CanvasHost.svelte'
  import CreatePinDialog from './CreatePinDialog.svelte'
  import PlacementSourcePanel from './PlacementSourcePanel.svelte'
  import type { CanvasHostHandle } from './canvas/host'
  import { itemWorldAABB, unionBounds } from '@ew/canvas-engine'
  import {
    onCenterPlacements,
    onCreateAndPlace,
    onPlaceNode,
    onPlaceNote,
    onRevealNote,
    requestOpenNote,
  } from './note/open-note'

  let hostHandle = $state<CanvasHostHandle | null>(null)
  let hostElement = $state<HTMLElement | null>(null)
  let dialogOpen = $state(false)
  let panelOpen = $state(false)

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

  // §7.3 spatial resolution on bound-link activation. Zero: canvas
  // unchanged + notice. One, on the active canvas: eased flight to
  // the placement, selected. Anything else (many, or on another
  // canvas — navigation is EPIC-006): viewport kept, non-blocking
  // location-count notice; the grouped chooser is EPIC-006 scope.
  onMount(() =>
    onRevealNote(({ noteId, title }) => {
      const h = hostHandle
      if (!h) return
      void (async () => {
        const response = await window.ew.project.query('getNoteUses', { noteId })
        if (!response.ok) return
        const uses = response.result as {
          totalPlacements: number
          canvases: Array<{ canvasId: string; nodes: Array<{ placements: Array<{ placementId: string }> }> }>
        }
        if (uses.totalPlacements === 0) {
          boardNotice(`“${title}” has no placed locations`)
          return
        }
        const active = uses.canvases.find((canvas) => canvas.canvasId === h.canvasId)
        const activePlacements = active?.nodes.flatMap((node) => node.placements) ?? []
        if (uses.totalPlacements === 1 && activePlacements.length === 1) {
          const placementId = activePlacements[0]!.placementId
          const item = h.controller.items().find((candidate) => candidate.id === placementId)
          if (!item) return
          h.controller.selection.click(placementId)
          h.flyTo(itemWorldAABB(item))
          return
        }
        boardNotice(
          `“${title}” has ${uses.totalPlacements} locations — the location chooser arrives with navigation`,
        )
      })()
    }),
  )

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
          appearance: { kind: 'dot', color: '#8ab4d8' },
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
      const items = h.controller.items().filter((item) => wanted.has(item.id))
      if (items.length === 0) return
      h.controller.selection.marquee(placementIds)
      const bounds = unionBounds(items)
      if (bounds) h.flyTo(bounds)
    }),
  )

  // Interim entry points, fired by the title strip (AI-IMP-059).
  onMount(() => {
    const openPin = (): void => {
      if (hostHandle) dialogOpen = true
    }
    const toggleSources = (): void => {
      if (hostHandle) panelOpen = !panelOpen
    }
    window.addEventListener('ew-open-create-pin', openPin)
    window.addEventListener('ew-toggle-sources', toggleSources)
    return () => {
      window.removeEventListener('ew-open-create-pin', openPin)
      window.removeEventListener('ew-toggle-sources', toggleSources)
    }
  })

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
          appearance: { kind: 'dot', color: '#8ab4d8' },
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
  {#if panelOpen && hostHandle}
    <PlacementSourcePanel handle={hostHandle} viewCenter={viewCenterWorld} />
  {/if}
  <div class="canvas-slot">
    <CanvasHost
      onready={(handle, element) => {
        hostHandle = handle
        hostElement = element
      }}
    />
  </div>
  {#if dialogOpen && hostHandle}
    <CreatePinDialog
      handle={hostHandle}
      viewCenter={viewCenterWorld}
      onclose={() => (dialogOpen = false)}
    />
  {/if}
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
