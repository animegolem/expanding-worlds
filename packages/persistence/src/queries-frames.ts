import type { QueryRegistry } from './queries'

/**
 * Frame read models (RFC-0001 §4.9 rev 0.38/0.54, EPIC-017 /
 * AI-IMP-126). The single read model for the renderer's frame
 * adornments, the future outline/data-view grouping surfaces, and the
 * command-composition layer's "move a frame carries its members"
 * batch. Membership is the recorded frame_member relation, never
 * inferred from geometry.
 *
 * Both queries reflect ACTIVE placements with ACTIVE nodes only: a
 * trashed frame drops out (its region stops rendering) while its
 * membership rows survive for restore (§9.6), and a trashed member
 * drops from the grouping exactly as it drops from the scene. Every
 * traversal carries a visited set (invariant 19) even though the
 * capture handler forbids cycles structurally.
 */

/** One node in the frame membership tree. */
export interface FrameTreeNode {
  placementId: string
  nodeId: string
  /** True when this placement's node has the 'frame' appearance. */
  isFrame: boolean
  /** 0 for a top-level frame; its direct members are 1, and so on. */
  depth: number
  /** Direct members; empty unless isFrame. */
  members: FrameTreeNode[]
}

export interface FrameTree {
  canvasId: string
  /** Top-level frames — frames not themselves captured by a frame. */
  roots: FrameTreeNode[]
}

export interface FrameTransitiveMembers {
  framePlacementId: string
  /** Every descendant member placement id, frames and items alike. */
  memberPlacementIds: string[]
}

interface FrameRow {
  placementId: string
  nodeId: string
}

interface MembershipRow {
  memberPlacementId: string
  framePlacementId: string
  memberNodeId: string
}

export function registerFrameQueries(registry: QueryRegistry): void {
  registry.register('getFrameTree', (ctx, args): FrameTree => {
    const { canvasId } = args as { canvasId: string }

    const frames = ctx.db.all<FrameRow>(
      `SELECT p.id AS placementId, p.node_id AS nodeId
       FROM placement p
       JOIN node n ON n.id = p.node_id AND n.lifecycle_state = 'active'
       WHERE p.canvas_id = ? AND p.project_id = ? AND p.lifecycle_state = 'active'
         AND n.appearance_kind = 'frame'`,
      canvasId,
      ctx.projectId,
    )
    const frameIds = new Set(frames.map((f) => f.placementId))

    const memberships = ctx.db.all<MembershipRow>(
      `SELECT fm.member_placement_id AS memberPlacementId,
              fm.frame_placement_id AS framePlacementId,
              mp.node_id AS memberNodeId
       FROM frame_member fm
       JOIN placement mp ON mp.id = fm.member_placement_id
         AND mp.lifecycle_state = 'active'
       JOIN node mn ON mn.id = mp.node_id AND mn.lifecycle_state = 'active'
       JOIN placement fp ON fp.id = fm.frame_placement_id
         AND fp.lifecycle_state = 'active'
       JOIN node fn ON fn.id = fp.node_id AND fn.lifecycle_state = 'active'
         AND fn.appearance_kind = 'frame'
       WHERE fm.project_id = ? AND mp.canvas_id = ?`,
      ctx.projectId,
      canvasId,
    )
    const membersByFrame = new Map<string, MembershipRow[]>()
    const capturedIds = new Set<string>()
    for (const m of memberships) {
      capturedIds.add(m.memberPlacementId)
      const list = membersByFrame.get(m.framePlacementId)
      if (list) list.push(m)
      else membersByFrame.set(m.framePlacementId, [m])
    }

    const build = (
      placementId: string,
      nodeId: string,
      isFrame: boolean,
      depth: number,
      visited: Set<string>,
    ): FrameTreeNode => {
      const node: FrameTreeNode = { placementId, nodeId, isFrame, depth, members: [] }
      if (!isFrame || visited.has(placementId)) return node
      visited.add(placementId)
      const rows = membersByFrame.get(placementId) ?? []
      for (const row of rows) {
        node.members.push(
          build(
            row.memberPlacementId,
            row.memberNodeId,
            frameIds.has(row.memberPlacementId),
            depth + 1,
            visited,
          ),
        )
      }
      return node
    }

    const roots = frames
      .filter((f) => !capturedIds.has(f.placementId))
      .map((f) => build(f.placementId, f.nodeId, true, 0, new Set<string>()))

    return { canvasId, roots }
  })

  // The move batch feed: every descendant member placement of a frame,
  // flattened (the renderer moves the frame + this set as one command,
  // one undo entry — AI-IMP-127). Deterministic order.
  registry.register('getFrameTransitiveMembers', (ctx, args): FrameTransitiveMembers => {
    const { framePlacementId } = args as { framePlacementId: string }
    const out: string[] = []
    const visited = new Set<string>([framePlacementId])
    const stack = [framePlacementId]
    while (stack.length > 0) {
      const current = stack.pop()!
      const rows = ctx.db.all<{ memberPlacementId: string }>(
        `SELECT fm.member_placement_id AS memberPlacementId
         FROM frame_member fm
         JOIN placement mp ON mp.id = fm.member_placement_id
           AND mp.lifecycle_state = 'active'
         JOIN node mn ON mn.id = mp.node_id AND mn.lifecycle_state = 'active'
         WHERE fm.frame_placement_id = ? AND fm.project_id = ?
         ORDER BY fm.member_placement_id`,
        current,
        ctx.projectId,
      )
      for (const row of rows) {
        if (visited.has(row.memberPlacementId)) continue
        visited.add(row.memberPlacementId)
        out.push(row.memberPlacementId)
        stack.push(row.memberPlacementId)
      }
    }
    out.sort()
    return { framePlacementId, memberPlacementIds: out }
  })
}
