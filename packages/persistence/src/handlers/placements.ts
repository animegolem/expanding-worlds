import {
  COMMAND_CREATE_PLACEMENT,
  COMMAND_DELETE_DRAFT_PLACEMENT,
  COMMAND_FLIP_PLACEMENT,
  COMMAND_MOVE_PLACEMENT,
  COMMAND_REORDER_CONTENT,
  COMMAND_SET_PLACEMENT_LABEL_VISIBILITY,
  DomainError,
  type CommandRegistry,
  type CreatePlacementPayload,
  type DeleteDraftPlacementPayload,
  type FlipPlacementPayload,
  type MovePlacementPayload,
  type ReorderContentPayload,
  type SetPlacementLabelVisibilityPayload,
} from '@ew/commands'
import type { CommandContext } from '../dispatcher'
import {
  nextRenderOrder,
  orderBetween,
  orderedCanvasContent,
  rebalanceCanvas,
  RENDER_ORDER_GAP,
} from '../render-order'

interface PlacementRow {
  id: string
  canvas_id: string
  node_id: string
  x: number
  y: number
  width: number | null
  height: number | null
  scale: number
  rotation: number
  flip_x: number
  flip_y: number
  render_order: number
  label_visible: number
}

function requirePlacement(ctx: CommandContext, placementId: string): PlacementRow {
  const row = ctx.db.get<PlacementRow>(
    `SELECT id, canvas_id, node_id, x, y, width, height, scale, rotation,
            flip_x, flip_y, render_order, label_visible
     FROM placement
     WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
    placementId,
    ctx.projectId,
  )
  if (!row) throw new DomainError('PLACEMENT_NOT_FOUND', `no active placement ${placementId}`)
  return row
}

/**
 * §4.9: converts connector endpoints anchored to `placementId` into
 * free points at their last rendered position (the placement's
 * position, written into decoration.data as {x, y}), clearing the
 * anchor columns. Exposed for AI-IMP-013's DeletePlacement; returns
 * the ids of decorations that changed. Runs in the caller's
 * transaction and touches every lifecycle state so a hard delete
 * never leaves dangling anchor references.
 */
export function releaseConnectorAnchors(ctx: CommandContext, placementId: string): string[] {
  const placement = ctx.db.get<{ x: number; y: number }>(
    'SELECT x, y FROM placement WHERE id = ?',
    placementId,
  )
  if (!placement) return []
  const anchored = ctx.db.all<{
    id: string
    data: string
    anchor_start_placement_id: string | null
    anchor_end_placement_id: string | null
  }>(
    `SELECT id, data, anchor_start_placement_id, anchor_end_placement_id
     FROM decoration
     WHERE anchor_start_placement_id = ?1 OR anchor_end_placement_id = ?1`,
    placementId,
  )
  const now = ctx.now()
  for (const row of anchored) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    const freesStart = row.anchor_start_placement_id === placementId
    const freesEnd = row.anchor_end_placement_id === placementId
    if (freesStart) data.start = { x: placement.x, y: placement.y }
    if (freesEnd) data.end = { x: placement.x, y: placement.y }
    ctx.db.run(
      `UPDATE decoration SET
         data = ?,
         anchor_start_placement_id = CASE WHEN anchor_start_placement_id = ?2 THEN NULL
                                          ELSE anchor_start_placement_id END,
         anchor_end_placement_id = CASE WHEN anchor_end_placement_id = ?2 THEN NULL
                                        ELSE anchor_end_placement_id END,
         updated_at = ?
       WHERE id = ?`,
      JSON.stringify(data),
      placementId,
      now,
      row.id,
    )
  }
  return anchored.map((row) => row.id)
}

/**
 * Placement command handlers (RFC-0001 §4.5) plus ReorderContent over
 * the shared placement+decoration plane (§4.4). Lifecycle-aware
 * DeletePlacement belongs to AI-IMP-013.
 */
export function registerPlacementHandlers(registry: CommandRegistry<CommandContext>): void {
  registry.register<CreatePlacementPayload>(COMMAND_CREATE_PLACEMENT, 1, (ctx, payload) => {
    // Invariant 7: placements target node IDs; both FKs checked here
    // for structured errors before SQLite would reject them.
    const canvas = ctx.db.get<{ id: string }>(
      `SELECT id FROM canvas
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.canvasId,
      ctx.projectId,
    )
    if (!canvas) throw new DomainError('CANVAS_NOT_FOUND', `no active canvas ${payload.canvasId}`)
    const node = ctx.db.get<{ id: string }>(
      `SELECT id FROM node
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      payload.nodeId,
      ctx.projectId,
    )
    if (!node) throw new DomainError('NODE_NOT_FOUND', `no active node ${payload.nodeId}`)

    const now = ctx.now()
    ctx.db.run(
      `INSERT INTO placement
         (id, project_id, canvas_id, node_id, x, y, width, height, scale,
          rotation, flip_x, flip_y, render_order, label_visible,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.placementId,
      ctx.projectId,
      payload.canvasId,
      payload.nodeId,
      payload.x ?? 0,
      payload.y ?? 0,
      payload.width ?? null,
      payload.height ?? null,
      payload.scale ?? 1,
      payload.rotation ?? 0,
      payload.flipX ? 1 : 0,
      payload.flipY ? 1 : 0,
      payload.renderOrder ?? nextRenderOrder(ctx, payload.canvasId),
      // §4.5: label visibility defaults to visible.
      (payload.labelVisible ?? true) ? 1 : 0,
      now,
      now,
    )
    return {
      affected: [{ kind: 'placement', id: payload.placementId }],
      inverse: {
        commandType: COMMAND_DELETE_DRAFT_PLACEMENT,
        commandVersion: 1,
        payload: { placementId: payload.placementId } satisfies DeleteDraftPlacementPayload,
      },
    }
  })

  registry.register<DeleteDraftPlacementPayload>(
    COMMAND_DELETE_DRAFT_PLACEMENT,
    1,
    (ctx, payload) => {
      const prior = requirePlacement(ctx, payload.placementId)
      const freed = releaseConnectorAnchors(ctx, payload.placementId)
      ctx.db.run('DELETE FROM placement WHERE id = ?', payload.placementId)
      return {
        affected: [
          { kind: 'placement', id: payload.placementId },
          ...freed.map((id) => ({ kind: 'decoration' as const, id })),
        ],
        inverse: {
          commandType: COMMAND_CREATE_PLACEMENT,
          commandVersion: 1,
          payload: {
            placementId: prior.id,
            canvasId: prior.canvas_id,
            nodeId: prior.node_id,
            x: prior.x,
            y: prior.y,
            width: prior.width,
            height: prior.height,
            scale: prior.scale,
            rotation: prior.rotation,
            flipX: prior.flip_x === 1,
            flipY: prior.flip_y === 1,
            renderOrder: prior.render_order,
            labelVisible: prior.label_visible === 1,
          } satisfies CreatePlacementPayload,
        },
      }
    },
  )

  registry.register<MovePlacementPayload>(COMMAND_MOVE_PLACEMENT, 1, (ctx, payload) => {
    // Invariant 25: the completed gesture commits one command carrying
    // the full resulting transform.
    const prior = requirePlacement(ctx, payload.placementId)
    ctx.db.run(
      `UPDATE placement SET x = ?, y = ?, width = ?, height = ?, scale = ?,
              rotation = ?, updated_at = ?
       WHERE id = ?`,
      payload.x,
      payload.y,
      payload.width,
      payload.height,
      payload.scale,
      payload.rotation,
      ctx.now(),
      payload.placementId,
    )
    return {
      affected: [{ kind: 'placement', id: payload.placementId }],
      inverse: {
        commandType: COMMAND_MOVE_PLACEMENT,
        commandVersion: 1,
        payload: {
          placementId: payload.placementId,
          x: prior.x,
          y: prior.y,
          width: prior.width,
          height: prior.height,
          scale: prior.scale,
          rotation: prior.rotation,
        } satisfies MovePlacementPayload,
      },
    }
  })

  registry.register<SetPlacementLabelVisibilityPayload>(
    COMMAND_SET_PLACEMENT_LABEL_VISIBILITY,
    1,
    (ctx, payload) => {
      const prior = requirePlacement(ctx, payload.placementId)
      ctx.db.run(
        'UPDATE placement SET label_visible = ?, updated_at = ? WHERE id = ?',
        payload.visible ? 1 : 0,
        ctx.now(),
        payload.placementId,
      )
      return {
        affected: [{ kind: 'placement', id: payload.placementId }],
        inverse: {
          commandType: COMMAND_SET_PLACEMENT_LABEL_VISIBILITY,
          commandVersion: 1,
          payload: {
            placementId: payload.placementId,
            visible: prior.label_visible === 1,
          } satisfies SetPlacementLabelVisibilityPayload,
        },
      }
    },
  )

  registry.register<FlipPlacementPayload>(COMMAND_FLIP_PLACEMENT, 1, (ctx, payload) => {
    if (payload.axis !== 'x' && payload.axis !== 'y') {
      throw new DomainError('VALIDATION_FAILED', 'FlipPlacement axis must be "x" or "y"')
    }
    requirePlacement(ctx, payload.placementId)
    const column = payload.axis === 'x' ? 'flip_x' : 'flip_y'
    ctx.db.run(
      `UPDATE placement SET ${column} = 1 - ${column}, updated_at = ? WHERE id = ?`,
      ctx.now(),
      payload.placementId,
    )
    return {
      affected: [{ kind: 'placement', id: payload.placementId }],
      // Toggling is self-inverse.
      inverse: {
        commandType: COMMAND_FLIP_PLACEMENT,
        commandVersion: 1,
        payload: {
          placementId: payload.placementId,
          axis: payload.axis,
        } satisfies FlipPlacementPayload,
      },
    }
  })

  registry.register<ReorderContentPayload>(COMMAND_REORDER_CONTENT, 1, (ctx, payload) => {
    if (payload.afterId === null && payload.beforeId === null) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'ReorderContent requires at least one of afterId or beforeId',
      )
    }
    if (payload.afterId === payload.itemId || payload.beforeId === payload.itemId) {
      throw new DomainError('VALIDATION_FAILED', 'ReorderContent cannot order an item against itself')
    }

    const resolve = (id: string) => {
      const items = orderedCanvasContent(ctx, payload.canvasId)
      const found = items.find((item) => item.id === id)
      if (!found) {
        throw new DomainError(
          'CONTENT_NOT_FOUND',
          `no placement or decoration ${id} on canvas ${payload.canvasId}`,
          { canvasId: payload.canvasId, itemId: id },
        )
      }
      return found
    }

    const moved = resolve(payload.itemId)

    // Capture the current neighbors (visible plane) for the inverse
    // before anything changes; neighbor identity survives rebalances.
    const before = orderedCanvasContent(ctx, payload.canvasId)
    const index = before.findIndex((item) => item.id === payload.itemId)
    const priorAfterId = index > 0 ? (before[index - 1]?.id ?? null) : null
    const priorBeforeId = index < before.length - 1 ? (before[index + 1]?.id ?? null) : null

    const computeKey = (): number | null => {
      const items = orderedCanvasContent(ctx, payload.canvasId)
      const others = items.filter((item) => item.id !== payload.itemId)
      const lower = payload.afterId === null ? null : resolve(payload.afterId).renderOrder
      const upper = payload.beforeId === null ? null : resolve(payload.beforeId).renderOrder
      if (lower !== null && upper !== null) {
        if (!(lower <= upper)) {
          throw new DomainError(
            'VALIDATION_FAILED',
            'ReorderContent afterId must currently order below beforeId',
            { afterId: payload.afterId, beforeId: payload.beforeId },
          )
        }
        const mid = orderBetween(lower, upper)
        // Float precision exhausted: signal the caller to rebalance.
        return mid > lower && mid < upper ? mid : null
      }
      if (upper === null) {
        // Bring to front of the whole plane; any afterId bound is
        // satisfied because the new key exceeds every existing key.
        const max = others.length > 0 ? Math.max(...others.map((o) => o.renderOrder)) : 0
        return max + RENDER_ORDER_GAP
      }
      // Send to back of the whole plane.
      const min = others.length > 0 ? Math.min(...others.map((o) => o.renderOrder)) : 0
      return min - RENDER_ORDER_GAP
    }

    let key = computeKey()
    if (key === null) {
      // §4.4: rebalance transactionally without changing visible order,
      // then allocate again in the refreshed key space.
      rebalanceCanvas(ctx, payload.canvasId)
      key = computeKey()
      if (key === null) {
        throw new DomainError('INTERNAL', 'render_order rebalance failed to free a key')
      }
    }

    const table = moved.itemKind === 'placement' ? 'placement' : 'decoration'
    ctx.db.run(
      `UPDATE ${table} SET render_order = ?, updated_at = ? WHERE id = ?`,
      key,
      ctx.now(),
      payload.itemId,
    )
    return {
      affected: [{ kind: moved.itemKind, id: payload.itemId }],
      inverse: {
        commandType: COMMAND_REORDER_CONTENT,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          itemId: payload.itemId,
          afterId: priorAfterId,
          beforeId: priorBeforeId,
        } satisfies ReorderContentPayload,
      },
    }
  })
}
