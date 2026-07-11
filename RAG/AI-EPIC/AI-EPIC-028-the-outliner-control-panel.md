# AI-EPIC
---
node_id: AI-EPIC-028
tags:
  - EPIC
  - AI
  - outline
  - renderer
  - design-kit
date_created: 2026-07-10
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-273
  - AI-IMP-274
  - AI-IMP-275
  - AI-IMP-276
---

# AI-EPIC-028-the-outliner-control-panel

## Problem Statement/Feature Scope

The shipped outline (AI-IMP-069/070) is a read-mostly tree with two
row actions. The owner's OCD-loop framing (2026-07-10, alph-endorsed)
reframed the surface: it should be the CONTROL PANEL of the open
world — the place where incompleteness (no words, no place, no
taxonomy) itches visibly and is satisfying to clear, because that
loop is how people come to manage their stuff as data. The Outliner
UI Kit 1.1 + "Outliner Grammar" companion (RAG/design/
outliner-kit-1.1/, owner-authored on the design system) resolved the
design conversation the same night: the yazi hybrid — org-tree
master + cursor-follow preview — with an invariant grammar that
survives desktop and touch alike.

## Proposed Solution(s)

Rebuild the outline takeover to the kit and grammar, which are THE
NORMATIVE REFERENCES for this epic ("Outliner Grammar.dc.html" for
rules, "Outliner UI Kit.dc.html" for pixels; RFC §14.1 semantics
unchanged underneath):

- Two-pane takeover: tree master (fold glyphs, kind glyphs ⌂⬚◯▣↗⊘,
  warn badges, clickable tag chips → lens, meta column) + a preview
  pane that follows cursor/tap selection — never a click cost.
- Preview: kind line, media (image full-bleed; boards as a FILMSTRIP
  of first 4-5 children by render_order through the 076 thumbnail
  pipeline, glyph chips for non-image children, +N, LRU on
  canvasId+revision), note excerpt, placed-N-× line, adaptive verb
  row (↵ dive / ␣ place · ⌖ fly to · ✎ open note) with visible
  disabled reasons.
- The empty note area is EDITABLE ("add a note…", ↵ attach =
  CreateNoteAndAttach, one undoable command). Rows are navigation,
  never inputs.
- Facets: all · unplaced · orphans · disconnected · untagged; any
  facet or ⌕ text FLATTENS into a worklist with path-in-meta; fold
  state survives; ·untagged badges only while a cleanup facet is
  active; teaching footer with scope-honest counts.
- Naming fallback per the grammar: images show source filename
  (mono/muted, provenance); unnamed boards read "unnamed · N items";
  raw ids never surface.
- One verb inventory, three doors: preview verbs, row context menu
  (MenuPopover, right-click/long-press), keyboard — no door offers a
  verb another lacks; trash routes the SHIPPED §9 semantics only.
- Touch dialect: the kit's touchMode — 44px rows, verbs as tap
  chips; the iPad portrait bottom sheet is drawn in the kit and
  DEFERRED to the V2 shell work (desktop ships the pointer dialect
  with touch-ready row metrics behind the prop).

## Path(s) Not Taken

- Inline editing in tree rows (grammar §1 forbids it — text entry
  lives in the preview and panels).
- Covers-on-Home-hover (launcher cluster; covers don't exist yet).
- A new trash/lifecycle verb (the inventory routes shipped commands).
- Untagged folding into "disconnected" (grammar §3: a third axis,
  never merged).
- Graph view, density modes, or any surface beyond the outline.

## Success Metrics

- The outline takeover renders the two-pane shape with every grammar
  rule verifiable in e2e (flatten-with-path, fold-state survival,
  badge calm rule, three-door verb parity).
- alph can run his cleanup loop: open outline → untagged facet →
  work the worklist (tag from the row menu, add notes from the
  preview) → counts fall to zero — without leaving the takeover.
- Preview follows selection with no perceptible lag on a
  500-placement project (the filmstrip LRU holds).
- Ships in v0.23.0 or the next testing tag after; alph feel pass
  queued in HUMAN-TESTING.

## Implementation Breakdown

- AI-IMP-273: read models — preview projection, filmstrip plan +
  thumbnails, facet counts (persistence + data layer).
- AI-IMP-274: the two-pane shell — tree master rework, facets,
  flatten engine, teaching footer, selection model.
- AI-IMP-275: the preview pane — media/filmstrip, editable-empty
  note, adaptive verbs, lens integration.
- AI-IMP-276: three-door verb parity — row context menu, keyboard
  map, touch metrics prop.
