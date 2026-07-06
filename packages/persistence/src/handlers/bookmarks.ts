import {
  COMMAND_CREATE_BOOKMARK,
  COMMAND_REMOVE_BOOKMARK,
  COMMAND_REORDER_BOOKMARK,
  DomainError,
  type BookmarkViewport,
  type CommandRegistry,
  type CreateBookmarkPayload,
  type RemoveBookmarkPayload,
  type ReorderBookmarkPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'

/**
 * Bookmark command handlers (RFC-0001 §8.1, AI-IMP-061). Bookmarks
 * address STABLE canvas ids and are never deleted automatically —
 * trashed targets grey out, purged targets present a broken state —
 * so CreateBookmark deliberately does NOT require its target to
 * exist: the inverse of removing a broken bookmark must round-trip
 * (ordinary durable command, invariant 24). Target liveness is a
 * query-time concern (listBookmarks).
 *
 * sort_key is a REAL order space with GAP-spaced appends and midpoint
 * insertion, exactly like render_order (§4.4); UUID order breaks
 * ties. Row order IS the Mod+1–n binding.
 */

export const BOOKMARK_ORDER_GAP = 1024

interface BookmarkRow {
  id: string
  canvas_id: string
  label: string
  viewport: string | null
  sort_key: number
}

function requireBookmark(ctx: CommandContext, bookmarkId: string): BookmarkRow {
  const row = ctx.db.get<BookmarkRow>(
    `SELECT id, canvas_id, label, viewport, sort_key
     FROM bookmark WHERE id = ? AND project_id = ?`,
    bookmarkId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('BOOKMARK_NOT_FOUND', `no bookmark ${bookmarkId}`)
  return row
}

/** Every bookmark in menu order (sort_key, then id as tiebreak). */
function orderedBookmarks(ctx: CommandContext): Array<{ id: string; sortKey: number }> {
  return ctx.db.all<{ id: string; sortKey: number }>(
    `SELECT id, sort_key AS sortKey FROM bookmark
     WHERE project_id = ? ORDER BY sort_key, id`,
    ctx.projectId,
  )
}

function validateViewport(viewport: BookmarkViewport | null): void {
  if (viewport === null) return
  const { x, y, zoom } = viewport
  if (![x, y, zoom].every(Number.isFinite) || zoom <= 0) {
    throw new DomainError('INVALID_VIEWPORT', 'viewport must be finite with zoom > 0')
  }
}

/** Reassigns evenly spaced keys in current order; visible order (and
 * therefore every Mod+n binding) is unchanged by construction. */
function rebalanceBookmarks(ctx: CommandContext): void {
  const now = ctx.now()
  orderedBookmarks(ctx).forEach((bookmark, i) => {
    const key = (i + 1) * BOOKMARK_ORDER_GAP
    if (key === bookmark.sortKey) return
    ctx.db.run(
      'UPDATE bookmark SET sort_key = ?, updated_at = ? WHERE id = ?',
      key,
      now,
      bookmark.id,
    )
  })
}

export function registerBookmarkHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreateBookmarkPayload>(COMMAND_CREATE_BOOKMARK, 1, (ctx, payload) => {
    if (typeof payload.label !== 'string' || payload.label.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'label must be a non-empty string')
    }
    validateViewport(payload.viewport)
    if (payload.sortKey !== undefined && !Number.isFinite(payload.sortKey)) {
      throw new DomainError('VALIDATION_FAILED', 'sortKey must be finite when present')
    }
    // Default: append at the bottom of the menu.
    const max = ctx.db.get<{ m: number | null }>(
      'SELECT max(sort_key) AS m FROM bookmark WHERE project_id = ?',
      ctx.projectId,
    )?.m
    const sortKey =
      payload.sortKey ?? (max === null || max === undefined ? BOOKMARK_ORDER_GAP : max + BOOKMARK_ORDER_GAP)
    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO bookmark
         (id, project_id, target_kind, canvas_id, label, viewport, sort_key,
          created_at, updated_at)
       VALUES (?, ?, 'canvas', ?, ?, ?, ?, ?, ?)`,
      payload.bookmarkId,
      ctx.projectId,
      payload.canvasId,
      payload.label,
      payload.viewport === null ? null : JSON.stringify(payload.viewport),
      sortKey,
      now,
      now,
    )
    return {
      affected: [{ kind: 'bookmark', id: payload.bookmarkId }],
      inverse: {
        commandType: COMMAND_REMOVE_BOOKMARK,
        commandVersion: 1,
        payload: { bookmarkId: payload.bookmarkId } satisfies RemoveBookmarkPayload,
      },
    }
  })

  registry.register<RemoveBookmarkPayload>(COMMAND_REMOVE_BOOKMARK, 1, (ctx, payload) => {
    const prior = requireBookmark(ctx, payload.bookmarkId)
    ctx.db.run('DELETE FROM bookmark WHERE id = ?', payload.bookmarkId)
    return {
      affected: [{ kind: 'bookmark', id: payload.bookmarkId }],
      inverse: {
        commandType: COMMAND_CREATE_BOOKMARK,
        commandVersion: 1,
        payload: {
          bookmarkId: prior.id,
          canvasId: prior.canvas_id,
          label: prior.label,
          viewport:
            prior.viewport === null ? null : (JSON.parse(prior.viewport) as BookmarkViewport),
          // Restore field: undo returns the row to its exact slot, so
          // every printed Mod+n binding comes back unchanged.
          sortKey: prior.sort_key,
        } satisfies CreateBookmarkPayload,
      },
    }
  })

  registry.register<ReorderBookmarkPayload>(COMMAND_REORDER_BOOKMARK, 1, (ctx, payload) => {
    if (payload.afterId === null && payload.beforeId === null) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'ReorderBookmark requires at least one of afterId or beforeId',
      )
    }
    if (payload.afterId === payload.bookmarkId || payload.beforeId === payload.bookmarkId) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'ReorderBookmark cannot order a bookmark against itself',
      )
    }
    requireBookmark(ctx, payload.bookmarkId)

    // Capture current neighbors for the inverse before anything
    // changes; neighbor identity survives rebalances.
    const before = orderedBookmarks(ctx)
    const index = before.findIndex((bookmark) => bookmark.id === payload.bookmarkId)
    const priorAfterId = index > 0 ? (before[index - 1]?.id ?? null) : null
    const priorBeforeId = index < before.length - 1 ? (before[index + 1]?.id ?? null) : null

    const computeKey = (): number | null => {
      const items = orderedBookmarks(ctx)
      const others = items.filter((item) => item.id !== payload.bookmarkId)
      const bound = (id: string): number => {
        const found = items.find((item) => item.id === id)
        if (!found) throw new DomainError('BOOKMARK_NOT_FOUND', `no bookmark ${id}`)
        return found.sortKey
      }
      const lower = payload.afterId === null ? null : bound(payload.afterId)
      const upper = payload.beforeId === null ? null : bound(payload.beforeId)
      if (lower !== null && upper !== null) {
        if (!(lower <= upper)) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'ReorderBookmark afterId must currently order above beforeId',
            { afterId: payload.afterId, beforeId: payload.beforeId },
          )
        }
        const mid = lower + (upper - lower) / 2
        // Float precision exhausted: signal the caller to rebalance.
        return mid > lower && mid < upper ? mid : null
      }
      if (upper === null) {
        // To the bottom of the menu.
        const max = others.length > 0 ? Math.max(...others.map((o) => o.sortKey)) : 0
        return max + BOOKMARK_ORDER_GAP
      }
      // To the top of the menu.
      const min = others.length > 0 ? Math.min(...others.map((o) => o.sortKey)) : 0
      return min - BOOKMARK_ORDER_GAP
    }

    let key = computeKey()
    if (key === null) {
      rebalanceBookmarks(ctx)
      key = computeKey()
      if (key === null) {
        throw new DomainError('INTERNAL', 'sort_key rebalance failed to free a key')
      }
    }

    ctx.db.run(
      'UPDATE bookmark SET sort_key = ?, updated_at = ? WHERE id = ?',
      key,
      ctx.now(),
      payload.bookmarkId,
    )
    return {
      affected: [{ kind: 'bookmark', id: payload.bookmarkId }],
      inverse: {
        commandType: COMMAND_REORDER_BOOKMARK,
        commandVersion: 1,
        payload: {
          bookmarkId: payload.bookmarkId,
          afterId: priorAfterId,
          beforeId: priorBeforeId,
        } satisfies ReorderBookmarkPayload,
      },
    }
  })
}
