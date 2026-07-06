/**
 * Bookmark command payloads (RFC-0001 §8.1, AI-IMP-061): bookmarks
 * are durable project-scoped records addressing STABLE target ids.
 * They are never deleted automatically — a trashed target degrades to
 * an In Trash state, a purged target to a broken state — so no
 * bookmark command validates that its target currently exists: undo
 * of removing a broken bookmark must round-trip like any other
 * durable command.
 */

export interface BookmarkViewport {
  x: number
  y: number
  zoom: number
}

/**
 * §8.1: the menu's bottom row captures the current board plus its
 * viewport. `sortKey` is a restore field so RemoveBookmark's inverse
 * returns the row to its exact menu slot; ordinary creation omits it
 * and appends at the end.
 */
export interface CreateBookmarkPayload {
  bookmarkId: string
  /** Only 'canvas' ships; the schema seam for projections is EPIC-013. */
  canvasId: string
  label: string
  viewport: BookmarkViewport | null
  sortKey?: number
}

export interface RemoveBookmarkPayload {
  bookmarkId: string
}

/**
 * §8.1: one drag-reorder commits one command. `afterId`/`beforeId`
 * name the bookmarks that must end up directly above/below the moved
 * row (`afterId: null` moves to the top, `beforeId: null` to the
 * bottom) — mirroring ReorderContent. Row order IS the Mod+1–n
 * binding, so this command is the binding change.
 */
export interface ReorderBookmarkPayload {
  bookmarkId: string
  afterId: string | null
  beforeId: string | null
}

export const COMMAND_CREATE_BOOKMARK = 'CreateBookmark'
export const COMMAND_REMOVE_BOOKMARK = 'RemoveBookmark'
export const COMMAND_REORDER_BOOKMARK = 'ReorderBookmark'
