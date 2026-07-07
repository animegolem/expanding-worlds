/**
 * Bookmark read model and jump path (RFC §8.1, AI-IMP-061), shared by
 * the pin menu and the global Mod+1–9 bindings. Row order IS the
 * binding: shortcuts resolve by CURRENT row order at press time (one
 * fresh query, no cached order to go stale), and every jump routes
 * through navigateTo — bookmark jumps are navigation events and enter
 * the §8.1 history by construction.
 */
import { uuidv7 } from '@ew/domain'
import type { CanvasHostHandle } from '../canvas/host'
import { navigateTo, pathEntries } from './navigation'

/** Mirror of @ew/persistence's BookmarkListRow (the renderer imports
 * only @ew/commands; queries cross the seam untyped). */
export interface BookmarkRow {
  id: string
  targetKind: 'canvas'
  canvasId: string
  label: string
  viewport: { x: number; y: number; zoom: number } | null
  sortKey: number
  targetState: 'active' | 'trashed' | 'purged'
  /** Which record Restore revives (§9.6/§9.7): 'canvas' for a
   * directly-trashed board, 'node' when the owning node is the trashed
   * record. null for active/purged rows. */
  trashedKind: 'canvas' | 'node' | null
  /** RestoreRecord target when `trashedKind === 'node'`. */
  ownerNodeId: string
}

/** Every bookmark in menu order with joined target degradation state. */
export async function listBookmarks(): Promise<BookmarkRow[]> {
  const response = await window.ew.project.query('listBookmarks')
  if (!response.ok) return []
  return response.result as BookmarkRow[]
}

/** The one bookmark flight: through navigateTo (history entry), then
 * the bookmark's saved viewport wins over the canvas's persisted
 * camera when one was captured. */
export async function jumpToBookmark(handle: CanvasHostHandle, row: BookmarkRow): Promise<void> {
  await navigateTo(row.canvasId, row.label)
  if (row.viewport) handle.controller.camera.set(row.viewport)
}

/**
 * Bookmark the current board with its current view — the exact path
 * behind the menu's bottom row (CreateBookmark, uuidv7 id, the entry
 * route's leaf label, the live camera). The §8.1 Mod+D binding and the
 * menu's ＋ row both call this, so the shortcut and the click are
 * byte-for-byte the same command.
 */
export async function bookmarkCurrentBoard(handle: CanvasHostHandle): Promise<void> {
  const label = pathEntries().at(-1)?.label ?? 'Board'
  await handle.gateway.execute('CreateBookmark', {
    bookmarkId: uuidv7(),
    canvasId: handle.canvasId,
    label,
    viewport: handle.controller.camera.state(),
  })
}

/** Mod+n: resolve BY CURRENT ROW ORDER at press time. Degraded
 * targets never jump from the shortcut — the menu owns Restore and
 * removal (§8.1 explicit degradation). */
export async function jumpToBookmarkIndex(handle: CanvasHostHandle, index: number): Promise<void> {
  const rows = await listBookmarks()
  const row = rows[index]
  if (!row || row.targetState !== 'active') return
  await jumpToBookmark(handle, row)
}
