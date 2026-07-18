import type { QueryRegistry } from './queries'
import {
  canvasDisplayLabel,
  nodeDisplayLabel,
  readLiveCanvasDisplayLabels,
  type CanvasDisplayLabel,
} from './display-labels'

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

export interface CanvasScene {
  canvasId: string
  nodeId: string
  camera: { x: number; y: number; zoom: number }
  background: {
    color: string | null
    assetId: string | null
    assetContentHash: string | null
    assetMimeType: string | null
    assetWidth: number | null
    assetHeight: number | null
    settings: Record<string, unknown> | null
  }
  items: CanvasContentItem[]
}

/** One §8.1 bookmark menu row (AI-IMP-061). */
export interface BookmarkListRow {
  id: string
  targetKind: 'canvas'
  canvasId: string
  label: string
  viewport: { x: number; y: number; zoom: number } | null
  sortKey: number
  /** §8.1 degradation: trashed greys with Restore; purged is broken.
   * A board is trashed when EITHER its canvas row or its owning node
   * is trashed (§9.6: trashing the node degrades the owned board the
   * same way a direct canvas trash does). */
  targetState: 'active' | 'trashed' | 'purged'
  /** Which record Restore must revive (§9.7). 'canvas' for a
   * directly-trashed board; 'node' when the OWNER node is the trashed
   * record — restoring the aggregate root brings the board back
   * (§9.6). null for active/purged rows. */
  trashedKind: 'canvas' | 'node' | null
  /** The owning node id — the RestoreRecord target when
   * `trashedKind === 'node'`. */
  ownerNodeId: string
}

interface NodeAppearanceColumns {
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  appearanceAssetId: string | null
  appearanceCrop: string | null
}

/** One placement row inside an outline canvas entry (§14.1). */
export interface OutlineChildRow extends NodeAppearanceColumns {
  placementId: string
  /** §4.5 rev 0.71: display meta on this placement's existing row;
   * never an outline/search identity or a row of its own. */
  caption: string | null
  nodeId: string
  renderOrder: number
  noteId: string | null
  noteTitle: string | null
  childCanvasId: string | null
  placementCount: number
  assetContentHash: string | null
  assetFilename: string | null
  boardChildCount: number
  tags: string[]
}

/** One active canvas in the outline projection (§14.1). The view
 * assembles the tree from childCanvasId references with a visited
 * set per branch; cycles render as alias rows there, never here. */
export interface OutlineCanvasRow {
  canvasId: string
  nodeId: string
  label: string
  isRoot: boolean
  /** Root canvas, or a canvas whose owning node is unplaced (it can
   * appear as no board's child and must surface at root level). */
  isRootLevel: boolean
  childCount: number
  children: OutlineChildRow[]
}

export interface OutlinePlace {
  placementId: string
  canvasId: string
  canvasLabel: string
}

export type OutlinePreviewTarget =
  | { kind: 'node'; nodeId: string }
  | { kind: 'note'; noteId: string }

/** Selection-driven projection for the outliner's preview pane. */
export interface OutlinePreview {
  targetKind: 'node' | 'note'
  nodeId: string | null
  noteId: string | null
  noteTitle: string | null
  noteExcerpt: string | null
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  assetContentHash: string | null
  assetFilename: string | null
  childCanvasId: string | null
  childCount: number
  placementCount: number
  tags: string[]
  places: OutlinePlace[]
}

export interface OutlineFacetCounts {
  all: number
  unplaced: number
  orphans: number
  disconnected: number
  untagged: number
}

export type BoardFilmstripItem =
  | {
      kind: 'image'
      placementId: string
      nodeId: string
      renderOrder: number
      label: string
      contentHash: string
      filename: string
      thumbnailReady: boolean
    }
  | {
      kind: 'glyph'
      placementId: string
      nodeId: string
      renderOrder: number
      label: string
      appearanceKind: 'board' | 'card' | 'dot' | 'icon' | 'image'
      appearanceColor: string | null
      appearanceIcon: string | null
    }

export interface BoardFilmstrip {
  canvasId: string
  items: BoardFilmstripItem[]
  totalCount: number
  remainderCount: number
}

/** A loose note (§14.1): active, attached to no active node. */
export interface LooseNoteRow {
  id: string
  title: string
}

/** One active placement location of a tag carrier (§4.8 tag panel,
 * AI-IMP-071): enough for the row's location line and fly-to without
 * N+1 renderer queries. Labels follow the outline/quick-open
 * convention — owning node's note title, else the node's short code;
 * the root canvas reads "Home" (the navigation stack's root label). */
export interface TagViewPlacement {
  placementId: string
  canvasId: string
  canvasLabel: string
}

/** One carrier node in the §4.8 tag panel. `placements` empty means
 * an unplaced carrier — a legitimate row (loose badge), not an
 * omission. */
export interface TagViewNode extends NodeAppearanceColumns {
  id: string
  noteId: string | null
  noteTitle: string | null
  childCanvasId: string | null
  displayLabel: string
  placementCount: number
  otherTags: string[]
  placements: TagViewPlacement[]
}

/** One node's identity + active placement locations (§8.3, the ⌕
 * panel's asset-row expansion). Label conventions match TagViewNode/
 * TagViewPlacement; empty `placements` is the unplaced state. */
