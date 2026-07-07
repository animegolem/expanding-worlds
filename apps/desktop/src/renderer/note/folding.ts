import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

/**
 * Org-style heading folding (RFC-0001 §7.1, AI-IMP-148), ported from the
 * TipTap spike (spike/tiptap/src/folding.mjs) that proved the load-bearing
 * property: folding is DECORATION-ONLY. It hides a range of following
 * blocks with `Decoration.node(display:none)` and never mutates the doc,
 * so Markdown serialization — and thus §7.1 byte-for-byte round-trip — is
 * unaffected while folded. That is the whole reason a decoration fold is
 * safe over a Markdown-canonical carrier.
 *
 * A heading FENCES the content below it: folding an h2 hides every
 * following top-level block until the next heading of EQUAL OR HIGHER
 * level (the next h2/h1). Levels 1–6 nest org-style — folding an h1
 * subsumes any h2..h6 sections beneath it (a `display:none` on an ancestor
 * range visually subsumes the inner decorations).
 *
 * Beyond the spike this ships the real UI and caret discipline:
 *  - a gutter chevron affordance per foldable heading (click to toggle)
 *    and a `[...]` marker on the folded heading line, both view-only
 *    widget decorations styled on theme tokens (editor-face.css);
 *  - fold state is remapped across doc edits so a fold stays anchored to
 *    its heading as text is typed above it;
 *  - the caret never strands inside a fold: folding moves a caret out of
 *    the to-be-hidden range, and any edit/selection that lands inside a
 *    folded region unfolds it first (appendTransaction).
 *
 * Fold state is VIEW-ONLY: it lives in this plugin's state, never in the
 * doc, and is never persisted — it resets every time a note is opened.
 * ProseMirror's doc is a FLAT block list (a heading does not CONTAIN its
 * section), so the fold range is computed by scanning siblings at fold
 * time.
 */

export const foldKey = new PluginKey<FoldPluginState>('ewHeadingFold')

const HEADING = 'heading'

interface FoldPluginState {
  /** Top-level document positions of the currently folded headings. */
  folded: Set<number>
  decos: DecorationSet
}

type FoldMeta = { type: 'toggle'; pos: number } | { type: 'unfold'; pos: number }

export interface FoldRange {
  /** First hidden position (immediately after the heading node). */
  from: number
  /** End of the hidden range (start of the next same/higher heading, or
   * the end of the document). */
  to: number
  /** Top-level position of the folding heading itself. */
  headingPos: number
}

/** The top-level child index whose start position is exactly `pos`, or -1. */
function topLevelIndexAt(doc: PMNode, pos: number): number {
  let acc = 0
  for (let i = 0; i < doc.childCount; i++) {
    if (acc === pos) return i
    acc += doc.child(i).nodeSize
  }
  return -1
}

/** Top-level start position of child `index`. */
function topLevelPosOf(doc: PMNode, index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  return pos
}

/**
 * The range a heading folds: everything after the heading up to (not
 * including) the next heading of level <= this heading's level. Returns
 * null when the heading fences nothing (a trailing heading, or one
 * immediately followed by a same/higher heading).
 */
export function computeFoldRange(doc: PMNode, headingIndex: number): FoldRange | null {
  if (headingIndex < 0 || headingIndex >= doc.childCount) return null
  const heading = doc.child(headingIndex)
  if (heading.type.name !== HEADING) return null
  const level = heading.attrs['level'] as number
  const headingPos = topLevelPosOf(doc, headingIndex)
  const startHide = headingPos + heading.nodeSize
  let hideEnd = startHide
  for (let i = headingIndex + 1; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === HEADING && (child.attrs['level'] as number) <= level) break
    hideEnd += child.nodeSize
  }
  return startHide === hideEnd ? null : { from: startHide, to: hideEnd, headingPos }
}

/** The fold range for the heading whose top-level start position is `pos`. */
export function foldRangeAtPos(doc: PMNode, pos: number): FoldRange | null {
  return computeFoldRange(doc, topLevelIndexAt(doc, pos))
}

/**
 * The fold map for a document: every foldable heading's top-level position
 * mapped to the range it would hide. Pure — the unit fixture exercises the
 * org-style nesting boundaries through this.
 */
export function foldMap(doc: PMNode): Map<number, FoldRange> {
  const map = new Map<number, FoldRange>()
  for (let i = 0; i < doc.childCount; i++) {
    if (doc.child(i).type.name !== HEADING) continue
    const range = computeFoldRange(doc, i)
    if (range) map.set(range.headingPos, range)
  }
  return map
}

/** A view-only chevron / marker widget: never editable, never selectable. */
function affordance(
  view: EditorView,
  headingPos: number,
  kind: 'chevron' | 'marker',
  folded: boolean,
): HTMLElement {
  const el = document.createElement('span')
  el.contentEditable = 'false'
  el.setAttribute('data-testid', kind === 'chevron' ? 'fold-chevron' : 'fold-marker')
  el.setAttribute('data-fold-pos', String(headingPos))
  if (kind === 'chevron') {
    el.className = `ew-fold-chevron ${folded ? 'ew-fold-closed' : 'ew-fold-open'}`
    el.textContent = folded ? '▸' : '▾' // ▸ closed · ▾ open
    el.setAttribute('aria-label', folded ? 'Unfold section' : 'Fold section')
  } else {
    el.className = 'ew-fold-marker'
    el.textContent = '[...]'
    el.setAttribute('aria-hidden', 'true')
  }
  // Toggle on mousedown, before the editor moves the selection into the
  // widget; preventDefault keeps the caret where it is.
  el.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleFold(view, headingPos)
  })
  return el
}

