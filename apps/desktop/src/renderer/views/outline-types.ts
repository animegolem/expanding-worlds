/** Stable hand-off from the outliner master pane to preview and verb doors. */
export interface OutlineSourcePlacement {
  placementId: string
  canvasId: string
  canvasLabel: string
}

interface OutlineSelectionBase {
  key: string
  label: string
  tags: string[]
  placementCount: number
  sourcePlacement: OutlineSourcePlacement | null
  hasNote: boolean
  isLoose: boolean
  isOrphan: boolean
  appearanceKind: string | null
}

export type OutlineSelection =
  | (OutlineSelectionBase & {
      kind: 'root' | 'board' | 'node'
      nodeId: string
      noteId: string | null
      canvasId: string | null
    })
  | (OutlineSelectionBase & {
      kind: 'note'
      nodeId: null
      noteId: string
      canvasId: null
    })
  | (OutlineSelectionBase & {
      kind: 'bin'
      nodeId: null
      noteId: null
      canvasId: null
    })