export interface NodeLocations {
  nodeId: string
  label: string
  appearanceKind: string | null
  appearanceColor: string | null
  appearanceIcon: string | null
  noteId: string | null
  placements: TagViewPlacement[]
}

const NODE_APPEARANCE_SELECT = `n.appearance_kind AS appearanceKind,
    n.appearance_color AS appearanceColor,
    n.appearance_icon AS appearanceIcon,
    n.appearance_asset_id AS appearanceAssetId,
    n.appearance_crop AS appearanceCrop`

/** §4.6 card appearance (AI-IMP-084): the fixed chrome's default
 * world size for placements carrying no explicit size. MUST match
 * CARD_DEFAULT_WIDTH/HEIGHT in @ew/canvas-engine renderers/
 * placement.ts — persistence never imports the engine (§11.1), so
 * the numbers are mirrored. Coalescing happens in the scene
 * projection so hit box, selection chrome, snapping, and renderer
 * all read ONE size through placement width/height (the same way an
 * image body reads its natural asset dimensions). */
const CARD_DEFAULT_WIDTH = 260
const CARD_DEFAULT_HEIGHT = 160

/**
 * §9.6 "usable canvas" predicate (AI-IMP-163). Trashing a node flips
 * the NODE ROW ALONE — one preserved aggregate — so its owned canvas
 * row stays `active`. A board is therefore renderable / counted /
 * reachable only when BOTH its own canvas row AND its owning node are
 * active. Every read model that surfaces a board's content must
 * re-check the owner, exactly the way `getCanvasScene`'s load-bearing
 * owner join does (that query is the reference behavior). This helper
 * emits the owner-node JOIN for a canvas already in scope; the caller
 * still writes the canvas's own `<alias>.lifecycle_state = 'active'`
 * filter. `canvas.node_id` is NOT NULL and FK-backed, and the root
 * node is trigger-protected against trashing (migration 0001), so an
 * inner join here never drops the root canvas.
 *
 * @param canvasAlias in-scope canvas alias (e.g. 'c', 'pc')
 * @param ownerAlias  fresh alias to bind the owning node under
 */
export function usableCanvasOwnerJoin(canvasAlias: string, ownerAlias: string): string {
  return `JOIN node ${ownerAlias} ON ${ownerAlias}.id = ${canvasAlias}.node_id
      AND ${ownerAlias}.lifecycle_state = 'active'`
}

