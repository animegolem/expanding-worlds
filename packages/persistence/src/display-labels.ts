import type { CommandContext } from './dispatcher'

/**
 * App-wide display-name law (DESIGN-QUEUE 2026-07-11): generated
 * identities are storage, never user-facing names. Keep the fallback
 * grammar in one persistence seam so every read model and navigation
 * door prints the same live canvas name.
 */

type ReadContext = Omit<CommandContext, 'now'>

export interface NodeDisplayFacts {
  isRoot?: boolean
  noteTitle?: string | null
  assetFilename?: string | null
  childCanvasId?: string | null
  boardChildCount?: number | null
}

export interface CanvasDisplayFacts {
  isRoot: boolean
  noteTitle?: string | null
  childCount?: number | null
}

export interface CanvasDisplayLabel {
  canvasId: string
  label: string
}

export function nodeDisplayLabel(facts: NodeDisplayFacts): string {
  if (facts.isRoot && facts.childCanvasId) return 'Home'
  const title = facts.noteTitle?.trim()
  if (title) return title
  if (facts.childCanvasId) return `unnamed · ${facts.boardChildCount ?? 0} items`
  const filename = facts.assetFilename?.trim()
  if (filename) return filename
  return 'untitled node'
}

export function canvasDisplayLabel(facts: CanvasDisplayFacts): string {
  if (facts.isRoot) return 'Home'
  const title = facts.noteTitle?.trim()
  return title || `unnamed · ${facts.childCount ?? 0} items`
}

/** Batch-resolve live, usable canvases. Missing ids are deliberately
 * absent: callers may use stored labels only for degraded/dangling
 * records, never as the primary name of a live board. */
export function readLiveCanvasDisplayLabels(
  ctx: ReadContext,
  canvasIds: readonly string[],
): Map<string, string> {
  const unique = [...new Set(canvasIds.filter((id) => id.length > 0))]
  if (unique.length === 0) return new Map()
  const marks = unique.map(() => '?').join(',')
  const rows = ctx.db.all<{
    canvasId: string
    noteTitle: string | null
    isRoot: number
    childCount: number
  }>(
    `SELECT c.id AS canvasId, note.title AS noteTitle,
            CASE WHEN c.node_id = pr.root_node_id THEN 1 ELSE 0 END AS isRoot,
            (SELECT count(*) FROM placement cp
              JOIN node cpn ON cpn.id = cp.node_id AND cpn.lifecycle_state = 'active'
              WHERE cp.canvas_id = c.id AND cp.lifecycle_state = 'active') AS childCount
     FROM canvas c
     JOIN project pr ON pr.id = c.project_id
     JOIN node owner ON owner.id = c.node_id AND owner.lifecycle_state = 'active'
     LEFT JOIN note ON note.id = owner.note_id AND note.lifecycle_state = 'active'
     WHERE c.project_id = ? AND c.lifecycle_state = 'active'
       AND c.id IN (${marks})`,
    ctx.projectId,
    ...unique,
  )
  return new Map(
    rows.map((row) => [
      row.canvasId,
      canvasDisplayLabel({
        isRoot: row.isRoot === 1,
        noteTitle: row.noteTitle,
        childCount: row.childCount,
      }),
    ]),
  )
}
