import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import { CommandRegistry, type CommittedResult, type InverseCommand } from '@ew/commands'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dispatcher, type CommandContext } from '../dispatcher'
import { createProject, type ProjectHandle } from '../project'
import { BOOKMARK_ORDER_GAP, registerBookmarkHandlers } from './bookmarks'
import { registerCanvasHandlers } from './canvases'
import { registerLifecycleHandlers } from './lifecycle'
import { registerNodeHandlers } from './nodes'

let dir: string
let handle: ProjectHandle
let dispatcher: Dispatcher

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-bookmark-'))
  handle = createProject(dir, 'Bookmark Test')
  const registry = new CommandRegistry<CommandContext>()
  registerNodeHandlers(registry)
  registerCanvasHandlers(registry)
  registerLifecycleHandlers(registry)
  registerBookmarkHandlers(registry)
  dispatcher = new Dispatcher(handle, registry)
})

afterEach(() => {
  handle.close()
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

function exec(commandType: string, payload: unknown) {
  return dispatcher.execute({
    commandId: uuidv7(),
    projectId: handle.projectId,
    commandType,
    commandVersion: 1,
    issuedAt: new Date().toISOString(),
    payload,
  })
}

function committed(commandType: string, payload: unknown): CommittedResult {
  const result = exec(commandType, payload)
  expect(result).toMatchObject({ status: 'committed' })
  return result as CommittedResult
}

function undo(inverse: InverseCommand | null): CommittedResult {
  expect(inverse).not.toBeNull()
  return committed(inverse!.commandType, inverse!.payload)
}

function seedCanvas(): string {
  const nodeId = uuidv7()
  const canvasId = uuidv7()
  committed('CreateNode', { nodeId })
  committed('CreateCanvas', { canvasId, nodeId })
  return canvasId
}

function bookmark(canvasId: string, label: string, sortKey?: number): string {
  const bookmarkId = uuidv7()
  committed('CreateBookmark', {
    bookmarkId,
    canvasId,
    label,
    viewport: null,
    ...(sortKey === undefined ? {} : { sortKey }),
  })
  return bookmarkId
}

function menuOrder(): string[] {
  return handle.db
    .all<{ id: string }>(
      'SELECT id FROM bookmark WHERE project_id = ? ORDER BY sort_key, id',
      handle.projectId,
    )
    .map((row) => row.id)
}

describe('CreateBookmark', () => {
  it('appends at the bottom with GAP-spaced keys and stores the viewport', () => {
    const canvasId = seedCanvas()
    const first = uuidv7()
    const result = committed('CreateBookmark', {
      bookmarkId: first,
      canvasId,
      label: 'Harbor',
      viewport: { x: 10, y: -4, zoom: 2 },
    })
    expect(result.affected).toEqual([{ kind: 'bookmark', id: first }])
    const second = bookmark(canvasId, 'Keep')

    const rows = handle.db.all<{ id: string; label: string; viewport: string | null; sort_key: number }>(
      'SELECT id, label, viewport, sort_key FROM bookmark ORDER BY sort_key',
    )
    expect(rows.map((r) => r.id)).toEqual([first, second])
    expect(rows[0]!.sort_key).toBe(BOOKMARK_ORDER_GAP)
    expect(rows[1]!.sort_key).toBe(2 * BOOKMARK_ORDER_GAP)
    expect(JSON.parse(rows[0]!.viewport!)).toEqual({ x: 10, y: -4, zoom: 2 })
    expect(rows[1]!.viewport).toBeNull()
  })

  it('rejects an empty label and a degenerate viewport', () => {
    const canvasId = seedCanvas()
    expect(
      exec('CreateBookmark', { bookmarkId: uuidv7(), canvasId, label: '', viewport: null }),
    ).toMatchObject({ status: 'error', code: 'VALIDATION_FAILED' })
    expect(
      exec('CreateBookmark', {
        bookmarkId: uuidv7(),
        canvasId,
        label: 'x',
        viewport: { x: 0, y: 0, zoom: 0 },
      }),
    ).toMatchObject({ status: 'error', code: 'INVALID_VIEWPORT' })
  })

  it('does not require the target to exist (§8.1: stable ids, explicit degradation)', () => {
    // Undo of removing a broken bookmark recreates a row whose canvas
    // was purged — creation therefore never validates the target.
    const result = exec('CreateBookmark', {
      bookmarkId: uuidv7(),
      canvasId: uuidv7(),
      label: 'Ghost',
      viewport: null,
    })
    expect(result).toMatchObject({ status: 'committed' })
  })

  it('undo (RemoveBookmark inverse) deletes the row', () => {
    const canvasId = seedCanvas()
    const bookmarkId = uuidv7()
    const result = committed('CreateBookmark', {
      bookmarkId,
      canvasId,
      label: 'Harbor',
      viewport: null,
    })
    undo(result.inverse)
    expect(handle.db.get('SELECT id FROM bookmark WHERE id = ?', bookmarkId)).toBeUndefined()
  })
})

describe('RemoveBookmark', () => {
  it('deletes the row; undo restores it to its exact slot with its viewport', () => {
    const canvasId = seedCanvas()
    const a = bookmark(canvasId, 'A')
    const b = uuidv7()
    committed('CreateBookmark', {
      bookmarkId: b,
      canvasId,
      label: 'B',
      viewport: { x: 1, y: 2, zoom: 3 },
    })
    const c = bookmark(canvasId, 'C')

    const removal = committed('RemoveBookmark', { bookmarkId: b })
    expect(menuOrder()).toEqual([a, c])

    undo(removal.inverse)
    // Back in the middle — every printed Mod+n binding is unchanged.
    expect(menuOrder()).toEqual([a, b, c])
    const restored = handle.db.get<{ label: string; viewport: string }>(
      'SELECT label, viewport FROM bookmark WHERE id = ?',
      b,
    )!
    expect(restored.label).toBe('B')
    expect(JSON.parse(restored.viewport)).toEqual({ x: 1, y: 2, zoom: 3 })
  })

  it('errors on an unknown bookmark', () => {
    expect(exec('RemoveBookmark', { bookmarkId: uuidv7() })).toMatchObject({
      status: 'error',
      code: 'BOOKMARK_NOT_FOUND',
    })
  })
})

describe('ReorderBookmark', () => {
  it('moves to the top, between, and to the bottom; undo restores the prior order', () => {
    const canvasId = seedCanvas()
    const a = bookmark(canvasId, 'A')
    const b = bookmark(canvasId, 'B')
    const c = bookmark(canvasId, 'C')

    // C to the top (afterId null = nothing above it).
    const toTop = committed('ReorderBookmark', { bookmarkId: c, afterId: null, beforeId: a })
    expect(menuOrder()).toEqual([c, a, b])

    // Undo returns C below B.
    undo(toTop.inverse)
    expect(menuOrder()).toEqual([a, b, c])

    // A between B and C (midpoint insertion).
    committed('ReorderBookmark', { bookmarkId: a, afterId: b, beforeId: c })
    expect(menuOrder()).toEqual([b, a, c])

    // B to the bottom (beforeId null = nothing below it).
    committed('ReorderBookmark', { bookmarkId: b, afterId: c, beforeId: null })
    expect(menuOrder()).toEqual([a, c, b])
  })

  it('validates its arguments', () => {
    const canvasId = seedCanvas()
    const a = bookmark(canvasId, 'A')
    const b = bookmark(canvasId, 'B')
    expect(exec('ReorderBookmark', { bookmarkId: a, afterId: null, beforeId: null })).toMatchObject(
      { status: 'error', code: 'VALIDATION_FAILED' },
    )
    expect(exec('ReorderBookmark', { bookmarkId: a, afterId: a, beforeId: null })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    // afterId must currently order above beforeId.
    expect(exec('ReorderBookmark', { bookmarkId: a, afterId: b, beforeId: a })).toMatchObject({
      status: 'error',
      code: 'VALIDATION_FAILED',
    })
    expect(
      exec('ReorderBookmark', { bookmarkId: uuidv7(), afterId: a, beforeId: null }),
    ).toMatchObject({ status: 'error', code: 'BOOKMARK_NOT_FOUND' })
  })

  it('rebalances transactionally when float precision exhausts the gap', () => {
    const canvasId = seedCanvas()
    const a = bookmark(canvasId, 'A')
    const b = bookmark(canvasId, 'B')
    const c = bookmark(canvasId, 'C')
    // Force an unsplittable interval: identical keys (mid === lower).
    handle.db.run('UPDATE bookmark SET sort_key = 1 WHERE id IN (?, ?)', a, b)
    handle.db.run('UPDATE bookmark SET sort_key = 99 WHERE id = ?', c)
    const order = menuOrder() // [a, b] by id tiebreak, then c
    const [first, second] = order[0] === a ? [a, b] : [b, a]
    committed('ReorderBookmark', { bookmarkId: c, afterId: first, beforeId: second })
    expect(menuOrder()).toEqual([first, c, second])
    // Rebalance left GAP-spaced keys.
    const keys = handle.db
      .all<{ sort_key: number }>('SELECT sort_key FROM bookmark ORDER BY sort_key')
      .map((row) => row.sort_key)
    expect(new Set(keys).size).toBe(3)
  })
})

describe('§8.1 target degradation at the record level', () => {
  it('bookmark rows survive trash, restore, and purge of their target', () => {
    const canvasId = seedCanvas()
    const bookmarkId = bookmark(canvasId, 'Fragile')

    committed('TrashCanvas', { canvasId })
    expect(handle.db.get('SELECT id FROM bookmark WHERE id = ?', bookmarkId)).toBeDefined()

    // Restore revalidates with no bookmark write at all (stable ids).
    committed('RestoreRecord', { kind: 'canvas', id: canvasId })
    expect(handle.db.get('SELECT id FROM bookmark WHERE id = ?', bookmarkId)).toBeDefined()

    committed('TrashCanvas', { canvasId })
    const purge = committed('PurgeRecord', { kind: 'canvas', id: canvasId })
    expect(purge.affected).toContainEqual({ kind: 'bookmark', id: bookmarkId })
    // Never silently vanishes: the broken row remains for the menu.
    expect(handle.db.get('SELECT id FROM bookmark WHERE id = ?', bookmarkId)).toBeDefined()

    // ...and its removal (the offered action) still round-trips.
    const removal = committed('RemoveBookmark', { bookmarkId })
    undo(removal.inverse)
    expect(handle.db.get('SELECT id FROM bookmark WHERE id = ?', bookmarkId)).toBeDefined()
  })
})
