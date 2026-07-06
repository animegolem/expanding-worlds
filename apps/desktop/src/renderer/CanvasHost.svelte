<script lang="ts">
  import { onMount } from 'svelte'
  import ChromeLayer from './chrome/ChromeLayer.svelte'
  import TakeoverLayer from './chrome/TakeoverLayer.svelte'
  import { toast } from './chrome/status'
  import { attachBoardTooling, type BoardTooling } from './canvas/board-tooling'
  import { attachCharmsUi, type CharmsUiHandle } from './canvas/charms-ui'
  import { createDecorationsUi, type DecorationsUi } from './canvas/decorations-ui'
  import { mountCanvasHost, type CanvasHostHandle } from './canvas/host'
  import { attachImportSurfaces, type ImportSurfacesHandle } from './canvas/import-surfaces'
  import { attachNodeMenu, type NodeMenuHandle } from './canvas/node-menu'
  import { attachPinTool, type PinToolHandle } from './canvas/pin-tool'
  import { attachTextEntry, type TextEntryController } from './canvas/text-entry'
  import { attachOpenNoteSurface, onAttachNote, type OpenNoteSurfaceHandle } from './note/open-note'
  import { attachPanels, setOverlayHost } from './note/panels'
  import AttachNotePicker from './note/AttachNotePicker.svelte'
  import NotePanels from './note/NotePanels.svelte'
  import TagPanel from './tags/TagPanel.svelte'
  import { onTagPanelChanged, type TagPanelState } from './tags/tag-panel'
  import SearchPanel from './chrome/SearchPanel.svelte'
  import { onSearchPanelChanged, type SearchPanelState } from './chrome/search'

  let {
    onready = undefined,
  }: { onready?: (handle: CanvasHostHandle, element: HTMLElement) => void } = $props()

  let element: HTMLDivElement
  let error = $state<string | null>(null)
  let handle = $state<CanvasHostHandle | null>(null)
  let ui = $state<DecorationsUi | null>(null)
  let tooling = $state<BoardTooling | null>(null)
  // §6.6 attach-note picker target (AI-IMP-049).
  let attachTarget = $state<string | null>(null)
  // §4.8 tag panel (AI-IMP-071): the one instance, store-driven.
  let tagPanel = $state<TagPanelState | null>(null)
  $effect(() => onTagPanelChanged((next) => (tagPanel = next)))
  // §8.3 search panel (AI-IMP-073): same physics, same mounting.
  let searchPanel = $state<SearchPanelState | null>(null)
  $effect(() => onSearchPanelChanged((next) => (searchPanel = next)))
  // §8.8 law 2 root overlay host: modals portal into this element so
  // their backdrops escape every local stacking context.
  let overlayHost = $state<HTMLDivElement | null>(null)
  $effect(() => {
    setOverlayHost(overlayHost)
    return () => setOverlayHost(null)
  })

  onMount(() => {
    let mounted: CanvasHostHandle | null = null
    let surfaces: ImportSurfacesHandle | null = null
    let menu: NodeMenuHandle | null = null
    let textEntry: TextEntryController | null = null
    let openNote: OpenNoteSurfaceHandle | null = null
    let charms: CharmsUiHandle | null = null
    let pinTool: PinToolHandle | null = null
    let detachPanels: (() => void) | null = null
    let disposed = false
    // §9.2 board notices ride the ew-board-notice event to the §8.6
    // toast stack (chrome/status.ts) — no rendering here anymore.
    const offAttach = onAttachNote((nodeId) => (attachTarget = nodeId))
    mountCanvasHost(element)
      .then((h) => {
        if (disposed) {
          h.destroy()
          return
        }
        mounted = h
        // Import/command failures keep their pre-toast contract: one
        // sticky import-error surface, replaced by the next failure.
        const notify = (message: string): void => {
          toast(message, {
            kind: 'error',
            sticky: true,
            surface: 'import-error',
            dismissTestid: 'import-error-dismiss',
          })
        }
        surfaces = attachImportSurfaces(h, element, notify)
        menu = attachNodeMenu(h, element, notify)
        ui = createDecorationsUi(h)
        tooling = attachBoardTooling(h, element, notify)
        textEntry = attachTextEntry(h, element)
        openNote = attachOpenNoteSurface(h, element)
        detachPanels = attachPanels(h)
        charms = attachCharmsUi(h, element)
        pinTool = attachPinTool(h, element)
        handle = h
        onready?.(h, element)
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : String(err)
      })
    return () => {
      disposed = true
      offAttach()
      surfaces?.destroy()
      menu?.destroy()
      textEntry?.destroy()
      openNote?.destroy()
      charms?.destroy()
      pinTool?.destroy()
      detachPanels?.()
      tooling?.destroy()
      ui?.destroy()
      mounted?.destroy()
    }
  })
</script>

<div class="canvas-host" data-testid="canvas-host" bind:this={element}>
  {#if handle && ui && tooling}
    <ChromeLayer {handle} {ui} {tooling} hostElement={element} />
    <NotePanels {handle} hostElement={element} />
    <TakeoverLayer />
  {/if}
  {#if error}
    <p class="canvas-error" role="alert">Canvas failed to start: {error}</p>
  {/if}
  {#if attachTarget && handle}
    <AttachNotePicker {handle} nodeId={attachTarget} onclose={() => (attachTarget = null)} />
  {/if}
  {#if tagPanel && handle}
    <TagPanel {handle} hostElement={element} panel={tagPanel} />
  {/if}
  {#if searchPanel && handle}
    <SearchPanel {handle} hostElement={element} panel={searchPanel} />
  {/if}
  <!--
    §8.8 law 2 (rev 0.41): the root overlay host. Rendered LAST inside
    the outer stacking context (.canvas-host) and given a clearly-top
    z, so modals that portal into it — the big editor and the
    title-conflict dialog — sit above ChromeLayer, SourcePanel, the
    dock, toasts, and every other local surface. EPIC-016's named
    z-ladder replaces this ad-hoc number with the "modal" rung; the
    tooltip chip (body/1000) stays above modals deliberately — it dies
    on pointer-leave. pointer-events:none keeps the empty host from
    eating canvas input; the modal children opt back into hit-testing.
  -->
  <div class="overlay-host" data-testid="overlay-host" bind:this={overlayHost}></div>
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--ew-surface-solid);
  }

  .canvas-host :global(canvas) {
    display: block;
    position: absolute;
    inset: 0;
  }

  .overlay-host {
    position: absolute;
    inset: 0;
    /* Clearly above every local surface (chrome sits at 10, source
       panel at 11). A single ad-hoc top value until EPIC-016's named
       z-ladder introduces the "modal" rung; stays below the tooltip
       chip at body/1000 by design. */
    z-index: 500;
    pointer-events: none;
  }

  .canvas-error {
    position: absolute;
    inset: auto 1rem 1rem 1rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: var(--ew-danger-surface-solid);
    color: var(--ew-danger-text);
    border-radius: 4px;
    font-size: 0.85rem;
  }
</style>
