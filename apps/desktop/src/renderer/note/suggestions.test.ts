// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { baseNoteExtensions } from './editor-markdown'
import type { ProjectPort } from './note-editor'
import { wikiLinkSuggestions } from './suggestions'

/**
 * AI-IMP-156 secondary finding: the `[[` completion popup awaits
 * suggestTitles; if the editor is destroyed WHILE that query is in flight,
 * the resolution path must not re-create the popup element (an orphan
 * appended to document.body) or call coordsAtPos on the destroyed view (an
 * unhandled rejection). A `#destroyed` flag set in destroy() and checked
 * after the await guards both.
 */

const SUGGESTION_SELECTOR = '[data-testid="note-suggestions"]'

/** A port whose suggestTitles query stays pending until we resolve it. */
class DeferredPort implements ProjectPort {
  #resolve: ((items: unknown) => void) | null = null

  async execute(): Promise<never> {
    throw new Error('not used')
  }

  query<T>(name: string): Promise<T> {
    if (name !== 'suggestTitles') return Promise.resolve(null as T)
    return new Promise<T>((resolve) => {
      this.#resolve = resolve as (items: unknown) => void
    })
  }

  get hasPending(): boolean {
    return this.#resolve !== null
  }

  resolvePending(): void {
    this.#resolve?.([
      { title: 'Dragon', phantom: false, inTrash: false, referenceCount: null },
    ])
  }
}

describe('wikiLinkSuggestions destroy-during-query (§7.2, AI-IMP-156)', () => {
  const rejections: unknown[] = []
  const onRejection = (reason: unknown): void => {
    rejections.push(reason)
  }

  afterEach(() => {
    window.removeEventListener('unhandledrejection', onRejection)
    document.querySelectorAll(SUGGESTION_SELECTOR).forEach((el) => el.remove())
    rejections.length = 0
  })

  it('destroying the editor mid-query leaves no orphan popup and no throw', async () => {
    window.addEventListener('unhandledrejection', onRejection)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const port = new DeferredPort()
    const editor = new Editor({
      element: host,
      extensions: [...baseNoteExtensions(), wikiLinkSuggestions(port)],
      content: '',
    })

    // Type an open token so refresh() runs, matches, and awaits the query.
    editor.commands.insertContent('[[Dr')
    // The plugin's update handler kicked off refresh(); the query is now
    // pending inside the await. Guard against a false green: if no query
    // was issued, the rest of the test proves nothing.
    expect(port.hasPending).toBe(true)

    // Tear the editor down WHILE the query is in flight.
    editor.destroy()
    host.remove()

    // Now the query resolves — the old code would re-render an orphan and
    // call coordsAtPos on the destroyed view.
    port.resolvePending()
    await Promise.resolve()
    await Promise.resolve()

    expect(document.querySelector(SUGGESTION_SELECTOR)).toBeNull()
    expect(rejections).toEqual([])
  })
})
