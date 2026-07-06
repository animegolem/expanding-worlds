<script lang="ts">
  import { onMount } from 'svelte'
  import ChromeLayer from './chrome/ChromeLayer.svelte'
  import { toast } from './chrome/status'
  import { attachBoardTooling, type BoardTooling } from './canvas/board-tooling'
  import { attachCharmsUi, type CharmsUiHandle } from './canvas/charms-ui'
  import { createDecorationsUi, type DecorationsUi } from './canvas/decorations-ui'
  import { mountCanvasHost, type CanvasHostHandle } from './canvas/host'
  import { attachImportSurfaces, type ImportSurfacesHandle } from './canvas/import-surfaces'
  import { attachNodeMenu, type NodeMenuHandle } from './canvas/node-menu'
  import { attachTextEntry, type TextEntryController } from './canvas/text-entry'
  import { attachOpenNoteSurface, onAttachNote, type OpenNoteSurfaceHandle } from './note/open-note'
  import AttachNotePicker from './note/AttachNotePicker.svelte'

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

  onMount(() => {
    let mounted: CanvasHostHandle | null = null
    let surfaces: ImportSurfacesHandle | null = null
    let menu: NodeMenuHandle | null = null
    let textEntry: TextEntryController | null = null
    let openNote: OpenNoteSurfaceHandle | null = null
    let charms: CharmsUiHandle | null = null
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
        charms = attachCharmsUi(h, element)
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
      tooling?.destroy()
      ui?.destroy()
      mounted?.destroy()
    }
  })
</script>

<div class="canvas-host" data-testid="canvas-host" bind:this={element}>
  {#if handle && ui && tooling}
    <ChromeLayer {handle} {ui} {tooling} hostElement={element} />
  {/if}
  {#if error}
    <p class="canvas-error" role="alert">Canvas failed to start: {error}</p>
  {/if}
  {#if attachTarget && handle}
    <AttachNotePicker {handle} nodeId={attachTarget} onclose={() => (attachTarget = null)} />
  {/if}
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #17191d;
  }

  .canvas-host :global(canvas) {
    display: block;
    position: absolute;
    inset: 0;
  }

  .canvas-error {
    position: absolute;
    inset: auto 1rem 1rem 1rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: #3b1f1f;
    color: #f3c9c9;
    border-radius: 4px;
    font-size: 0.85rem;
  }
</style>
