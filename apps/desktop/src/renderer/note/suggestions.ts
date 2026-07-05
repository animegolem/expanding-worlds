import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { ProjectPort } from './note-editor'

/**
 * Wiki-link title suggestions (§7.2, AI-IMP-045): inside an open
 * `[[` token the completion list offers active titles, phantom
 * titles with an indicator and reference count (so repeated
 * references converge on one spelling), and trashed titles marked In
 * Trash. Matching runs server-side in suggestTitles by normalized
 * title_key; no create action appears here — creation flows through
 * phantom materialization.
 */

interface TitleSuggestion {
  title: string
  phantom: boolean
  inTrash: boolean
  referenceCount: number | null
}

const OPEN_TOKEN_RE = /\[\[([^[\]|\r\n]*)$/

export function wikiLinkCompletion(port: ProjectPort): Extension {
  const source = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = context.matchBefore(OPEN_TOKEN_RE)
    if (!match) return null
    const query = match.text.slice(2)
    if (query.length === 0 && !context.explicit) return null
    const suggestions = await port.query<TitleSuggestion[]>('suggestTitles', { query })
    if (suggestions.length === 0) return null
    return {
      from: match.from + 2,
      options: suggestions.map(toOption),
      // Matching already happened by title_key; don't re-filter by
      // the raw (un-normalized) text.
      filter: false,
    }
  }
  return autocompletion({ override: [source] })
}

function toOption(suggestion: TitleSuggestion): Completion {
  const detail = suggestion.phantom
    ? `phantom · ${suggestion.referenceCount ?? 0} ref${suggestion.referenceCount === 1 ? '' : 's'}`
    : suggestion.inTrash
      ? 'In Trash'
      : undefined
  return {
    label: suggestion.title,
    type: suggestion.phantom ? 'text' : 'variable',
    ...(detail !== undefined ? { detail } : {}),
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const closed = view.state.sliceDoc(to, to + 2) === ']]'
      const insert = suggestion.title + (closed ? '' : ']]')
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + suggestion.title.length + 2 },
      })
    },
  }
}
