<!--
  The bookmark menu (RFC §8.1, AI-IMP-061): ONE menu anchored to the
  path-tail pin that does everything — row click jumps, drag-handle
  reorders (one completed drag = one ReorderBookmark), ✕ removes, and
  the bottom row bookmarks the current board with its viewport. Row
  order IS the Mod+1–n binding and each row prints its current
  shortcut, so the bindings are self-teaching and reorder updates
  them live. Degradation is explicit: a trashed target greys with an
  In Trash label and a Restore action (restore, then jump); a purged
  target is broken and offers removal; nothing ever silently
  vanishes.
-->
<script lang="ts">
  import type { CanvasHostHandle } from '../canvas/host'
  import { KEY } from '../keys/bindings'
  import { formatBinding } from '../keys/registry'
  import { EW_PIN_MENU_FADE_MS } from './beats'
  import { bookmarkCurrentBoard, jumpToBookmark, listBookmarks, type BookmarkRow } from './bookmarks'
  import GlobeGlyph from './GlobeGlyph.svelte'
  import { applyMenuCascade } from './menu-cascade'
  import { tooltip } from './tooltip'
  import { runAsUndoGroup } from '../undo/undo-store'
  import { toast } from './status'

  // `closing` drives the unpin fade (RFC §8.2 rev 0.64, AI-IMP-166): the
  // ceremony is for arrival, so close is a plain opacity fade over
  // EW_PIN_MENU_FADE_MS — PathBar unmounts us when it lands.
  const {
    handle,
    onClose,
    closing = false,
  }: { handle: CanvasHostHandle; onClose: () => void; closing?: boolean } = $props()

  let rows = $state<BookmarkRow[]>([])
  let listEl: HTMLUListElement | null = $state(null)

  // During a drag, this optimistic order previews the drop; the
  // durable order changes only when the drop commits ReorderBookmark.
  let dragId = $state<string | null>(null)
  let dragOrder = $state<string[]>([])

  async function refresh(): Promise<void> {
    rows = await listBookmarks()
  }

  $effect(() => {
    void refresh()
    // Stay live: undo, another window, or purge elsewhere re-lists.
    const offChanged = window.ew.project.onChanged(() => void refresh())
    // AI-IMP-183 (M-24): consume Escape (capture + stopPropagation, the
    // search-palette pattern) so it closes the menu without reaching the
    // canvas host and clearing the selection underneath.
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => {
      offChanged()
      window.removeEventListener('keydown', onKeydown, true)
    }
  })

  const displayRows = $derived(
    dragId === null
      ? rows
      : dragOrder
          .map((id) => rows.find((row) => row.id === id))
          .filter((row): row is BookmarkRow => row !== undefined),
  )

  async function jump(row: BookmarkRow): Promise<void> {
    if (row.targetState !== 'active') return
    await jumpToBookmark(handle, row)
    onClose()
  }

  async function restoreAndJump(row: BookmarkRow): Promise<void> {
    // §8.1: Restore, then jump — stable ids revalidate the bookmark
    // with no bookmark write at all. §9.6: when the OWNER node is the
    // trashed record, restore the node (the aggregate root brings the
    // board back); a directly-trashed board restores its canvas row.
    const restore =
      row.trashedKind === 'node'
        ? ({ kind: 'node', id: row.ownerNodeId } as const)
        : ({ kind: 'canvas', id: row.canvasId } as const)
    const result = await handle.gateway.execute('RestoreRecord', restore)
    if (result.status !== 'committed') {
      toast("couldn't bring that board back — it stays bookmarked and in trash.", {
        kind: 'error',
      })
      return
    }
    await jumpToBookmark(handle, row)
    onClose()
  }

  async function remove(row: BookmarkRow): Promise<void> {
    // AI-IMP-182: one Mod+Z per removal (RemoveBookmark is GROUP_ONLY,
    // captured at this gesture; inverse CreateBookmark restores it).
    await runAsUndoGroup(async (groupToken) => {
      await handle.gateway.execute('RemoveBookmark', { bookmarkId: row.id }, { groupToken })
    })
    await refresh()
  }

  async function addCurrent(): Promise<void> {
    // §8.1: the ＋ row and the Mod+D shortcut share one command path.
    await bookmarkCurrentBoard(handle)
    await refresh()
  }

  /** Pointer-based drag reorder on the row handles. Capture lives on
   * the handle, so move/up events keep arriving during the drag. */
  function startDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0 || !listEl) return
    event.preventDefault()
    const handleEl = event.currentTarget as HTMLElement
    handleEl.setPointerCapture(event.pointerId)
    dragId = id
    dragOrder = rows.map((row) => row.id)
    const fromIndex = dragOrder.indexOf(id)

    const indexAt = (clientY: number): number => {
      const items = Array.from(listEl!.querySelectorAll<HTMLElement>('[data-bookmark-row]'))
      if (items.length === 0) return 0
      const top = items[0]!.getBoundingClientRect().top
      const height = items[0]!.getBoundingClientRect().height || 1
      const index = Math.floor((clientY - top) / height)
      return Math.max(0, Math.min(index, dragOrder.length - 1))
    }

    const onMove = (e: PointerEvent): void => {
      const next = indexAt(e.clientY)
      const current = dragOrder.indexOf(id)
      if (next === current) return
      const reordered = dragOrder.filter((entry) => entry !== id)
      reordered.splice(next, 0, id)
      dragOrder = reordered
    }

    const onUp = (): void => {
      handleEl.removeEventListener('pointermove', onMove)
      handleEl.removeEventListener('pointerup', onUp)
      handleEl.removeEventListener('pointercancel', onCancel)
      const finalIndex = dragOrder.indexOf(id)
      const order = dragOrder
      dragId = null
      if (finalIndex === fromIndex) return
      // One completed drag commits ONE durable command — and one Mod+Z
      // entry (AI-IMP-182: ReorderBookmark is GROUP_ONLY, captured at the
      // completed-drag gesture; its inverse restores the prior order).
      void runAsUndoGroup(async (groupToken) => {
        await handle.gateway.execute('ReorderBookmark', {
          bookmarkId: id,
          afterId: finalIndex > 0 ? order[finalIndex - 1] : null,
          beforeId: finalIndex < order.length - 1 ? order[finalIndex + 1] : null,
        }, { groupToken })
      }).then(() => refresh())
    }

    const onCancel = (): void => {
      handleEl.removeEventListener('pointermove', onMove)
      handleEl.removeEventListener('pointerup', onUp)
      handleEl.removeEventListener('pointercancel', onCancel)
      dragId = null
    }

    handleEl.addEventListener('pointermove', onMove)
    handleEl.addEventListener('pointerup', onUp)
    handleEl.addEventListener('pointercancel', onCancel)
  }
