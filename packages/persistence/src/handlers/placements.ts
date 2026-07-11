import {
  COMMAND_CREATE_PLACEMENT,
  COMMAND_DELETE_DRAFT_PLACEMENT,
  COMMAND_FLIP_PLACEMENT,
  COMMAND_MOVE_PLACEMENT,
  COMMAND_REORDER_CONTENT,
  COMMAND_SET_PLACEMENT_LABEL_VISIBILITY,
  COMMAND_SET_PLACEMENT_CAPTION,
  COMMAND_SET_PLACEMENT_LOCK,
  COMMAND_TRANSFORM_CONTENT,
  DomainError,
  type CommandRegistry,
  type CreatePlacementPayload,
  type DeleteDraftPlacementPayload,
  type FlipPlacementPayload,
  type MovePlacementPayload,
  type ReleasedConnectorAnchor,
  type ReorderContentPayload,
  type SetPlacementLabelVisibilityPayload,
  type SetPlacementCaptionPayload,
  type SetPlacementLockPayload,
  type TransformContentItem,
  type TransformContentPayload,
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
  caption: string | null
  locked: number
}

const CAPTION_MAX_CODE_POINTS = 2_000

function payloadRecord(payload: unknown, command: string): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DomainError('VALIDATION_FAILED', `${command} payload must be an object`)
  }
  return payload as Record<string, unknown>
}

function requireId(payload: Record<string, unknown>, key: string, command: string): void {
  if (typeof payload[key] !== 'string' || payload[key].length === 0) {
    throw new DomainError('VALIDATION_FAILED', `${command} ${key} must be a non-empty string`)
  }
}

function finiteNumber(value: unknown, label: string, optional = false): void {
  if (optional && value === undefined) return
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be a finite number`)
  }
}

function positiveDimension(value: unknown, label: string, optional = false): void {
  if (value === null || optional && value === undefined) return
  finiteNumber(value, label)
  if ((value as number) <= 0) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be positive or null`)
  }
}

function positiveScale(value: unknown, label: string, optional = false): void {
  finiteNumber(value, label, optional)
  if (value !== undefined && (value as number) <= 0) {
    throw new DomainError('VALIDATION_FAILED', `${label} must be positive`)
  }
}

function optionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new DomainError('VALIDATION_FAILED', `${label} must be a boolean`)
  }
}

function normalizeCaption(value: unknown, command: string, optional = false): string | null | undefined {
  if (optional && value === undefined) return undefined
  if (value !== null && typeof value !== 'string') {
    throw new DomainError('VALIDATION_FAILED', `${command} caption must be a string or null`)
  }
  if (value === null) return null
  const normalized = value.trim()
  if (Array.from(normalized).length > CAPTION_MAX_CODE_POINTS) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `${command} caption must not exceed ${CAPTION_MAX_CODE_POINTS} characters`,
    )
  }
  return normalized.length === 0 ? null : normalized
}

function validateCreatePlacement(payload: unknown): void {
  const record = payloadRecord(payload, 'CreatePlacement')
  for (const key of ['placementId', 'canvasId', 'nodeId']) requireId(record, key, 'CreatePlacement')
  finiteNumber(record.x, 'CreatePlacement x', true)
  finiteNumber(record.y, 'CreatePlacement y', true)
  positiveDimension(record.width, 'CreatePlacement width', true)
  positiveDimension(record.height, 'CreatePlacement height', true)
  positiveScale(record.scale, 'CreatePlacement scale', true)
  finiteNumber(record.rotation, 'CreatePlacement rotation', true)
  finiteNumber(record.renderOrder, 'CreatePlacement renderOrder', true)
  for (const key of ['labelVisible', 'flipX', 'flipY', 'locked']) {
    optionalBoolean(record[key], `CreatePlacement ${key}`)
  }
  normalizeCaption(record.caption, 'CreatePlacement', true)
}

function validateSetPlacementCaption(payload: unknown): void {
  const record = payloadRecord(payload, 'SetPlacementCaption')
  requireId(record, 'placementId', 'SetPlacementCaption')
  normalizeCaption(record.caption, 'SetPlacementCaption')
}

function validatePlacementTransform(
  payload: Record<string, unknown>,
  command: string,
  idKey: string,
): void {
  requireId(payload, idKey, command)
  finiteNumber(payload.x, `${command} x`)
  finiteNumber(payload.y, `${command} y`)
  positiveDimension(payload.width, `${command} width`)
  positiveDimension(payload.height, `${command} height`)
  positiveScale(payload.scale, `${command} scale`)
  finiteNumber(payload.rotation, `${command} rotation`)
}