function buildDecorations(doc: PMNode, folded: Set<number>): DecorationSet {
  const decos: Decoration[] = []
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name !== HEADING) continue
    const range = computeFoldRange(doc, i)
    if (!range) continue // nothing to fold under this heading → no affordance
    const pos = range.headingPos
    const isFolded = folded.has(pos)
    if (isFolded) {
      // Hide each fenced top-level block with display:none (view-only).
      let scan = range.from
      let idx = i + 1
      while (scan < range.to && idx < doc.childCount) {
        const node = doc.child(idx)
        decos.push(
          Decoration.node(scan, scan + node.nodeSize, {
            class: 'ew-folded',
            style: 'display:none',
          }),
        )
        scan += node.nodeSize
        idx++
      }
    }
    decos.push(
      Decoration.node(pos, pos + child.nodeSize, {
        class: isFolded ? 'ew-fold-head ew-fold-head-folded' : 'ew-fold-head',
      }),
    )
    // Chevron at the start of the heading; marker after the heading text
    // when folded. The toDOM function form hands us the live view so the
    // widget can dispatch a toggle when clicked.
    decos.push(
      Decoration.widget(pos + 1, (view) => affordance(view, pos, 'chevron', isFolded), {
        side: -1,
        key: `fold-chevron-${pos}-${isFolded}`,
      }),
    )
    if (isFolded) {
      decos.push(
        Decoration.widget(pos + child.nodeSize - 1, (view) => affordance(view, pos, 'marker', true), {
          side: 1,
          key: `fold-marker-${pos}`,
        }),
      )
    }
  }
  return DecorationSet.create(doc, decos)
}

/** Prune folds whose anchor is no longer a top-level heading. */
function prune(doc: PMNode, folded: Set<number>): Set<number> {
  let changed = false
  const kept = new Set<number>()
  for (const pos of folded) {
    const idx = topLevelIndexAt(doc, pos)
    if (idx >= 0 && doc.child(idx).type.name === HEADING) kept.add(pos)
    else changed = true
  }
  return changed ? kept : folded
}

/** Does the selection sit inside the hidden text of any folded range? */
function selectionInFold(state: EditorState, folded: Set<number>): number | null {
  const sel = state.selection
  for (const pos of folded) {
    const range = foldRangeAtPos(state.doc, pos)
    if (!range) continue
    // Overlap with the hidden text interior (range.from is the boundary
    // just after the heading — a caret there is parked, not stranded).
    if (sel.from < range.to && sel.to > range.from) return pos
  }
  return null
}

export const HeadingFold = Extension.create({
  name: 'headingFold',
  addProseMirrorPlugins() {
    return [
      new Plugin<FoldPluginState>({
        key: foldKey,
        state: {
          init: (_config, state) => {
            const folded = new Set<number>()
            return { folded, decos: buildDecorations(state.doc, folded) }
          },
          apply(tr, value, _old, newState) {
            let folded = value.folded
            if (tr.docChanged) {
              // Keep folds anchored to their heading as the doc changes.
              const mapped = new Set<number>()
              for (const pos of folded) mapped.add(tr.mapping.map(pos, -1))
              folded = mapped
            }
            const meta = tr.getMeta(foldKey) as FoldMeta | undefined
            if (meta?.type === 'toggle') {
              folded = new Set(folded)
              if (folded.has(meta.pos)) folded.delete(meta.pos)
              else folded.add(meta.pos)
            } else if (meta?.type === 'unfold') {
              if (folded.has(meta.pos)) {
                folded = new Set(folded)
                folded.delete(meta.pos)
              }
            }
            folded = prune(newState.doc, folded)
            return { folded, decos: buildDecorations(newState.doc, folded) }
          },
        },
        appendTransaction(_trs, _oldState, newState) {
          // The caret never strands inside a fold: if an edit or selection
          // change lands the caret in hidden text, unfold that heading.
          const st = foldKey.getState(newState)
          if (!st) return null
          const pos = selectionInFold(newState, st.folded)
          if (pos === null) return null
          return newState.tr.setMeta(foldKey, { type: 'unfold', pos })
        },
        props: {
          decorations(state) {
            return foldKey.getState(state)?.decos ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})

/**
 * Toggle the fold on the heading at top-level position `headingPos`. When
 * folding, moves a caret out of the range about to be hidden so it is never
 * stranded (the appendTransaction guard then leaves it alone).
 */
export function toggleFold(view: EditorView, headingPos: number): void {
  const willFold = !foldKey.getState(view.state)?.folded.has(headingPos)
  const tr = view.state.tr.setMeta(foldKey, { type: 'toggle', pos: headingPos })
  if (willFold) {
    const range = foldRangeAtPos(view.state.doc, headingPos)
    const sel = view.state.selection
    if (range && sel.from < range.to && sel.to > range.from) {
      // Park the caret at the end of the heading line, outside the fold.
      const heading = view.state.doc.child(topLevelIndexAt(view.state.doc, headingPos))
      const parkAt = headingPos + heading.nodeSize - 1
      tr.setSelection(TextSelection.create(tr.doc, parkAt))
    }
  }
  view.dispatch(tr)
}