export function registerStructureQueries(registry: QueryRegistry): void {
  registry.register('getCanvasDisplayLabels', (ctx, args): CanvasDisplayLabel[] => {
    const requested = (args ?? {}) as { canvasIds?: unknown }
    const canvasIds = Array.isArray(requested.canvasIds)
      ? requested.canvasIds.filter((id): id is string => typeof id === 'string')
      : []
    return [...readLiveCanvasDisplayLabels(ctx, canvasIds)].map(([canvasId, label]) => ({
      canvasId,
      label,
    }))
  })

  // §4.4: one render_order-sorted list across both content tables with
  // kind discriminators; UUID breaks ties deterministically.
  registry.register('getCanvasContents', (ctx, args) => {
    const { canvasId } = args as { canvasId: string }
    // §9.1/invariant 13: a trashed canvas renders nothing (its rows
    // are preserved for restore, not for display). §9.6 (AI-IMP-163):
    // a board whose OWNER node is trashed renders nothing either — the
    // node row alone flips while the canvas row stays active, so the
    // owner join is what refuses it, mirroring getCanvasScene.
    const canvas = ctx.db.get<{ id: string }>(
      `SELECT c.id FROM canvas c
       ${usableCanvasOwnerJoin('c', 'owner')}
       WHERE c.id = ? AND c.lifecycle_state = 'active'`,
      canvasId,
    )
    if (!canvas) return []
    // §9.6: a trashed node's placements are excluded from ordinary
    // rendering while the node is trashed.
    const placements = ctx.db.all<Record<string, unknown>>(
      `SELECT p.id, p.node_id AS nodeId, p.x, p.y, p.width, p.height, p.scale,
              p.rotation, p.flip_x AS flipX, p.flip_y AS flipY,
              p.render_order AS renderOrder, p.label_visible AS labelVisible,
              p.caption, p.locked
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

  // §12.2/§13.1: the one-round-trip read model behind the renderer's
  // scene projection. Same visibility rules as getCanvasContents, plus
  // everything a display object needs: appearance, note title (label,
  // §4.5), image-asset addressing by content hash (ew-asset://), the
  // camera, and the background (§4.4: color renders beneath the image
  // when both exist).
  registry.register('getCanvasScene', (ctx, args) => {
    const { canvasId } = args as { canvasId: string }
    const canvas = ctx.db.get<{
      id: string
      nodeId: string
      camera: string
      backgroundColor: string | null
      backgroundAssetId: string | null
      backgroundSettings: string | null
      assetContentHash: string | null
      assetMimeType: string | null
      assetWidth: number | null
      assetHeight: number | null
    }>(
      `SELECT c.id, c.node_id AS nodeId, c.camera,
              c.background_color AS backgroundColor,
              c.background_asset_id AS backgroundAssetId,
              c.background_settings AS backgroundSettings,
              a.content_hash AS assetContentHash,
              a.mime_type AS assetMimeType,
              a.width AS assetWidth, a.height AS assetHeight
       FROM canvas c
       LEFT JOIN asset a ON a.id = c.background_asset_id
         AND a.lifecycle_state = 'active'
       LEFT JOIN node cn ON cn.id = c.node_id
       WHERE c.id = ? AND c.project_id = ? AND c.lifecycle_state = 'active'
         AND (cn.id IS NULL OR cn.lifecycle_state = 'active')`,
      canvasId,
      ctx.projectId,
    )
    // §9.6: a board whose OWNER node is trashed is excluded from
    // ordinary rendering exactly like a directly-trashed board — the
    // owning node join above refuses it. canvas.node_id is NOT NULL
    // and FK-backed, and the root node is trigger-protected against
    // trashing (migration 0001), so the root canvas always passes.
    if (!canvas) return null
    const placements = ctx.db.all<Record<string, unknown>>(
      `SELECT p.id, p.node_id AS nodeId, p.x, p.y, p.width, p.height, p.scale,
              p.rotation, p.flip_x AS flipX, p.flip_y AS flipY,
              p.render_order AS renderOrder, p.label_visible AS labelVisible,
              p.caption, p.locked,
              ${NODE_APPEARANCE_SELECT},
              note.title AS noteTitle,
              note.id AS noteId,
              CASE WHEN n.appearance_kind = 'card'
                   THEN substr(note.body, 1, 140) END AS noteExcerpt,
              child.id AS childCanvasId,
              a.content_hash AS assetContentHash,
              a.mime_type AS assetMimeType,
              a.width AS assetWidth, a.height AS assetHeight
       FROM placement p
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id
         AND child.lifecycle_state = 'active'
       LEFT JOIN asset a ON a.id = n.appearance_asset_id
         AND a.lifecycle_state = 'active'
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
      ...placements.map((p) => {
        const item = { ...p, itemKind: 'placement' } as CanvasContentItem
        // §4.6 card: fixed chrome has an intrinsic size the way an
        // image has natural dimensions; unsized placements read the
        // default here so the hit box IS the card rect (AI-IMP-084).
        if (p['appearanceKind'] === 'card') {
          item['width'] = p['width'] ?? CARD_DEFAULT_WIDTH
          item['height'] = p['height'] ?? CARD_DEFAULT_HEIGHT
        }
        return item
      }),
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
    const scene: CanvasScene = {
      canvasId: canvas.id,
      nodeId: canvas.nodeId,
      camera: JSON.parse(canvas.camera) as CanvasScene['camera'],
      background: {
        color: canvas.backgroundColor,
        assetId: canvas.assetContentHash === null ? null : canvas.backgroundAssetId,
        assetContentHash: canvas.assetContentHash,
        assetMimeType: canvas.assetMimeType,
        assetWidth: canvas.assetContentHash === null ? null : canvas.assetWidth,
        assetHeight: canvas.assetContentHash === null ? null : canvas.assetHeight,
        settings:
          canvas.assetContentHash !== null && canvas.backgroundSettings !== null
            ? (JSON.parse(canvas.backgroundSettings) as Record<string, unknown>)
            : null,
      },
      items,
    }
    return scene
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
        assetContentHash: string | null
        assetFilename: string | null
        childCanvasId: string | null
        boardChildCount: number
      }
    >(
      `SELECT n.id, n.note_id AS noteId, ${NODE_APPEARANCE_SELECT},
              note.title AS noteTitle,
              asset.content_hash AS assetContentHash,
              asset.original_filename AS assetFilename,
              child.id AS childCanvasId,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                AS boardChildCount,
              (SELECT count(*) FROM placement p
                JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
                ${usableCanvasOwnerJoin('c', 'co')}
                WHERE p.node_id = n.id AND p.lifecycle_state = 'active')
                AS placementCount
       FROM node n
       LEFT JOIN note ON note.id = n.note_id
         AND note.lifecycle_state = 'active'
       LEFT JOIN asset ON asset.id = n.appearance_asset_id
         AND asset.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id
         AND child.lifecycle_state = 'active'
       WHERE n.project_id = ? AND n.lifecycle_state = 'active'
       ORDER BY n.id`,
      ctx.projectId,
    )
    const filtered = filter === 'unplaced' ? rows.filter((r) => r.placementCount === 0) : rows
    return filtered.map((row) => ({
      ...row,
      displayLabel: nodeDisplayLabel({ ...row, isRoot: row.id === ctx.rootNodeId }),
      tags: tagNamesFor(ctx, row.id),
    }))

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

  // §4.8: flat project tag vocabulary — pickers (Create Pin dialog,
  // tag assignment UI) list every active tag with usage counts.
  // §8.4: the charm bar's # pops the node's tag chips.
  registry.register('listNodeTags', (ctx, args) => {
    const { nodeId } = args as { nodeId: string }
    return ctx.db.all(
      `SELECT t.id, t.name, t.color, t.icon
       FROM tag_assignment ta
       JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
       WHERE ta.node_id = ? AND t.project_id = ?
       ORDER BY t.name_key`,
      nodeId,
      ctx.projectId,
    )
  })

  registry.register('listTags', (ctx) =>
    ctx.db.all(
      `SELECT t.id, t.name, t.color, t.icon,
              (SELECT count(*) FROM tag_assignment ta
                JOIN node n ON n.id = ta.node_id AND n.lifecycle_state = 'active'
                WHERE ta.tag_id = t.id) AS nodeCount
       FROM tag t
       WHERE t.project_id = ? AND t.lifecycle_state = 'active'
       ORDER BY t.name_key`,
      ctx.projectId,
    ),
  )

  // §4.8: activating a tag opens a data view of nodes carrying it.
  // AI-IMP-071: each carrier also lists its active placement
  // locations (one batch query, grouped in JS) so the tag panel can
  // print locations and drive fly-to without N+1 renderer queries.
  registry.register('getTagView', (ctx, args) => {
    const { tagId } = args as { tagId: string }
    const tag = ctx.db.get<{ id: string; name: string; color: string | null; icon: string | null }>(
      `SELECT id, name, color, icon FROM tag
       WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
      tagId,
      ctx.projectId,
    )
    if (!tag) return null
    const locations = ctx.db.all<{
      nodeId: string
      placementId: string
      canvasId: string
      canvasNodeId: string
      canvasNoteTitle: string | null
      isRoot: number
    }>(
      `SELECT p.node_id AS nodeId, p.id AS placementId,
              p.canvas_id AS canvasId, c.node_id AS canvasNodeId,
              cnote.title AS canvasNoteTitle,
              CASE WHEN c.node_id = pr.root_node_id THEN 1 ELSE 0 END
                AS isRoot
       FROM placement p
       JOIN tag_assignment ta ON ta.node_id = p.node_id AND ta.tag_id = ?
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
       JOIN project pr ON pr.id = c.project_id
       ${usableCanvasOwnerJoin('c', 'cn')}
       LEFT JOIN note cnote ON cnote.id = cn.note_id
         AND cnote.lifecycle_state = 'active'
       WHERE p.lifecycle_state = 'active'
       ORDER BY p.node_id, p.id`,
      tagId,
    )
    const canvasLabels = readLiveCanvasDisplayLabels(
      ctx,
      locations.map((row) => row.canvasId),
    )
    const placementsByNode = new Map<string, TagViewPlacement[]>()
    for (const row of locations) {
      const canvasLabel = canvasLabels.get(row.canvasId)
      if (!canvasLabel) throw new Error(`live tag location lost canvas ${row.canvasId}`)
      const entry: TagViewPlacement = {
        placementId: row.placementId,
        canvasId: row.canvasId,
        canvasLabel,
      }
      const list = placementsByNode.get(row.nodeId)
      if (list) list.push(entry)
      else placementsByNode.set(row.nodeId, [entry])
    }
    const nodes: TagViewNode[] = ctx.db
      .all<
        NodeAppearanceColumns & {
          id: string
          noteId: string | null
          noteTitle: string | null
          childCanvasId: string | null
          assetFilename: string | null
          boardChildCount: number
          placementCount: number
        }
      >(
        `SELECT n.id, ${NODE_APPEARANCE_SELECT},
                note.id AS noteId,
                note.title AS noteTitle,
                child.id AS childCanvasId,
                asset.original_filename AS assetFilename,
                (SELECT count(*) FROM placement cp
                  JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                  WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                  AS boardChildCount,
                (SELECT count(*) FROM placement p
                  JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
                  ${usableCanvasOwnerJoin('c', 'co')}
                  WHERE p.node_id = n.id AND p.lifecycle_state = 'active')
                  AS placementCount
         FROM node n
         JOIN tag_assignment ta ON ta.node_id = n.id
         LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
         LEFT JOIN canvas child ON child.node_id = n.id
           AND child.lifecycle_state = 'active'
         LEFT JOIN asset ON asset.id = n.appearance_asset_id
           AND asset.lifecycle_state = 'active'
         WHERE ta.tag_id = ? AND n.lifecycle_state = 'active'
         ORDER BY n.id`,
        tagId,
      )
      .map((node) => ({
        ...node,
        displayLabel: nodeDisplayLabel({ ...node, isRoot: node.id === ctx.rootNodeId }),
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
        placements: placementsByNode.get(node.id) ?? [],
      }))
    return { tag, nodes }
  })

  // §8.3 (AI-IMP-073): one node's active placement locations, for
  // surfaces that navigate to a node they only know by id — the ⌕
  // panel's asset rows ("filename match surfaces the nodes using that
  // asset"). Same label conventions as the tag view: node label is
  // the note title else the short code, canvas labels read the owning
  // node's title (root reads "Home"). Unplaced is a legitimate state
  // (empty placements), not an error; a non-active node is null.
  registry.register('getNodeLocations', (ctx, args): NodeLocations | null => {
    const { nodeId } = args as { nodeId: string }
    const node = ctx.db.get<
      NodeAppearanceColumns & {
        id: string
        noteId: string | null
        noteTitle: string | null
        childCanvasId: string | null
        assetFilename: string | null
        boardChildCount: number
      }
    >(
      `SELECT n.id, ${NODE_APPEARANCE_SELECT},
              note.id AS noteId, note.title AS noteTitle,
              child.id AS childCanvasId,
              asset.original_filename AS assetFilename,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                AS boardChildCount
       FROM node n
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id AND child.lifecycle_state = 'active'
       LEFT JOIN asset ON asset.id = n.appearance_asset_id AND asset.lifecycle_state = 'active'
       WHERE n.id = ? AND n.project_id = ? AND n.lifecycle_state = 'active'`,
      nodeId,
      ctx.projectId,
    )
    if (!node) return null
    const locationRows = ctx.db.all<{
        placementId: string
        canvasId: string
        canvasNodeId: string
        canvasNoteTitle: string | null
        isRoot: number
      }>(
        `SELECT p.id AS placementId, p.canvas_id AS canvasId,
                c.node_id AS canvasNodeId, cnote.title AS canvasNoteTitle,
                CASE WHEN c.node_id = pr.root_node_id THEN 1 ELSE 0 END
                  AS isRoot
         FROM placement p
         JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
         JOIN project pr ON pr.id = c.project_id
         ${usableCanvasOwnerJoin('c', 'cn')}
         LEFT JOIN note cnote ON cnote.id = cn.note_id
           AND cnote.lifecycle_state = 'active'
         WHERE p.node_id = ? AND p.lifecycle_state = 'active'
         ORDER BY p.id`,
        nodeId,
      )
    const canvasLabels = readLiveCanvasDisplayLabels(
      ctx,
      locationRows.map((row) => row.canvasId),
    )
    const placements = locationRows.map((row) => {
      const canvasLabel = canvasLabels.get(row.canvasId)
      if (!canvasLabel) throw new Error(`live node location lost canvas ${row.canvasId}`)
      return {
        placementId: row.placementId,
        canvasId: row.canvasId,
        canvasLabel,
      }
    })
    return {
      nodeId: node.id,
      label: nodeDisplayLabel({ ...node, isRoot: node.id === ctx.rootNodeId }),
      appearanceKind: node.appearanceKind,
      appearanceColor: node.appearanceColor,
      appearanceIcon: node.appearanceIcon,
      noteId: node.noteId,
      placements,
    }
  })

  // §8.1 (AI-IMP-061): the bookmark menu's one read model — every
  // bookmark in menu order (row order IS the Mod+1–n binding) with
  // its target's degradation state joined in, so trashed targets grey
  // out and purged targets present broken WITHOUT an N+1 sweep.
  // LEFT JOIN because bookmarks have no FK: a missing canvas row IS
  // the purged state, never a silent vanish.
  // §9.6: a bookmark to a board whose OWNER node is trashed degrades
  // to In Trash just like a directly-trashed canvas — LEFT JOIN the
  // owning node so a trashed owner flips targetState, and carry
  // `trashedKind`/`ownerNodeId` so Restore targets the aggregate root
  // (the node) rather than issuing a canvas restore that cannot revive
  // a trashed owner.
  registry.register('listBookmarks', (ctx): BookmarkListRow[] => {
    const rows = ctx.db.all<Omit<BookmarkListRow, 'viewport'> & { viewport: string | null }>(
        `SELECT b.id, b.target_kind AS targetKind, b.canvas_id AS canvasId,
                b.label, b.viewport, b.sort_key AS sortKey,
                c.node_id AS ownerNodeId,
                CASE
                  WHEN c.id IS NULL THEN 'purged'
                  WHEN c.lifecycle_state = 'trashed' THEN 'trashed'
                  WHEN cn.lifecycle_state = 'trashed' THEN 'trashed'
                  ELSE 'active'
                END AS targetState,
                CASE
                  WHEN c.id IS NULL THEN NULL
                  WHEN c.lifecycle_state = 'trashed' THEN 'canvas'
                  WHEN cn.lifecycle_state = 'trashed' THEN 'node'
                  ELSE NULL
                END AS trashedKind
         FROM bookmark b
         LEFT JOIN canvas c ON c.id = b.canvas_id
         LEFT JOIN node cn ON cn.id = c.node_id
         WHERE b.project_id = ?
         ORDER BY b.sort_key, b.id`,
        ctx.projectId,
      )
    const liveLabels = readLiveCanvasDisplayLabels(
      ctx,
      rows.filter((row) => row.targetState === 'active').map((row) => row.canvasId),
    )
    return rows.map((row) => {
      const liveLabel = liveLabels.get(row.canvasId)
      if (row.targetState === 'active' && !liveLabel) {
        throw new Error(`active bookmark lost canvas display label ${row.canvasId}`)
      }
      return {
        ...row,
        // Persisted text is historical recovery context only. A live
        // target always resolves through the canonical naming seam.
        label: liveLabel ?? row.label,
        viewport:
          row.viewport === null
            ? null
            : (JSON.parse(row.viewport) as BookmarkListRow['viewport']),
      }
    })
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

  // §14.1 (AI-IMP-069): the outline projection — every active canvas
  // with its child placements, flat. Containment is a graph with
  // legal cycles (invariant 19), so the TREE is assembled by the
  // view with a visited set per expansion path; this query never
  // recurses. Labels follow the quick-open convention: owning
  // node's note title, else the node's short code.
  registry.register('getOutlineTree', (ctx): OutlineCanvasRow[] => {
    const canvases = ctx.db.all<{
      canvasId: string
      nodeId: string
      noteTitle: string | null
      rootNodeId: string
      ownerPlacements: number
      childCount: number
    }>(
      `SELECT c.id AS canvasId, n.id AS nodeId,
              note.title AS noteTitle,
              pr.root_node_id AS rootNodeId,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = c.id AND cp.lifecycle_state = 'active')
                AS childCount,
              (SELECT count(*) FROM placement p
                JOIN canvas pc ON pc.id = p.canvas_id AND pc.lifecycle_state = 'active'
                ${usableCanvasOwnerJoin('pc', 'pco')}
                WHERE p.node_id = n.id AND p.lifecycle_state = 'active')
                AS ownerPlacements
       FROM canvas c
       JOIN node n ON n.id = c.node_id AND n.lifecycle_state = 'active'
       JOIN project pr ON pr.id = c.project_id
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       WHERE c.project_id = ? AND c.lifecycle_state = 'active'`,
      ctx.projectId,
    )
    const children = ctx.db.all<
      NodeAppearanceColumns & {
        canvasId: string
        placementId: string
        caption: string | null
        nodeId: string
        renderOrder: number
        noteId: string | null
        noteTitle: string | null
        childCanvasId: string | null
        placementCount: number
        assetContentHash: string | null
        assetFilename: string | null
        boardChildCount: number
      }
    >(
      `SELECT p.canvas_id AS canvasId, p.id AS placementId,
              p.caption AS caption, n.id AS nodeId,
              p.render_order AS renderOrder, ${NODE_APPEARANCE_SELECT},
              note.id AS noteId, note.title AS noteTitle,
              child.id AS childCanvasId,
              asset.content_hash AS assetContentHash,
              asset.original_filename AS assetFilename,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                AS boardChildCount,
              (SELECT count(*) FROM placement p2
                JOIN canvas pc ON pc.id = p2.canvas_id AND pc.lifecycle_state = 'active'
                ${usableCanvasOwnerJoin('pc', 'pco')}
                WHERE p2.node_id = n.id AND p2.lifecycle_state = 'active')
                AS placementCount
       FROM placement p
       JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id AND child.lifecycle_state = 'active'
       LEFT JOIN asset ON asset.id = n.appearance_asset_id
         AND asset.lifecycle_state = 'active'
       WHERE p.project_id = ? AND p.lifecycle_state = 'active'
       ORDER BY p.canvas_id, p.render_order, p.id`,
      ctx.projectId,
    )
    const tags = ctx.db.all<{ nodeId: string; name: string }>(
      `SELECT ta.node_id AS nodeId, t.name
       FROM tag_assignment ta
       JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
       JOIN node n ON n.id = ta.node_id AND n.lifecycle_state = 'active'
       WHERE t.project_id = ?
       ORDER BY t.name_key`,
      ctx.projectId,
    )
    const tagsByNode = new Map<string, string[]>()
    for (const row of tags) {
      const list = tagsByNode.get(row.nodeId)
      if (list) list.push(row.name)
      else tagsByNode.set(row.nodeId, [row.name])
    }
    const byCanvas = new Map<string, OutlineChildRow[]>()
    for (const row of children) {
      const { canvasId, ...child } = row
      const entry: OutlineChildRow = { ...child, tags: tagsByNode.get(row.nodeId) ?? [] }
      const list = byCanvas.get(canvasId)
      if (list) list.push(entry)
      else byCanvas.set(canvasId, [entry])
    }
    return canvases
      .map((row) => ({
        canvasId: row.canvasId,
        nodeId: row.nodeId,
        label: canvasDisplayLabel({
          isRoot: row.nodeId === row.rootNodeId,
          noteTitle: row.noteTitle,
          childCount: row.childCount,
        }),
        isRoot: row.nodeId === row.rootNodeId,
        // A canvas whose owning node has no active placement cannot
        // appear as any board's child — it surfaces at root level.
        isRootLevel: row.nodeId === row.rootNodeId || row.ownerPlacements === 0,
        childCount: row.childCount,
        children: byCanvas.get(row.canvasId) ?? [],
      }))
      .sort((a, b) =>
        a.isRoot !== b.isRoot
          ? a.isRoot
            ? -1
            : 1
          : a.label.toLowerCase() < b.label.toLowerCase()
            ? -1
            : a.label.toLowerCase() > b.label.toLowerCase()
              ? 1
              : a.canvasId < b.canvasId
                ? -1
                : 1,
      )
  })

  // EPIC-028: one renderer query per selected row. The target is
  // discriminated because the loose bin contains note identities that
  // deliberately have no node identity (§14.1).
  registry.register('getOutlinePreview', (ctx, args): OutlinePreview | null => {
    const target = args as OutlinePreviewTarget
    if (target.kind === 'note') {
      const note = ctx.db.get<{
        noteId: string
        noteTitle: string
        noteExcerpt: string
      }>(
        `SELECT id AS noteId, title AS noteTitle, substr(body, 1, 240) AS noteExcerpt
         FROM note
         WHERE id = ? AND project_id = ? AND lifecycle_state = 'active'`,
        target.noteId,
        ctx.projectId,
      )
      if (!note) return null
      return {
        targetKind: 'note',
        nodeId: null,
        ...note,
        appearanceKind: null,
        appearanceColor: null,
        appearanceIcon: null,
        assetContentHash: null,
        assetFilename: null,
        childCanvasId: null,
        childCount: 0,
        placementCount: 0,
        tags: [],
        places: [],
      }
    }

    const node = ctx.db.get<
      NodeAppearanceColumns & {
        nodeId: string
        noteId: string | null
        noteTitle: string | null
        noteExcerpt: string | null
        assetContentHash: string | null
        assetFilename: string | null
        childCanvasId: string | null
        childCount: number
      }
    >(
      `SELECT n.id AS nodeId, note.id AS noteId,
              note.title AS noteTitle, substr(note.body, 1, 240) AS noteExcerpt,
              ${NODE_APPEARANCE_SELECT},
              asset.content_hash AS assetContentHash,
              asset.original_filename AS assetFilename,
              child.id AS childCanvasId,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                AS childCount
       FROM node n
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       LEFT JOIN asset ON asset.id = n.appearance_asset_id
         AND asset.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id
         AND child.lifecycle_state = 'active'
       WHERE n.id = ? AND n.project_id = ? AND n.lifecycle_state = 'active'`,
      target.nodeId,
      ctx.projectId,
    )
    if (!node) return null
    const placeRows = ctx.db.all<Omit<OutlinePlace, 'canvasLabel'> & { renderOrder: number }>(
      `SELECT p.id AS placementId, c.id AS canvasId, p.render_order AS renderOrder
       FROM placement p
       JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
       ${usableCanvasOwnerJoin('c', 'owner')}
       WHERE p.node_id = ? AND p.lifecycle_state = 'active'
       ORDER BY c.id, p.render_order, p.id`,
      target.nodeId,
    )
    const placeLabels = readLiveCanvasDisplayLabels(
      ctx,
      placeRows.map((place) => place.canvasId),
    )
    const places = placeRows
      .map((place) => {
        const canvasLabel = placeLabels.get(place.canvasId)
        if (!canvasLabel) throw new Error(`outline preview lost canvas ${place.canvasId}`)
        return { ...place, canvasLabel }
      })
      .sort((a, b) =>
        a.canvasLabel.toLocaleLowerCase().localeCompare(b.canvasLabel.toLocaleLowerCase()) ||
        a.canvasId.localeCompare(b.canvasId) ||
        a.renderOrder - b.renderOrder ||
        a.placementId.localeCompare(b.placementId),
      )
      .map(({ placementId, canvasId, canvasLabel }): OutlinePlace => ({
        placementId,
        canvasId,
        canvasLabel,
      }))
    const tags = ctx.db
      .all<{ name: string }>(
        `SELECT t.name FROM tag_assignment ta
         JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
         WHERE ta.node_id = ? AND t.project_id = ?
         ORDER BY t.name_key`,
        target.nodeId,
        ctx.projectId,
      )
      .map((tag) => tag.name)
    return {
      targetKind: 'node',
      nodeId: node.nodeId,
      noteId: node.noteId,
      noteTitle: node.noteTitle,
      noteExcerpt: node.noteExcerpt,
      appearanceKind: node.appearanceKind,
      appearanceColor: node.appearanceColor,
      appearanceIcon: node.appearanceIcon,
      assetContentHash: node.assetContentHash,
      assetFilename: node.assetFilename,
      childCanvasId: node.childCanvasId,
      childCount: node.childCount,
      placementCount: places.length,
      tags,
      places,
    }
  })

  registry.register('getOutlineFacetCounts', (ctx): OutlineFacetCounts => {
    const row = ctx.db.get<OutlineFacetCounts>(
      `WITH active_nodes AS (
         SELECT n.id, note.id AS noteId,
                EXISTS (
                  SELECT 1 FROM placement p
                  JOIN canvas c ON c.id = p.canvas_id AND c.lifecycle_state = 'active'
                  ${usableCanvasOwnerJoin('c', 'co')}
                  WHERE p.node_id = n.id AND p.lifecycle_state = 'active'
                ) AS hasPlacement,
                EXISTS (
                  SELECT 1 FROM canvas child
                  WHERE child.node_id = n.id AND child.lifecycle_state = 'active'
                ) AS hasCanvas,
                EXISTS (
                  SELECT 1 FROM tag_assignment ta
                  JOIN tag t ON t.id = ta.tag_id AND t.lifecycle_state = 'active'
                  WHERE ta.node_id = n.id
                ) AS hasTag
         FROM node n
         LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
         WHERE n.project_id = ? AND n.lifecycle_state = 'active' AND n.id <> ?
       ), loose_notes AS (
         SELECT note.id FROM note
         WHERE note.project_id = ? AND note.lifecycle_state = 'active'
           AND NOT EXISTS (SELECT 1 FROM node n
             WHERE n.note_id = note.id AND n.lifecycle_state = 'active')
       )
       SELECT
         (SELECT count(*) FROM active_nodes) + (SELECT count(*) FROM loose_notes) AS "all",
         (SELECT count(*) FROM active_nodes WHERE NOT hasPlacement) +
           (SELECT count(*) FROM loose_notes) AS unplaced,
         (SELECT count(*) FROM active_nodes WHERE noteId IS NULL) AS orphans,
         (SELECT count(*) FROM active_nodes WHERE NOT hasPlacement OR noteId IS NULL) +
           (SELECT count(*) FROM loose_notes) AS disconnected,
         (SELECT count(*) FROM active_nodes
           WHERE NOT hasCanvas AND NOT hasTag) AS untagged`,
      ctx.projectId,
      ctx.rootNodeId,
      ctx.projectId,
    )
    return row ?? { all: 0, unplaced: 0, orphans: 0, disconnected: 0, untagged: 0 }
  })

  registry.register('getBoardFilmstrip', (ctx, args): BoardFilmstrip | null => {
    const { canvasId, limit: requestedLimit } = args as { canvasId: string; limit?: number }
    const canvas = ctx.db.get<{ id: string }>(
      `SELECT c.id FROM canvas c
       ${usableCanvasOwnerJoin('c', 'owner')}
       WHERE c.id = ? AND c.project_id = ? AND c.lifecycle_state = 'active'`,
      canvasId,
      ctx.projectId,
    )
    if (!canvas) return null
    const numericLimit = requestedLimit === undefined ? 5 : Math.trunc(requestedLimit)
    const limit = Number.isFinite(numericLimit) ? Math.max(1, Math.min(5, numericLimit)) : 5
    const rows = ctx.db.all<
      NodeAppearanceColumns & {
        placementId: string
        nodeId: string
        renderOrder: number
        noteTitle: string | null
        childCanvasId: string | null
        childCount: number
        contentHash: string | null
        filename: string | null
        thumbnailReady: number
      }
    >(
      `SELECT p.id AS placementId, n.id AS nodeId, p.render_order AS renderOrder,
              ${NODE_APPEARANCE_SELECT},
              note.title AS noteTitle,
              child.id AS childCanvasId,
              (SELECT count(*) FROM placement cp
                JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
                WHERE cp.canvas_id = child.id AND cp.lifecycle_state = 'active')
                AS childCount,
              asset.content_hash AS contentHash,
              asset.original_filename AS filename,
              EXISTS (
                SELECT 1 FROM derivative_jobs j
                JOIN asset ja ON ja.id = j.asset_id
                WHERE ja.content_hash = asset.content_hash
                  AND j.kind = 'thumbnail' AND j.state = 'done'
                  AND NOT EXISTS (
                    SELECT 1 FROM derivative_jobs pending
                    JOIN asset pa ON pa.id = pending.asset_id
                    WHERE pa.content_hash = asset.content_hash
                      AND pending.kind = 'thumbnail' AND pending.state = 'queued'
                  )
              ) AS thumbnailReady
       FROM placement p
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       LEFT JOIN note ON note.id = n.note_id AND note.lifecycle_state = 'active'
       LEFT JOIN canvas child ON child.node_id = n.id AND child.lifecycle_state = 'active'
       LEFT JOIN asset ON asset.id = n.appearance_asset_id
         AND asset.lifecycle_state = 'active'
       WHERE p.canvas_id = ? AND p.lifecycle_state = 'active'
       ORDER BY p.render_order, p.id`,
      canvasId,
    )
    const items: BoardFilmstripItem[] = rows.slice(0, limit).map((row) => {
      const appearanceKind = row.childCanvasId
        ? 'board'
        : row.appearanceKind === 'card' || row.appearanceKind === 'icon' || row.appearanceKind === 'image'
          ? row.appearanceKind
          : 'dot'
      const label = nodeDisplayLabel({
        isRoot: row.nodeId === ctx.rootNodeId,
        noteTitle: row.noteTitle,
        childCanvasId: row.childCanvasId,
        boardChildCount: row.childCount,
        assetFilename: appearanceKind === 'image' ? row.filename : null,
      })
      return row.appearanceKind === 'image' && row.contentHash !== null && row.filename !== null
        ? ({
            kind: 'image',
            placementId: row.placementId,
            nodeId: row.nodeId,
            renderOrder: row.renderOrder,
            label,
            contentHash: row.contentHash,
            filename: row.filename,
            thumbnailReady: row.thumbnailReady === 1,
          } satisfies BoardFilmstripItem)
        : ({
            kind: 'glyph',
            placementId: row.placementId,
            nodeId: row.nodeId,
            renderOrder: row.renderOrder,
            label,
            appearanceKind,
            appearanceColor: row.appearanceColor,
            appearanceIcon: row.appearanceIcon,
          } satisfies BoardFilmstripItem)
    })
    return {
      canvasId,
      items,
      totalCount: rows.length,
      remainderCount: Math.max(0, rows.length - items.length),
    }
  })

  // §14.1 (AI-IMP-069): loose NOTES for the outline's root bin —
  // active notes attached to no active node. Notes riding an
  // unplaced node surface through listNodeLibrary's unplaced filter
  // instead; counting them here would list them twice.
  registry.register('listLooseNotes', (ctx): LooseNoteRow[] =>
    ctx.db.all<LooseNoteRow>(
      `SELECT note.id, note.title
       FROM note
       WHERE note.project_id = ? AND note.lifecycle_state = 'active'
         AND NOT EXISTS (SELECT 1 FROM node n
           WHERE n.note_id = note.id AND n.lifecycle_state = 'active')
       ORDER BY note.title_key, note.id`,
      ctx.projectId,
    ),
  )
}
