---
node_id: AI-IMP-131
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - typography
  - notes
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-131-maple-mono-editor-face

## Summary of Issue #1

Rev 0.55 §7.1 ratifies the one typography carve-out: note TEXT
renders in Maple Mono (chosen over Geist/Martian by the
true-italic check), bundled, never fetched. Done means: the three
woff2 files + OFL license ship in the app bundle, `--ew-font-editor`
and the editor scale exist, and every note-text surface — panels,
big editor, card excerpts, gallery text posts — renders in Maple
with the colored heading tokens, while chrome everywhere stays the
system stacks.

### Out of Scope

- Org-style folding presentation and the floating format bar
  (EPIC-018 — AI-IMP-144 proves the engine first).
- Heading color finalization (tokens land via 130; values marked
  provisional ride the feel pass).
- Any chrome font change (doctrine: chrome is a terminal — system
  stacks).

### Design/Approach

Copy the kit's `assets/fonts/` (maple-mono-latin 400/400i/700 +
LICENSE-OFL.txt) into the app's static assets; `@font-face` in a
small `editor-face.css` imported by the renderer (add the file to
the raw-color guard's awareness only if it carries color — it
should not). `--ew-font-editor` + `--ew-editor-*` scale tokens per
STYLE-GUIDE §3 (~ values). Apply at the CodeMirror editor surface,
the card-appearance excerpt renderer (canvas text: load the face
via FontFace API before text bake so WebGL card text uses it —
verify the §12.1 text path), and gallery text posts. Heading sizes/
colors apply via the editor's existing markdown styling hooks —
h1/h2/h3 only, per the scale. Electron packaging: confirm
electron-builder picks the fonts into the asar/resources for
packaged builds (the seed-images pattern is the reference).

### Files to Touch

`apps/desktop/resources/fonts/` (new): woff2 ×3 + OFL.
`apps/desktop/src/renderer/editor-face.css` (new) + import site.
`apps/desktop/src/renderer/theme.css`: font/scale tokens (coord
with 130 if unmerged; both additive).
`apps/desktop/src/renderer/note/note-editor.ts` + NotePanel/big
editor styles: face + scale + heading colors.
Card excerpt / gallery text-post render sites (locate; likely
canvas-engine card body + GalleryView).
`electron-builder` config if resources need declaring.
E2E: a note's rendered font-family resolves to Maple (computed
style assertion); packaged-path smoke covered by existing build.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Fonts bundled + licensed; zero runtime fetches (assert no
      network font request in e2e).
- [ ] Editor + big editor render Maple with heading scale/colors;
      chrome fonts unchanged (spot e2e on a menu row).
- [ ] Card excerpts + gallery text posts render Maple (FontFace
      preload for canvas text if applicable).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      face read as paper-warm; heading loudness).

### Acceptance Criteria

**GIVEN** an open note with h1/h2/h3 and italics
**THEN** it renders Maple Mono with true italics and colored
headings, in panel and big editor alike
**AND** every chrome surface still renders the platform stack.
**GIVEN** a packaged build
**THEN** the face loads from the bundle with no network access.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
