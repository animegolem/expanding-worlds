/**
 * Criterion 3 — org-style heading folding, prototyped as a TipTap
 * Extension over ProseMirror decorations. Folding a heading hides every
 * following top-level block until the next heading of EQUAL OR HIGHER
 * level (fold an h2 -> hide to the next h2/h1), matching the org / §7.1
 * "headings fence the content below them and fold" direction.
 *
 * The load-bearing property proven here: folding is VIEW-ONLY. It adds
 * Decoration.node(display:none) over a range; it never mutates the doc,
 * so markdown serialization (and thus §7.1 round-trip) is completely
 * unaffected while folded. That is the whole reason a decoration fold
 * is safe over a Markdown-canonical carrier.
 *
 * GOTCHAS surfaced (documented in the report):
 *  - ProseMirror's doc is a FLAT block list; a heading does not CONTAIN
 *    its section. The fold range must be computed by scanning siblings
 *    at fold time. Fine, but it is app logic, not a built-in.
 *  - Caret can sit inside a to-be-hidden block; integration must move
 *    the selection out on fold (not implemented here — flagged).
 *  - Nested folds (fold h1 that contains folded h2s) compose because
 *    display:none on an ancestor range subsumes inner decorations.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const foldKey = new PluginKey('ewFold')

const HEADING = 'heading'

/** Top-level child index + pos for the heading at doc position `pos`. */
function topLevelChildAt(doc, pos) {
  let acc = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (pos === acc) return { index: i, node: child, pos: acc }
    acc += child.nodeSize
  }
  return null
}

/**
 * Given the top-level index of a heading, return [fromPos, toPos)
 * covering the blocks to hide: everything after the heading up to (not
 * including) the next heading of level <= this heading's level.
 */
export function computeFoldRange(doc, headingIndex) {
  const heading = doc.child(headingIndex)
  if (heading.type.name !== HEADING) return null
  const level = heading.attrs.level
  let pos = 0
  for (let i = 0; i < headingIndex; i++) pos += doc.child(i).nodeSize
  const startHide = pos + heading.nodeSize
  let hideEnd = startHide
  for (let i = headingIndex + 1; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === HEADING && child.attrs.level <= level) break
    hideEnd += child.nodeSize
  }
  return startHide === hideEnd ? null : { from: startHide, to: hideEnd, headingPos: pos }
}

function buildDecorations(doc, foldedPositions) {
  const decos = []
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name !== HEADING) continue
    let pos = 0
    for (let j = 0; j < i; j++) pos += doc.child(j).nodeSize
    if (!foldedPositions.has(pos)) continue
    const range = computeFoldRange(doc, i)
    if (!range) continue
    // Decorate each hidden top-level block node with display:none.
    let scan = range.from
    let idx = i + 1
    while (scan < range.to && idx < doc.childCount) {
      const node = doc.child(idx)
      decos.push(Decoration.node(scan, scan + node.nodeSize, { class: 'ew-folded', style: 'display:none' }))
      scan += node.nodeSize
      idx++
    }
    // Mark the heading itself so a chevron/CSS can show fold state.
    decos.push(Decoration.node(pos, pos + child.nodeSize, { class: 'ew-fold-head' }))
  }
  return DecorationSet.create(doc, decos)
}

export const HeadingFold = Extension.create({
  name: 'headingFold',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: foldKey,
        state: {
          init: () => ({ folded: new Set(), decos: DecorationSet.empty }),
          apply(tr, value, _old, newState) {
            let folded = value.folded
            const meta = tr.getMeta(foldKey)
            if (meta?.type === 'toggle') {
              folded = new Set(folded)
              if (folded.has(meta.pos)) folded.delete(meta.pos)
              else folded.add(meta.pos)
            }
            // Recompute against the (possibly changed) doc.
            const decos = buildDecorations(newState.doc, folded)
            return { folded, decos }
          },
        },
        props: {
          decorations(state) {
            return foldKey.getState(state).decos
          },
        },
      }),
    ]
  },
})

/** Test/host helper: toggle fold on the heading at top-level `pos`. */
export function toggleFold(editor, headingPos) {
  const tr = editor.state.tr.setMeta(foldKey, { type: 'toggle', pos: headingPos })
  editor.view.dispatch(tr)
}
