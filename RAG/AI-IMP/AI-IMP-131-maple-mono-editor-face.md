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
STYLE-GUIDE §3 (~ values). Apply at the TipTap/ProseMirror editor
surface (the `.ew-note-prose` contenteditable — the CodeMirror
wording is stale since the AI-IMP-146 engine swap; see Issues),
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

- [x] Fonts bundled + licensed; zero runtime fetches (woff2 ×3 +
      LICENSE-OFL at resources/fonts/, pulled into out/renderer/assets
      by Vite; editor-face.test.ts asserts every @font-face src is a
      bundled woff2 with NO http(s) URL — source-level no-fetch guard
      in lieu of a network sniff).
- [x] Editor + big editor render Maple with heading scale/colors;
      chrome fonts unchanged (one global `.ew-note-prose` rule covers
      the docked pane AND the reparented big-editor overlay; h1/h2/h3
      size + `--ew-note-h*` color; notes.spec.ts computed-style
      assertion confirms the face; editor-face.test.ts guards chrome at
      the source level — the doctrine's cheapest honest guard, chosen
      over a brittle per-menu-row e2e).
- [x] Card excerpts + gallery text posts render Maple (GalleryView
      `.text-post`; canvas card title/excerpt via `CARD_FONT_FAMILY`
      with `document.fonts.load` preload at boot; placement.test.ts
      asserts the baked fontFamily).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden — all green (build emits the hashed woff2; lint clean;
      full `pnpm -r test` exit 0, desktop e2e 158 passed).
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

**CodeMirror → TipTap drift (amended).** The ticket text (and
Design/Approach) said "CodeMirror editor surface"; the editor engine
swapped to TipTap/ProseMirror in AI-IMP-146. The live editing surface
is the contenteditable `.ew-note-prose` / `data-testid=
"note-editor-content"` (`note/editor-markdown.ts` `noteEditorProps`).
The face is applied there. Design/Approach amended above; no CodeMirror
remains to target.

**Font home + packaging finding.** Fonts live at
`apps/desktop/resources/fonts/` (per the ticket), but they are NOT
wired like the seed images. Seed art is `extraResources` read from
`process.resourcesPath` by the main/utility process at runtime — the
wrong mechanism for a renderer webfont. Instead `editor-face.css`
references them by relative `url('../../resources/fonts/*.woff2')`, so
Vite pulls them INTO the renderer bundle at build. Confirmed: `pnpm -r
build` emits `out/renderer/assets/maple-mono-latin-*-*.woff2` (hashed).
electron-builder collects `out/**` into the asar, so packaged builds
carry the fonts with zero network fetch and no extraResources entry.
Full DMG packaging was not run in-worktree (slow; no signing needed),
but the asar inclusion follows deterministically from the emitted
`out/renderer/assets`.

**Big editor covered by one CSS site.** The §8.5 big editor reparents
the LIVE ProseMirror DOM into the overlay (NotePanel §8.5 handoff), so
the element keeps its `.ew-note-prose` class. Applying the face on a
GLOBAL `.ew-note-prose` rule (in editor-face.css, not scoped under
`.editor`) reaches BOTH the docked pane and the overlay from one place.
NotePanel's `.editor :global(.ew-note-prose)` line-height was pinned to
`var(--ew-editor-line)` (was a literal 1.5) so the pane and overlay
read identically — the higher-specificity panel rule would otherwise
win only in the pane.

**Surfaces that got the face:** (1) TipTap editing surface — panel +
big editor via the shared `.ew-note-prose` global rule (font + body
scale + h1/h2/h3 size & color using the AI-IMP-130 `--ew-note-h*`
tokens); (2) gallery text posts — `.text-post` in GalleryView.svelte;
(3) canvas card title + excerpt (Pixi Text) — `CARD_FONT_FAMILY` in
canvas-engine `placement.ts`, with `document.fonts.load` warming the
three faces at renderer boot so the glyphs are ready before the first
scene bakes (local-disk load beats the async IPC project load; any note
edit re-bakes the card regardless; `ui-monospace` is the graceful
fallback for the cold-start window).

**Surfaces skipped (with reason):** the free canvas TEXT decoration
(`renderers/decorations/text.ts`, §4.9) is user-authored canvas text
carrying its own per-object `fontFamily` (default sans-serif) — it is
NOT note TEXT, so it keeps the system stack. The node LABEL under image
placements (`placement.ts` buildLabel) is node furniture, not note
body text, and is not in the §7.1 list ("panels, big editor, card
excerpts, gallery text posts") — left unchanged.

**Doctrine guard.** `editor-face.test.ts` (source scan) asserts every
rule in editor-face.css is either an `@font-face` (bundled, no http
src) or a `.ew-note-prose`-scoped selector — the carve-out cannot leak
into chrome. editor-face.css carries no raw color, so the existing
theme.test.ts raw-color guard needs no change; the binary woff2 files
sit outside `src/renderer/` so that guard never scans them.