function validateMovePlacement(payload: unknown): void {
  validatePlacementTransform(payloadRecord(payload, 'MovePlacement'), 'MovePlacement', 'placementId')
}

function validateTransformContent(payload: unknown): void {
  const record = payloadRecord(payload, 'TransformContent')
  requireId(record, 'canvasId', 'TransformContent')
  if (!Array.isArray(record.items)) {
    throw new DomainError('VALIDATION_FAILED', 'TransformContent items must be an array')
  }
  for (const raw of record.items) {
    const item = payloadRecord(raw, 'TransformContent item')
    if (item.kind === 'placement') {
      validatePlacementTransform(item, 'TransformContent placement', 'placementId')
    } else if (item.kind === 'decoration') {
      requireId(item, 'decorationId', 'TransformContent decoration')
      assertFiniteJson(item.data, 'TransformContent decoration data')
    } else {
      throw new DomainError('VALIDATION_FAILED', 'TransformContent item kind is invalid')
    }
  }
}

function assertFiniteJson(value: unknown, label: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    finiteNumber(value, label)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertFiniteJson(entry, label)
    return
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      assertFiniteJson(entry, label)
    }
    return
  }
  throw new DomainError('VALIDATION_FAILED', `${label} must be JSON-compatible`)
}

function requirePlacement(ctx: CommandContext, placementId: string): PlacementRow {
  const row = ctx.db.get<PlacementRow>(
    `SELECT id, canvas_id, node_id, x, y, width, height, scale, rotation,
            flip_x, flip_y, render_order, label_visible, caption, locked
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
 * anchor columns. Runs in the caller's transaction and touches every
 * lifecycle state so a hard delete never leaves dangling anchor
 * references.
 *
 * Returns one `ReleasedConnectorAnchor` per affected decoration
 * carrying the pre-release state (which side(s) were freed and the
 * prior `data` blob) so the DeletePlacement inverse can re-bind the
 * anchors on undo (AI-IMP-164 — gesture round-trip fidelity, §10.2).
 */
export function releaseConnectorAnchorsCapturing(
  ctx: CommandContext,
  placementId: string,
): ReleasedConnectorAnchor[] {
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
  const released: ReleasedConnectorAnchor[] = []
  for (const row of anchored) {
    const priorData = JSON.parse(row.data) as Record<string, unknown>
    const freesStart = row.anchor_start_placement_id === placementId
    const freesEnd = row.anchor_end_placement_id === placementId
    // Clone before baking coordinates so `priorData` preserves the
    // exact prior start/end (the restore payload's source of truth).
    const data = { ...priorData }
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
    released.push({
      decorationId: row.id,
      freedStart: freesStart,
      freedEnd: freesEnd,
      priorData,
    })
  }
  return released
}

/**
 * Id-only wrapper over {@link releaseConnectorAnchorsCapturing} for
 * hard-delete paths (§9.7 purge) that only need the changed decoration
 * ids for the `affected` set, not an invertible payload.
 */
export function releaseConnectorAnchors(ctx: CommandContext, placementId: string): string[] {
  return releaseConnectorAnchorsCapturing(ctx, placementId).map((a) => a.decorationId)
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
          rotation, flip_x, flip_y, render_order, label_visible, caption, locked,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      normalizeCaption(payload.caption, 'CreatePlacement', true) ?? null,
      payload.locked ? 1 : 0,
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
  }, validateCreatePlacement)

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
            caption: prior.caption,
            locked: prior.locked === 1,
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
  }, validateMovePlacement)

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

  registry.register<SetPlacementCaptionPayload>(
    COMMAND_SET_PLACEMENT_CAPTION,
    1,
    (ctx, payload) => {
      const prior = requirePlacement(ctx, payload.placementId)
      const caption = normalizeCaption(payload.caption, 'SetPlacementCaption') ?? null
      ctx.db.run(
        'UPDATE placement SET caption = ?, updated_at = ? WHERE id = ?',
        caption,
        ctx.now(),
        payload.placementId,
      )
      return {
        affected: [{ kind: 'placement', id: payload.placementId }],
        inverse: {
          commandType: COMMAND_SET_PLACEMENT_CAPTION,
          commandVersion: 1,
          payload: {
            placementId: payload.placementId,
            caption: prior.caption,
          } satisfies SetPlacementCaptionPayload,
        },
      }
    },
    validateSetPlacementCaption,
  )

  registry.register<SetPlacementLockPayload>(COMMAND_SET_PLACEMENT_LOCK, 1, (ctx, payload) => {
    // §6.9 rev 0.17: lock is enforced at the gesture surface (refusal
    // cursor, no drag starts); the handler only persists the flag so
    // undoing a pre-lock transform can never dead-end on a lock check.
    if (typeof payload.locked !== 'boolean') {
      throw new DomainError('VALIDATION_FAILED', 'SetPlacementLock locked must be a boolean')
    }
    const prior = requirePlacement(ctx, payload.placementId)
    ctx.db.run(
      'UPDATE placement SET locked = ?, updated_at = ? WHERE id = ?',
      payload.locked ? 1 : 0,
      ctx.now(),
      payload.placementId,
    )
    return {
      affected: [{ kind: 'placement', id: payload.placementId }],
      inverse: {
        commandType: COMMAND_SET_PLACEMENT_LOCK,
        commandVersion: 1,
        payload: {
          placementId: payload.placementId,
          locked: prior.locked === 1,
        } satisfies SetPlacementLockPayload,
      },
    }
  })

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

  registry.register<TransformContentPayload>(COMMAND_TRANSFORM_CONTENT, 1, (ctx, payload) => {
    // Invariant 25: the whole completed multi-selection gesture —
    // drag, resize, rotate, align, distribute — is this one command.
    if (payload.items.length === 0) {
      throw new DomainError('EMPTY_TRANSFORM', 'TransformContent requires at least one item')
    }
    const seen = new Set<string>()
    const affected: { kind: 'placement' | 'decoration'; id: string }[] = []
    const inverseItems: TransformContentItem[] = []
    for (const item of payload.items) {
      const id = item.kind === 'placement' ? item.placementId : item.decorationId
      // A duplicate would corrupt the inverse (its prior state is the
      // first item's result).
      if (seen.has(id)) {
        throw new DomainError('DUPLICATE_TRANSFORM_ITEM', `item ${id} appears twice`)
      }
      seen.add(id)
      if (item.kind === 'placement') {
        const prior = requirePlacement(ctx, item.placementId)
        if (prior.canvas_id !== payload.canvasId) {
          throw new DomainError(
            'CROSS_CANVAS_TRANSFORM',
            `placement ${item.placementId} is not on canvas ${payload.canvasId}`,
          )
        }
        ctx.db.run(
          `UPDATE placement SET x = ?, y = ?, width = ?, height = ?, scale = ?,
                  rotation = ?, updated_at = ?
           WHERE id = ?`,
          item.x,
          item.y,
          item.width,
          item.height,
          item.scale,
          item.rotation,
          ctx.now(),
          item.placementId,
        )
        inverseItems.push({
          kind: 'placement',
          placementId: item.placementId,
          x: prior.x,
          y: prior.y,
          width: prior.width,
          height: prior.height,
          scale: prior.scale,
          rotation: prior.rotation,
        })
        affected.push({ kind: 'placement', id: item.placementId })
      } else {
        const prior = ctx.db.get<{ canvas_id: string; data: string }>(
          `SELECT canvas_id, data FROM decoration
           WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
          item.decorationId,
          ctx.projectId,
        )
        if (!prior) {
          throw new DomainError(
            'DECORATION_NOT_FOUND',
            `no active decoration ${item.decorationId}`,
          )
        }
        if (prior.canvas_id !== payload.canvasId) {
          throw new DomainError(
            'CROSS_CANVAS_TRANSFORM',
            `decoration ${item.decorationId} is not on canvas ${payload.canvasId}`,
          )
        }
        ctx.db.run(
          'UPDATE decoration SET data = ?, updated_at = ? WHERE id = ?',
          JSON.stringify(item.data),
          ctx.now(),
          item.decorationId,
        )
        inverseItems.push({
          kind: 'decoration',
          decorationId: item.decorationId,
          data: JSON.parse(prior.data) as Record<string, unknown>,
        })
        affected.push({ kind: 'decoration', id: item.decorationId })
      }
    }
    return {
      affected,
      inverse: {
        commandType: COMMAND_TRANSFORM_CONTENT,
        commandVersion: 1,
        payload: {
          canvasId: payload.canvasId,
          items: inverseItems,
        } satisfies TransformContentPayload,
      },
    }
  }, validateTransformContent)
}
