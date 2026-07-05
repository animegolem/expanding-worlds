<script lang="ts">
  import { onMount } from 'svelte'
  import BoardToolbar from './BoardToolbar.svelte'
  import DecorationToolbar from './DecorationToolbar.svelte'
  import { attachBoardTooling, type BoardTooling } from './canvas/board-tooling'
  import { createDecorationsUi, type DecorationsUi } from './canvas/decorations-ui'
  import { mountCanvasHost, type CanvasHostHandle } from './canvas/host'
  import { attachImportSurfaces, type ImportSurfacesHandle } from './canvas/import-surfaces'
  import { attachNodeMenu, type NodeMenuHandle } from './canvas/node-menu'
  import { attachTextEntry, type TextEntryController } from './canvas/text-entry'
  import { attachOpenNoteSurface, type OpenNoteSurfaceHandle } from './note/open-note'

  let {
    onready = undefined,
  }: { onready?: (handle: CanvasHostHandle, element: HTMLElement) => void } = $props()

  let element: HTMLDivElement
  let error = $state<string | null>(null)
  let importError = $state<string | null>(null)
  let handle = $state<CanvasHostHandle | null>(null)
  let ui = $state<DecorationsUi | null>(null)
  let tooling = $state<BoardTooling | null>(null)

  // §9.2 non-blocking notice: bare nodes auto-trashed with their last
  // placement surface here with a Keep in Project escape.
  let boardNotice = $state<{ message: string; keepNodeIds: string[] } | null>(null)
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  function showBoardNotice(detail: { message: string; keepNodeIds: string[] }): void {
    boardNotice = detail
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (boardNotice = null), 8000)
  }
  async function keepInProject(): Promise<void> {
    const h = handle
    const notice = boardNotice
    boardNotice = null
    if (!h || !notice) return
    for (const id of notice.keepNodeIds) {
      await h.gateway.execute('RestoreRecord', { kind: 'node', id })
    }
  }

  onMount(() => {
    let mounted: CanvasHostHandle | null = null
    let surfaces: ImportSurfacesHandle | null = null
    let menu: NodeMenuHandle | null = null
    let textEntry: TextEntryController | null = null
    let openNote: OpenNoteSurfaceHandle | null = null
    let disposed = false
    const onNotice = (event: Event): void => {
      const detail = (event as CustomEvent<{ message: string; keepNodeIds?: string[] }>).detail
      showBoardNotice({ message: detail.message, keepNodeIds: detail.keepNodeIds ?? [] })
    }
    element.addEventListener('ew-board-notice', onNotice)
    mountCanvasHost(element)
      .then((h) => {
        if (disposed) {
          h.destroy()
          return
        }
        mounted = h
        const notify = (message: string): void => {
          importError = message
        }
        surfaces = attachImportSurfaces(h, element, notify)
        menu = attachNodeMenu(h, element, notify)
        ui = createDecorationsUi(h)
        tooling = attachBoardTooling(h, element, notify)
        textEntry = attachTextEntry(h, element)
        openNote = attachOpenNoteSurface(h, element)
        handle = h
        onready?.(h, element)
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : String(err)
      })
    return () => {
      disposed = true
      element.removeEventListener('ew-board-notice', onNotice)
      if (noticeTimer) clearTimeout(noticeTimer)
      surfaces?.destroy()
      menu?.destroy()
      textEntry?.destroy()
      openNote?.destroy()
      tooling?.destroy()
      ui?.destroy()
      mounted?.destroy()
    }
  })
</script>

<div class="canvas-host" data-testid="canvas-host" bind:this={element}>
  {#if handle && ui}
    <DecorationToolbar {handle} {ui} />
  {/if}
  {#if handle && tooling}
    <BoardToolbar {handle} {tooling} />
  {/if}
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
  {#if boardNotice}
    <div class="board-notice" role="status" data-testid="board-notice">
      <span>{boardNotice.message}</span>
      {#if boardNotice.keepNodeIds.length > 0}
        <button type="button" data-testid="board-notice-keep" onclick={() => void keepInProject()}>
          Keep in Project
        </button>
      {/if}
      <button type="button" data-testid="board-notice-dismiss" onclick={() => (boardNotice = null)}>
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

  .board-notice {
    position: absolute;
    inset: auto 1rem 1rem auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: #23272e;
    color: #c8cfd8;
    border: 1px solid #3a4048;
    border-radius: 4px;
    font-size: 0.85rem;
    z-index: 20;
  }

  .board-notice button {
    flex: none;
    padding: 0.15rem 0.6rem;
    font: inherit;
    cursor: pointer;
  }
</style>
