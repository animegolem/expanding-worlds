/** Renderer transport mirrors for the typed persistence read models. The
 * renderer cannot import @ew/persistence (§11.1); all values cross the
 * generic Project API query bridge. */
export type OutlinePreviewTarget =
  | { kind: 'node'; nodeId: string }
  | { kind: 'note'; noteId: string }

export interface OutlinePlace {
  placementId: string
  canvasId: string
  canvasLabel: string
}

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

interface QueryResponse {
  ok: boolean
  result?: unknown
  code?: string
  message?: string
}

export type OutlineQuery = (name: string, args?: unknown) => Promise<QueryResponse>

export type OutlineFilmstripItem =
  | (Extract<BoardFilmstripItem, { kind: 'image' }> & { thumbnailUrl: string })
  | Extract<BoardFilmstripItem, { kind: 'glyph' }>

export interface OutlineFilmstrip extends Omit<BoardFilmstrip, 'items'> {
  items: OutlineFilmstripItem[]
}

/** The 076 derivative URL. A missing derivative honestly 404s; the
 * preview image's error handler owns the image-glyph fallback. */
export function outlineThumbnailUrl(contentHash: string): string {
  return `ew-asset://${contentHash}/thumb`
}

function queryFailure(name: string, response: QueryResponse): Error {
  return new Error(`${name}: ${response.message ?? response.code ?? 'query failed'}`)
}

/** Selection queries plus a bounded revision-keyed filmstrip LRU.
 * The owner calls refreshRevision once for each outline refresh / project
 * changed event; row selection never asks getProject and never waterfalls. */
export class OutlineData {
  readonly #query: OutlineQuery
  readonly #capacity: number
  #revision: number | null = null
  #filmstrips = new Map<string, OutlineFilmstrip | null>()

  constructor(query: OutlineQuery, capacity = 32) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('outline data: capacity must be a positive integer')
    }
    this.#query = query
    this.#capacity = capacity
  }

  get revision(): number | null {
    return this.#revision
  }

  async refreshRevision(): Promise<number> {
    const response = await this.#query('getProject')
    if (!response.ok) throw queryFailure('getProject', response)
    const revision = (response.result as { revision?: unknown } | null)?.revision
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
      throw new Error('getProject: invalid project revision')
    }
    if (revision !== this.#revision) {
      this.#revision = revision
      this.#filmstrips.clear()
    }
    return revision
  }

  async getPreview(target: OutlinePreviewTarget): Promise<OutlinePreview | null> {
    const response = await this.#query('getOutlinePreview', target)
    if (!response.ok) throw queryFailure('getOutlinePreview', response)
    return response.result as OutlinePreview | null
  }

  async getFacetCounts(): Promise<OutlineFacetCounts> {
    const response = await this.#query('getOutlineFacetCounts')
    if (!response.ok) throw queryFailure('getOutlineFacetCounts', response)
    return response.result as OutlineFacetCounts
  }

  async getFilmstrip(canvasId: string, limit = 5): Promise<OutlineFilmstrip | null> {
    const revision = this.#revision ?? (await this.refreshRevision())
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5, Math.trunc(limit))) : 5
    const key = `${revision}:${canvasId}:${safeLimit}`
    const cached = this.#filmstrips.get(key)
    if (cached !== undefined || this.#filmstrips.has(key)) {
      this.#filmstrips.delete(key)
      this.#filmstrips.set(key, cached ?? null)
      return cached ?? null
    }

    const response = await this.#query('getBoardFilmstrip', { canvasId, limit: safeLimit })
    if (!response.ok) throw queryFailure('getBoardFilmstrip', response)
    const raw = response.result as BoardFilmstrip | null
    const filmstrip = raw
      ? {
          ...raw,
          items: raw.items.map((item): OutlineFilmstripItem =>
            item.kind === 'image'
              ? { ...item, thumbnailUrl: outlineThumbnailUrl(item.contentHash) }
              : item,
          ),
        }
      : null
    this.#filmstrips.set(key, filmstrip)
    while (this.#filmstrips.size > this.#capacity) {
      const oldest = this.#filmstrips.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.#filmstrips.delete(oldest)
    }
    return filmstrip
  }
}
