import { placementSize } from './hit-test'
import type { Point } from './camera'
import type { ScenePlacement } from './types'

/**
 * Frame containment + membership indexing (RFC-0001 §4.9, EPIC-017 /
 * AI-IMP-127). Pure and renderer-agnostic: the host feeds current
 * frame geometry and the membership tree (from persistence's
 * getFrameTree), and these functions answer "which frame does this
 * drop land in" and "what does this frame contain" without touching
 * the DOM, Pixi, or the database.
 *
 * Membership is the RECORDED relation, never geometry — geometry only
 * decides where a DRAG lands (capture/release), per §4.9's
 * geometry-immunity rule. Depth is the membership depth (0 = a
 * top-level frame), so "innermost" means deepest in the tree, not
 * smallest on screen.
 */

/** A frame placement plus its membership depth (0 = top-level). */
export interface FrameCandidate {
  placement: ScenePlacement
  /** Membership depth: 0 for a top-level frame, deeper when nested. */
  depth: number
}

/**
 * True when `point` lies within the frame placement's rotated body
 * rect. Mirrors hit-test's pointInPlacement (center-origin body,
 * rotation about the center) so containment agrees with what the user
 * sees and can select.
 */
export function pointInFrameBody(point: Point, frame: ScenePlacement): boolean {
  const { width, height } = placementSize(frame)
  const dx = point.x - frame.x
  const dy = point.y - frame.y
  const cos = Math.cos(-frame.rotation)
  const sin = Math.sin(-frame.rotation)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2
}

function bodyArea(frame: ScenePlacement): number {
  const { width, height } = placementSize(frame)
  return width * height
}

/**
 * §4.9: the INNERMOST frame whose body contains `point`. "Innermost"
 * is the greatest membership depth; ties at equal depth break by
 * smaller body area, then by placement id, so nested overlaps resolve
 * deterministically. Returns null when no candidate contains the
 * point.
 */
export function innermostFrameAt(
  point: Point,
  candidates: readonly FrameCandidate[],
): string | null {
  let best: FrameCandidate | null = null
  for (const candidate of candidates) {
    if (!pointInFrameBody(point, candidate.placement)) continue
    if (best === null) {
      best = candidate
      continue
    }
    if (candidate.depth > best.depth) {
      best = candidate
      continue
    }
    if (candidate.depth === best.depth) {
      const a = bodyArea(candidate.placement)
      const b = bodyArea(best.placement)
      if (a < b || (a === b && candidate.placement.id < best.placement.id)) {
        best = candidate
      }
    }
  }
  return best?.placement.id ?? null
}

// ------------------------------------------------------- membership index

/** The minimal FrameTree node shape (persistence's getFrameTree). */
export interface FrameTreeNodeLike {
  placementId: string
  isFrame: boolean
  depth: number
  members: FrameTreeNodeLike[]
}

/** Flattened membership lookups over a frame tree. */
export interface FrameIndex {
  /** True when the placement is a frame appearance. */
  isFrame(placementId: string): boolean
  /** The frame this placement is captured in, or null. */
  parentOf(placementId: string): string | null
  /** Membership depth of a frame (0 = top-level); 0 if unknown. */
  depthOf(framePlacementId: string): number
  /** Every descendant member placement id (frames and items alike). */
  transitiveMembers(framePlacementId: string): string[]
  /** Ids of every frame placement in the tree. */
  frameIds(): string[]
}

/**
 * Flatten a getFrameTree result into O(1) membership lookups. A single
 * pass records each frame's depth, each member's parent, and each
 * frame's direct children; transitive members are computed lazily.
 */
export function indexFrameTree(roots: readonly FrameTreeNodeLike[]): FrameIndex {
  const frames = new Set<string>()
  const parent = new Map<string, string>()
  const depth = new Map<string, number>()
  const directChildren = new Map<string, string[]>()

  const walk = (node: FrameTreeNodeLike, parentId: string | null): void => {
    if (node.isFrame) {
      frames.add(node.placementId)
      depth.set(node.placementId, node.depth)
    }
    if (parentId !== null) {
      parent.set(node.placementId, parentId)
      const list = directChildren.get(parentId)
      if (list) list.push(node.placementId)
      else directChildren.set(parentId, [node.placementId])
    }
    for (const member of node.members) walk(member, node.placementId)
  }
  for (const root of roots) walk(root, null)

  return {
    isFrame: (id) => frames.has(id),
    parentOf: (id) => parent.get(id) ?? null,
    depthOf: (id) => depth.get(id) ?? 0,
    transitiveMembers: (frameId) => {
      const out: string[] = []
      const stack = [...(directChildren.get(frameId) ?? [])]
      const seen = new Set<string>(stack)
      while (stack.length > 0) {
        const current = stack.pop()!
        out.push(current)
        for (const child of directChildren.get(current) ?? []) {
          if (seen.has(child)) continue
          seen.add(child)
          stack.push(child)
        }
      }
      return out
    },
    frameIds: () => [...frames],
  }
}
