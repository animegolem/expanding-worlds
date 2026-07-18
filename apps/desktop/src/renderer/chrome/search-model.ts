import type { FuzzyCandidate } from './fzf-match'

export interface SearchAssetResult {
  assetId: string
  filename: string
  usingNodeIds: string[]
  usingCanvases: Array<{ canvasId: string; canvasLabel: string }>
}

export interface SearchResults {
  notes: Array<{ noteId: string; title: string; snippet: string }>
  tags: Array<{ tagId: string; name: string }>
  assets: SearchAssetResult[]
  canvasText: Array<{ decorationId: string; canvasId: string; canvasLabel: string; snippet: string }>
}

export interface SearchNodeRow {
  id: string
  noteId: string | null
  noteTitle: string | null
  assetFilename: string | null
  childCanvasId: string | null
  displayLabel: string
  tags: string[]
}

export interface SearchLooseNoteRow { id: string; title: string }
export interface SearchTagRow { id: string; name: string }

export type SearchSnapshotCandidate = FuzzyCandidate & (
  | { kind: 'note'; noteId: string; label: string }
  | { kind: 'canvas'; canvasId: string; label: string }
  | { kind: 'image-node'; nodeId: string; filename: string; label: string }
  | { kind: 'tag'; tagId: string; label: string }
)

export interface SearchSnapshot {
  candidates: SearchSnapshotCandidate[]
  tags: SearchTagRow[]
}

export type SearchQuery = <T>(name: string, args?: unknown) => Promise<T>

/** Tiny generation gate shared by snapshot and body requests. A result may
 * mutate visible state only while its token is current. */
export class SearchEpoch {
  #current = 0
  begin(): number { return ++this.#current }
  isCurrent(token: number): boolean { return token === this.#current }
}

/** One coherent renderer snapshot. The epoch guard belongs to the caller,
 * so a late Promise.all can never replace a newer project/open snapshot. */
export async function loadSearchSnapshot(query: SearchQuery): Promise<SearchSnapshot> {
  const [nodes, looseNotes, tags] = await Promise.all([
    query<SearchNodeRow[]>('listNodeLibrary'),
    query<SearchLooseNoteRow[]>('listLooseNotes'),
    query<SearchTagRow[]>('listTags'),
  ])
  const candidates: SearchSnapshotCandidate[] = []
  const notes = new Set<string>()
  const noteCandidates = new Map<string, Extract<SearchSnapshotCandidate, { kind: 'note' }>>()
  for (const node of nodes) {
    if (node.noteId && node.noteTitle) {
      const existing = noteCandidates.get(node.noteId)
      if (existing) {
        existing.tags = [...new Set([...existing.tags, ...node.tags])]
      } else {
        notes.add(node.noteId)
        const candidate: Extract<SearchSnapshotCandidate, { kind: 'note' }> = {
          id: `note:${node.noteId}`, kind: 'note', noteId: node.noteId,
          label: node.noteTitle, names: [node.noteTitle], tags: node.tags,
        }
        noteCandidates.set(node.noteId, candidate)
        candidates.push(candidate)
      }
    }
    if (node.childCanvasId) {
      const label = node.displayLabel
      candidates.push({
        id: `canvas:${node.childCanvasId}`, kind: 'canvas', canvasId: node.childCanvasId,
        label, names: [label], tags: node.tags,
      })
    }
    if (node.assetFilename) {
      candidates.push({
        id: `image:${node.id}`, kind: 'image-node', nodeId: node.id,
        filename: node.assetFilename, label: node.displayLabel,
        names: [node.noteTitle ?? '', node.assetFilename], tags: node.tags,
      })
    }
  }
  for (const note of looseNotes) {
    if (notes.has(note.id)) continue
    notes.add(note.id)
    candidates.push({
      id: `note:${note.id}`, kind: 'note', noteId: note.id,
      label: note.title, names: [note.title], tags: [],
    })
  }
  for (const tag of tags) {
    candidates.push({
      id: `tag:${tag.id}`, kind: 'tag', tagId: tag.id,
      label: tag.name, names: [], tags: [tag.name],
    })
  }
  return { candidates, tags }
}
