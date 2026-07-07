---
node_id: AI-IMP-148
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: completed
depends_on: [AI-IMP-146]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.65
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-148-heading-folding

## Summary of Issue #1

EPIC-018 FR-3 (rev 0.55 §7.1 outliner presentation). Headings
fence the content below them and FOLD: a gutter chevron affordance
per heading, a `[...]` marker on the folded line, heading levels
1–6 mapping to org-style nesting (folding h2 hides to the next
h2/h1). Folding is DECORATION-ONLY (spike-proven: source stays
byte-identical while folded) and view-only state — never durable,
reset per open. Done means folding works in panel and big editor,
the caret never strands inside a fold (caret-out handling per the
spike), and saves while folded are byte-faithful.

### Out of Scope

- Settings-sheet section folds (already shipped rev 0.55 UI work
  or rides its own surface).
- Fold persistence (explicitly view-only).

### Design/Approach

Port the spike's HeadingFold; gutter chevron per the wireframe 1f
direction on theme tokens; folded-line `[...]` marker; caret
handling: editing commands that would land inside a folded region
unfold it. Unit: fold map for a 6-level fixture; e2e: fold, type
elsewhere, save, body unchanged; fold marker visible.

### Files to Touch

`apps/desktop/src/renderer/note/` fold extension (+ units).
Note e2e extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Fold/unfold per heading with chevron + [...] marker; levels
      nest org-style; unit fixture.
- [x] Decoration-only proven (save while folded = byte-identical).
- [x] Caret never strands in a fold (edit unfolds).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [x] HUMAN-TESTING entry appended at merge by the lead (does
      folding read as the outline grammar; chevron weight).

### Acceptance Criteria

**GIVEN** a long structured note
**WHEN** an h2 folds
**THEN** its region hides to the next h2/h1 with the marker, the
saved body is unchanged, and clicking the chevron restores it.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Ported vs rebuilt.** Ported the spike's core (`computeFoldRange`
  sibling-scan, the `Decoration.node(display:none)` hidden range, the
  plugin/meta toggle shape) mostly verbatim into `folding.ts`. Rebuilt
  everything the spike flagged as "app logic, not implemented here":
  the clickable gutter-chevron + `[...]` marker widget decorations
  (toDOM function form so a widget can dispatch its own toggle),
  cross-edit fold remapping (`tr.mapping.map`), the prune of
  non-heading anchors, and the full caret discipline.

- **Caret-out approach (two halves).** (1) On FOLD, `toggleFold` checks
  whether the selection overlaps the range about to hide and, if so,
  parks the caret at the heading-line end (`headingPos + nodeSize - 1`)
  in the same transaction, so a fold never leaves the caret stranded.
  (2) On any later transaction, an `appendTransaction` guard unfolds a
  heading whose hidden interior the selection has entered (an edit,
  find, or the §7.8 rename-sweep landing there) — the deterministic
  case the unit test drives directly.

- **Wiring.** `HeadingFold` is added to `baseNoteExtensions()` rather
  than the controller's per-instance `extensions` hook, so it covers
  BOTH the tethered panel and the §8.5 big editor (one buffer, moved by
  reparent) with no touch to the fenced `NotePanel.svelte`/`panels.ts`.
  The round-trip corpus already exercises this base set, so it now also
  proves the fold extension never perturbs serialization.

- **Decorations built in `init`, not just `apply`.** First cut only
  built the DecorationSet in `apply`, so chevrons were absent until the
  first transaction after a note opened. Moved the build into the state
  field's `init(_, state)` too (the `#loadProse` path recreates the
  EditorState per note, so `init` runs on every open).

- **Chevron gutter margin → canvas hit-test.** A `-1.15em` negative
  left margin (true left-gutter look) pushed the chevron's box outside
  the panel, where the WebGL `<canvas>` overlay intercepted the click
  (e2e `intercepts pointer events`). Dropped the negative margin; the
  chevron now sits just inside the content box, immediately left of the
  heading text. Chevron weight/placement is the HUMAN-TESTING feel call.

- **E2E flakiness on the "edit-into-fold" gesture.** A first version
  placed the caret with click-`End`-`Enter`, which was nondeterministic
  (the full-suite run caught it as flaky). Reworked to the deterministic
  path: click INTO the section, fold (our code parks the caret at the
  heading end), then `Enter` splits from that exact parked point into
  the folded region and unfolds. 4× `--repeat-each` green, then the full
  suite green (165 passed).

- **Gates.** `pnpm -r build` green; `pnpm -r test` green (desktop
  `vitest` 53 tests incl. the theme raw-color guard, the editor-face
  carve-out guard, and the new `folding.test.ts`; then 165 hidden-window
  Playwright tests); `pnpm lint` clean. No schema/migration touched; no
  fenced file touched.