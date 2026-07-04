<script lang="ts">
  import { onMount } from 'svelte'
  import { mountCanvasHost, type CanvasHostHandle } from './canvas/host'
  import { attachImportSurfaces, type ImportSurfacesHandle } from './canvas/import-surfaces'
  import { attachNodeMenu, type NodeMenuHandle } from './canvas/node-menu'

  let {
    onready = undefined,
  }: { onready?: (handle: CanvasHostHandle, element: HTMLElement) => void } = $props()

  let element: HTMLDivElement
  let error = $state<string | null>(null)
  let importError = $state<string | null>(null)

  onMount(() => {
    let handle: CanvasHostHandle | null = null
    let surfaces: ImportSurfacesHandle | null = null
    let menu: NodeMenuHandle | null = null
    let disposed = false
    mountCanvasHost(element)
      .then((h) => {
        if (disposed) {
          h.destroy()
          return
        }
        handle = h
        const notify = (message: string): void => {
          importError = message
        }
        surfaces = attachImportSurfaces(h, element, notify)
        menu = attachNodeMenu(h, element, notify)
        onready?.(h, element)
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : String(err)
      })
    return () => {
      disposed = true
      surfaces?.destroy()
      menu?.destroy()
      handle?.destroy()
    }
  })
</script>

<div class="canvas-host" data-testid="canvas-host" bind:this={element}>
  {#if error}
    <p class="canvas-error" role="alert">Canvas failed to start: {error}</p>
  {/if}
  {#if importError}
    <div class="import-error" role="alert" data-testid="import-error">
      <span>{importError}</span>
      <button type="button" data-testid="import-error-dismiss" onclick={() => (importError = null)}>
        Dismiss
      </button>
    </div>
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

  .import-error {
    position: absolute;
    inset: 0.75rem 1rem auto 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: #3b1f1f;
    color: #f3c9c9;
    border: 1px solid #7c3a3a;
    border-radius: 4px;
    font-size: 0.85rem;
    z-index: 20;
  }

  .import-error button {
    flex: none;
    padding: 0.15rem 0.6rem;
    font: inherit;
    cursor: pointer;
  }
</style>