</script>

<!-- §8.2 rev 0.64: the unpin fade (`closing`) is opacity only; the OPEN
     ceremony is the universal CASCADE — rows fade in staggered top to
     bottom, stamped on the row list by the shared applicator (AI-IMP-167),
     never duplicated here. -->
<div
  class="bookmark-menu"
  class:closing
  style={`--menu-fade:${EW_PIN_MENU_FADE_MS}ms`}
  data-testid="bookmark-menu"
  data-closing={closing ? 'true' : 'false'}
>
  {#if displayRows.length === 0}
    <div class="empty" data-testid="bookmark-empty">No bookmarks yet</div>
  {:else}
    <ul bind:this={listEl} use:applyMenuCascade>
      {#each displayRows as row, index (row.id)}
        <li
          data-bookmark-row
          data-testid={`bookmark-row-${index}`}
          data-bookmark-id={row.id}
          data-target-state={row.targetState}
          class:degraded={row.targetState !== 'active'}
          class:dragging={dragId === row.id}
        >
          <!-- §8.2 decision 07: every bookmark is a world — the row wears a
               globe in place of a dot, the pin pinning down into it. -->
          <span class="globe" data-testid={`bookmark-globe-${index}`} aria-hidden="true">
            <GlobeGlyph />
          </span>
          <span
            class="drag"
            role="button"
            tabindex="-1"
            aria-label="Drag to reorder"
            data-testid={`bookmark-drag-${index}`}
            onpointerdown={(e) => startDrag(e, row.id)}
            use:tooltip={{ name: 'Drag to reorder — order is the shortcut' }}
          >
            ⠿
          </span>
          <button
            type="button"
            class="jump"
            data-testid={`bookmark-jump-${index}`}
            disabled={row.targetState !== 'active'}
            onclick={() => void jump(row)}
            use:tooltip={{
              name:
                row.targetState === 'active'
                  ? `Jump to ${row.label}`
                  : row.targetState === 'trashed'
                    ? `${row.label} is in Trash`
                    : `${row.label} no longer exists`,
              ...(index < 9 ? { shortcut: `⌘${index + 1}` } : {}),
            }}
          >
            {row.label}
          </button>
          {#if row.targetState === 'trashed'}
            <span class="state" data-testid={`bookmark-state-${index}`}>In Trash</span>
            <button
              type="button"
              class="restore"
              data-testid={`bookmark-restore-${index}`}
              onclick={() => void restoreAndJump(row)}
              use:tooltip={{ name: 'Restore the board and jump to it' }}
            >
              Restore
            </button>
          {:else if row.targetState === 'purged'}
            <span class="state broken" data-testid={`bookmark-state-${index}`}>Broken</span>
          {/if}
          {#if index < 9}
            <span class="shortcut" data-testid={`bookmark-shortcut-${index}`}>⌘{index + 1}</span>
          {/if}
          <button
            type="button"
            class="remove"
            class:offered={row.targetState === 'purged'}
            data-testid={`bookmark-remove-${index}`}
            onclick={() => void remove(row)}
            use:tooltip={{ name: 'Remove bookmark' }}
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button
    type="button"
    class="add"
    data-testid="bookmark-add"
    onclick={() => void addCurrent()}
    use:tooltip={{
      name: 'Bookmark this board with its current view',
      shortcut: formatBinding(KEY.bookmarkCurrent),
    }}
  >
    ＋ bookmark this board
  </button>
</div>

<style>
  .bookmark-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 15rem;
    max-width: 22rem;
    padding: 0.3rem;
    background: var(--ew-surface-menu);
    border: 1px solid var(--ew-border);
    border-radius: 7px;
    font-size: 0.75rem;
    color: var(--ew-text);
    pointer-events: auto;
    z-index: 20;
    /* Unpin on close: a plain opacity fade (§8.2 rev 0.64) — opacity only,
       ordinary chrome, never a reverse beat. --menu-fade is stamped from
       EW_PIN_MENU_FADE_MS (a plain custom prop, not an --ew- token, so the
       theme-token guard leaves it alone). */
    transition: opacity var(--menu-fade, 120ms) ease-out;
  }

  .bookmark-menu.closing {
    opacity: 0;
  }

  /* The row's leading world glyph — a place marker, not interactive. */
  .globe {
    display: inline-flex;
    flex: none;
    align-items: center;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.2rem;
    border-radius: 5px;
  }

  li.dragging {
    background: var(--ew-surface-hover);
  }

  li.degraded .jump {
    color: var(--ew-text-subtle);
  }

  .drag {
    cursor: grab;
    opacity: 0.55;
    touch-action: none;
    user-select: none;
    padding: 0.1rem 0.15rem;
  }

  .drag:hover {
    opacity: 1;
  }

  button {
    background: transparent;
    color: var(--ew-text);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
  }

  button:hover {
    background: var(--ew-surface-hover);
  }

  .jump {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jump:disabled {
    cursor: default;
  }

  .state {
    font-size: 0.65rem;
    color: var(--ew-warn-muted);
    border: 1px solid var(--ew-warn-muted-border);
    border-radius: 4px;
    padding: 0 0.25rem;
    white-space: nowrap;
  }

  .state.broken {
    color: var(--ew-danger-muted);
    border-color: var(--ew-danger-border);
  }

  .restore {
    color: var(--ew-accent-soft);
    white-space: nowrap;
  }

  .shortcut {
    font-family: ui-monospace, monospace;
    opacity: 0.6;
    white-space: nowrap;
  }

  .remove {
    opacity: 0.6;
  }

  .remove:hover,
  .remove.offered {
    opacity: 1;
    color: var(--ew-danger-muted);
  }

  .add {
    display: block;
    width: 100%;
    text-align: left;
    margin-top: 0.2rem;
    border-top: 1px solid var(--ew-border);
    border-radius: 0 0 5px 5px;
    padding-top: 0.3rem;
    color: var(--ew-accent-soft);
  }

  .empty {
    padding: 0.25rem 0.3rem;
    opacity: 0.6;
  }
</style>
