import { linkDisplayState, titleKey, type WikiLinkDisplayState } from '@ew/domain'
import type { ProjectPort } from './note-editor'

/**
 * Live wiki-link resolution cache (AI-IMP-045). Link records refresh
 * only on save (§7.1), so the editor derives token states between
 * saves from project titles plus the source note's saved BROKEN
 * records — the same inputs refreshNoteLinks persists from, so
 * presentation and records cannot drift. Refreshed on project-changed
 * events, which is also how re-resolution sweep effects reach open
 * editors.
 */

interface NoteTitleRow {
  titleKey: string
  lifecycleState: 'active' | 'trashed'
}

interface NoteLinkRow {
  state: 'bound' | 'unresolved' | 'broken'
  displayText: string | null
}

export class LinkResolution {
  #port: ProjectPort
  #titles = new Map<string, 'active' | 'trashed'>()
  #brokenKeys = new Set<string>()
  #noteId: string | null = null
  #listeners = new Set<() => void>()
  #epoch = 0

  constructor(port: ProjectPort) {
    this.#port = port
  }

  stateFor(rawTitle: string): WikiLinkDisplayState {
    return linkDisplayState(titleKey(rawTitle), {
      brokenKeys: this.#brokenKeys,
      titles: this.#titles,
    })
  }

  /** Re-query titles and (when a note is open) its broken records.
   * Stale responses lose: only the newest refresh publishes. */
  async refresh(noteId: string | null): Promise<void> {
    this.#noteId = noteId
    const epoch = ++this.#epoch
    const [titles, links] = await Promise.all([
      this.#port.query<NoteTitleRow[]>('listNoteTitles'),
      noteId
        ? this.#port.query<NoteLinkRow[]>('getNoteLinks', { noteId })
        : Promise.resolve([] as NoteLinkRow[]),
    ])
    if (epoch !== this.#epoch) return
    this.#titles = new Map(titles.map((row) => [row.titleKey, row.lifecycleState]))
    this.#brokenKeys = new Set(
      links
        .filter((link) => link.state === 'broken' && link.displayText !== null)
        .map((link) => titleKey(link.displayText!)),
    )
    for (const listener of this.#listeners) listener()
  }

  get noteId(): string | null {
    return this.#noteId
  }

  onChanged(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}
