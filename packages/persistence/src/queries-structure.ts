import type { QueryRegistry } from './queries'

/**
 * Structural read models (AI-IMP-012): canvas contents over the
 * shared placement+decoration plane (§4.4), the node library incl.
 * the Unplaced filter (§14.1), and tag views (§4.8). All queries are
 * single-shot SQL — no recursive containment walks here (invariant
 * 19 concerns traversal code, which lives with its callers and must
 * use visited sets).
 */

export interface CanvasContentItem {
  itemKind: 'placement' | 'decoration'
  id: string
  renderOrder: number
  [key: string]: unknown
}

interface NodeAppearanceColumns {
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  appearanceAssetId: string | null
  appearanceCrop: string | null
}

const NODE_APPEARANCE_SELECT = `n.appearance_kind AS appearanceKind,
    n.appearance_color AS appearanceColor,
    n.appearance_icon AS appearanceIcon,
    n.appearance_asset_id AS appearanceAssetId,
    n.appearance_crop AS appearanceCrop`

export function registerStructureQueries(registry: QueryRegistry): void {
  // §4.4: one render_order-sorted list across both content tables with
  // kind discriminators; UUID breaks ties deterministically.
  registry.register('getCanvasContents', (ctx, args) => {
    const { canvasId } = args as { canvasId: string }
    // §9.1/invariant 13: a trashed canvas renders nothing (its rows
    // are preserved for restore, not for display).
    const canvas = ctx.db.get<{ lifecycle_state: string }>(
      'SELECT lifecycle_state FROM canvas WHERE id = ?',
      canvasId,
    )
    if (!canvas || canvas.lifecycle_state !== 'active') return []
    // §9.6: a trashed node's placements are excluded from ordinary
    // rendering while the node is trashed.
    const placements = ctx.db.all<Record<string, unknown>>(
      `SELECT p.id, p.node_id AS nodeId, p.x, p.y, p.width, p.height, p.scale,
              p.rotation, p.flip_x AS flipX, p.flip_y AS flipY,
              p.render_order AS renderOrder, p.label_visible AS labelVisible
       FROM placement p
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       WHERE p.canvas_id = ? AND p.lifecycle_state = 'active'`,
      canvasId,
    )
    const decorations = ctx.db.all<Record<string, unknown>>(
      `SELECT id, kind, data, render_order AS renderOrder, locked, hidden,
              group_id AS groupId,
              anchor_start_placement_id AS anchorStartPlacementId,
              anchor_end_placement_id AS anchorEndPlacementId
       FROM decoration
       WHERE canvas_id = ? AND lifecycle_state = 'active'`,
      canvasId,
    )
    const items: CanvasContentItem[] = [
      ...placements.map((p) => ({ ...p, itemKind: 'placement' }) as CanvasContentItem),
      ...decorations.map(
        (d) =>
          ({
            ...d,
            data: JSON.parse(d.data as string) as Record<string, unknown>,
            itemKind: 'decoration',
          }) as unknown as CanvasContentItem,
      ),
    ]
    items.sort((a, b) =>
      a.renderOrder !== b.renderOrder
        ? a.renderOrder - b.renderOrder
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    )
    return items
  })

  // §14.1: every active node; unplaced (zero active placements) is a
  // legitimate durable state, not an error.
  registry.register('listNodeLibrary', (ctx, args) => {
    const { filter } = (args ?? {}) as { filter?: 'all' | 'unplaced' }
    const rows = ctx.db.all<
      NodeAppearanceColumns & {
        id: string
        noteId: string | null
        noteTitle: string | null
        placementCount: number
      }
    >(
      `SELECT n.id, n.note_id AS noteId, ${NODE_APPEARANCE_SELECT},
              note.title AS noteTitle,
              (SELECT count(*) FROM placement p
                JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
                WHERE p.node_id = n.id AND p.lifecycle_state = 'active')
                AS placementCount
       FROM node n
       LEFT JOIN note ON note.id = n.note_id
       WHERE n.project_id = ? AND n.lifecycle_state = 'active'
       ORDER BY n.id`,
      ctx.projectId,
    )
    const filtered = filter === 'unplaced' ? rows.filter((r) => r.placementCount === 0) : rows
    return filtered.map((row) => ({ ...row, tags: tagNamesFor(ctx, row.id) }))

    function tagNamesFor(c: typeof ctx, nodeId: string): string[] {
      return c.db
        .all<{ name: string }>(
          `SELECT t.name FROM tag t
           JOIN tag_assignment ta ON ta.tag_id = t.id
           WHERE ta.node_id = ? AND t.lifecycle_state = 'active'
           ORDER BY t.name_key`,
          nodeId,
        )
        .map((t) => t.name)
    }
  })

  // §4.8: activating a tag opens a data view of nodes carrying it.
  registry.register('getTagView', (ctx, args) => {
    const { tagId } = args as { tagId: string }
    const tag = ctx.db.get<{ id: string; name: string; color: string | null; icon: string | null }>(
      `SELECT id, name, color, icon FROM tag
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      tagId,
      ctx.projectId,
    )
    if (!tag) return null
    const nodes = ctx.db
      .all<
        NodeAppearanceColumns & {
          id: string
          noteTitle: string | null
          placementCount: number
        }
      >(
        `SELECT n.id, ${NODE_APPEARANCE_SELECT},
                note.title AS noteTitle,
                (SELECT count(*) FROM placement p
                  JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
                  WHERE p.node_id = n.id AND p.lifecycle_state = 'active')
                  AS placementCount
         FROM node n
         JOIN tag_assignment ta ON ta.node_id = n.id
         LEFT JOIN note ON note.id = n.note_id
         WHERE ta.tag_id = ? AND n.lifecycle_state = 'active'
         ORDER BY n.id`,
        tagId,
      )
      .map((node) => ({
        ...node,
        otherTags: ctx.db
          .all<{ name: string }>(
            `SELECT t.name FROM tag t
             JOIN tag_assignment ta ON ta.tag_id = t.id
             WHERE ta.node_id = ? AND t.id <> ? AND t.lifecycle_state = 'active'
             ORDER BY t.name_key`,
            node.id,
            tagId,
          )
          .map((t) => t.name),
      }))
    return { tag, nodes }
  })

  registry.register('getCanvasByNode', (ctx, args) => {
    const { nodeId } = args as { nodeId: string }
    return (
      ctx.db.get(
        `SELECT id, node_id AS nodeId,
                background_asset_id AS backgroundAssetId,
                background_settings AS backgroundSettings,
                background_color AS backgroundColor,
                camera, lifecycle_state AS lifecycleState
         FROM canvas WHERE node_id = ? AND project_id = ?`,
        nodeId,
        ctx.projectId,
      ) ?? null
    )
  })
}
