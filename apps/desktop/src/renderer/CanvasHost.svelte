<script lang="ts">
  import { onMount } from 'svelte'
  import { mountCanvasHost, type CanvasHostHandle } from './canvas/host'

  let element: HTMLDivElement
  let error = $state<string | null>(null)

  onMount(() => {
    let handle: CanvasHostHandle | null = null
    let disposed = false
    mountCanvasHost(element)
      .then((h) => {
        if (disposed) h.destroy()
        else handle = h
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : String(err)
      })
    return () => {
      disposed = true
      handle?.destroy()
    }
  })
</script>

<div class="canvas-host" data-testid="canvas-host" bind:this={element}>
  {#if error}
    <p class="canvas-error" role="alert">Canvas failed to start: {error}</p>
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
