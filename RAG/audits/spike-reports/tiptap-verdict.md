---
node_id: SPIKE-REPORT-002
tags:
  - spike
  - rich-text
  - decision
date_created: 2026-07-07
related: "[[AI-IMP-144-tiptap-prototype-verdict]]"
parent_epic: "[[AI-EPIC-018-rich-text-notes]]"
---

# TipTap go/no-go for EPIC-018 rich-text notes

Answers AI-IMP-144: can TipTap deliver the rev 0.55 §7.1 note-editor
direction (Markdown-canonical carrier, wiki-link atoms, live typed
styling + org-style heading folding, floating format bar, Maple Mono,
loud headings) over our commit model, at acceptable perf, hidden-window
safe? Prototype in `spike/tiptap/` (throwaway). Stack measured:
`@tiptap/core` + `@tiptap/starter-kit` + `tiptap-markdown` + two
spike-local atom nodes (wiki-link, embed) + a decoration folding
extension. All harnesses run **headless in jsdom under Node** (no
browser); reproduce with `npm test`, `npm run perf`, `npm run bundle`,
`node src/measure-cm.mjs`, `node src/scan-hazards.mjs` inside
`spike/tiptap/`.

## VERDICT: GO-WITH-CONDITIONS

TipTap clears six of seven criteria outright and clears the seventh
(round-trip) **semantically but not byte-for-byte**. Across the full
25-case corpus every round-trip is *rendered-identical* to its input;
19/25 are also byte-identical. The six byte-diffs are all Markdown
**dialect normalizations** (emphasis `_`→`*`, bullet `*`→`-`, multi-line
blockquote joined to one soft-wrapped paragraph, trailing-space hard
break → `\`, blank-line runs collapsed) — none change the rendered
document. That is the whole decision: because our model declares
"Markdown source remains canonical" (§7.1) and stores per-token source
**ranges**, and because §4.2 wants the vault mirror to round-trip "with
zero translation," byte-churn is a real (not cosmetic) cost that must be
managed, but it is not a correctness bug. TipTap is viable if we (a)
edit **prose only** through the §7.8 strip seam — the whole-body path is
disqualified — and (b) adopt the editor's Markdown dialect as our
canonical dialect via a one-time canonicalization on load, so
steady-state saves are byte-stable. Bundle cost is *net-neutral* against
the CodeMirror we already ship, perf is comfortable, wiki-atoms and
folding are clean and — critically — folding is decoration-only so it
cannot touch the source. Conditions are enumerated below; the fallback
(CodeMirror decorations) is sketched against the same criteria in case
the owner rejects dialect churn.

## Per-criterion result

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Markdown round-trip byte-stability | **PARTIAL** — 19/25 byte-stable, 25/25 render-identical; whole-body path unusable, strip-seam path required | `roundtrip.test.mjs` |
| 2 | Wiki-link atoms w/ state styling, source intact | **PASS** | `roundtrip.test.mjs` (atoms + malformed-stay-text + state class) |
| 3 | Live typed styling + org heading folding | **PASS** — folding is decoration-only, source byte-identical while folded | `folding.test.mjs` |
| 4 | Editor-local undo isolation (§10.2) | **PASS** — `addToHistory:false` keeps external edits out of undo | `undo-isolation.test.mjs` |
| 5 | Perf: open + typing on 5k-word note | **PASS** — open ~37 ms, per-keystroke ~0.05 ms (jsdom CPU floor) | `perf.mjs` |
| 6 | Electron hidden-window safety | **PASS (headless-proven; real-Electron smoke deferred)** — no datalist/dialog/window.open hazards; whole suite runs with no browser | `scan-hazards.mjs` + jsdom suite |
| 7 | Bundle cost | **PASS** — 148 KiB gz, *smaller* than the 169 KiB gz CodeMirror set already shipped | `measure-bundle.mjs` vs `measure-cm.mjs` |

## Criterion 1 — round-trip, verbatim failures

Method: `body → new Editor({content}) → editor.storage.markdown.getMarkdown()`.
Config tuned to our carrier: `html:false`, `tightLists:true`,
`bulletListMarker:'-'`, `linkify:false`, `breaks:false`. 19/25 byte-stable.
The six byte-diffs (all render-identical to input):

```
[FAIL] blockquote
   in : "> a quoted line\n> second quoted line"
   out: "> a quoted line second quoted line"
   (CommonMark lazy continuation: both are ONE paragraph in the quote)
[FAIL] adv-underscore-emphasis
   in : "Prefer _underscore italic_ and __underscore bold__."
   out: "Prefer *underscore italic* and **underscore bold**."
[FAIL] adv-trailing-spaces-hardbreak
   in : "line one  \nline two after hard break"
   out: "line one\\\nline two after hard break"
[FAIL] adv-star-bullets
   in : "* star one\n* star two"
   out: "- star one\n- star two"   (bulletListMarker config picks one)
[FAIL] adv-nested-emphasis
   in : "Mix of **bold _and italic_ together**."
   out: "Mix of **bold *and italic* together**."
[FAIL] adv-consecutive-blanklines
   in : "Para one.\n\n\n\nPara two after many blanks."
   out: "Para one.\n\nPara two after many blanks."
```

Passing cases include all headings 1–6, ordered/nested lists, code
fences, inline code, `[[links]]`, `[[Old|aliased]]`, `[[a|b|c]]`,
`![[embeds]]`, unicode (`Café ☕ 日本語 🐉`), an HR in prose, links inside
code fences/inline code (correctly NOT tokenized), escaped chars, and a
mixed kitchen-sink body.

**Metadata tail (§7.8) — both paths tested, integration path chosen:**

- **Whole-body path (DISQUALIFIED):** feeding `prose + metaBlock`
  through the editor corrupts the fence — `html:false` HTML-escapes the
  `<!-- ew:metadata -->` sentinel to `&lt;!-- ew:metadata --&gt;`,
  destroying the marker the parser owns. (`html:true` would keep the
  comment but re-admits raw-HTML passthrough we don't want.)
- **Strip-seam path (INTEGRATION USES THIS):** exactly as the shipped
  CodeMirror editor already does — `stripMetadataBlock` holds `block`
  aside, the editor sees prose only, and `prose_out + block` reattaches
  the tail **byte-exact by construction**. Test confirms the tail is
  preserved verbatim and the prose head round-trips on its own. The
  seam already exists in `note-editor.ts`; TipTap slots into the same
  place with no change to §7.8.

## Criterion 2 — wiki-link atoms

Implemented as inline atom nodes (`spike/tiptap/src/wiki-extensions.mjs`).
Parse side is a `markdown-it` inline rule (tiptap-markdown parses
markdown→HTML→doc) mirroring `packages/domain/src/wiki-links.ts`
grammar; serialize side writes `[[title]]` / `[[title|alias]]` /
`![[target]]` back from stored attrs. Proven: atoms detected in the doc
tree; `[[Old|new label]]`, `[[a|b|c]]` (later bars kept), `![[hero.png]]`,
`![[m.png|map]]` all serialize byte-exact; malformed `[[   ]]`, `[[|x]]`,
`[[x|]]`, `[[x` stay plain text (grammar parity); and an injected
`classFor(title)` puts `wl-bound`/`wl-unresolved` classes on the atom's
DOM without touching the serialized source — so the four §7.1 display
states (bound / bound-trashed / unresolved / broken-strikethrough) ride
the atom as pure presentation.

## Criterion 3 — folding + live styling

`HeadingFold` extension (`spike/tiptap/src/folding.mjs`) folds a heading
by decorating the following top-level blocks up to the next heading of
equal-or-higher level with `display:none` (`Decoration.node`). Proven:
folding `## Alpha` hides both alpha paragraphs, leaves `## Beta` visible,
and — the load-bearing property — **the serialized markdown is
byte-identical while folded**, because decorations never mutate the doc.
This is the reassurance for a Markdown-canonical carrier: folding is
free of round-trip risk entirely.

Gotchas surfaced (must be handled by the folding IMP, none are blockers):
- ProseMirror's doc is a **flat block list**; a heading does not
  *contain* its section, so the fold range is computed by scanning
  siblings at fold time (app logic, done in the prototype).
- The caret can sit inside a to-be-hidden block; integration must move
  the selection out on fold (flagged, not implemented in the spike).
- Nested folds compose (an ancestor `display:none` subsumes inner
  decorations). Live typed-markdown styling (loud headings, Maple Mono,
  emphasis) is ordinary TipTap node/mark styling — not separately
  prototyped because it is the framework's core competency; the format
  bar is a standard TipTap selection-driven toolbar.

## Criterion 4 — undo isolation (§10.2)

TipTap ships ProseMirror's `history` plugin (in StarterKit). Proven with
`undoDepth()`: a user edit raises undo depth to 1; a syncExternal-style
programmatic edit dispatched with `tr.setMeta('addToHistory', false)`
leaves undo depth at 1 (does **not** enter the stack), the external text
is present, and one undo reverts the *user's* typing while the external
edit stays. The negative control confirms the trap: the same edit
*without* the flag grows undo depth 1→2. Integration wires the
`syncExternal` seam to always set `addToHistory:false` — the exact
analogue of the CodeMirror editor's `userEvent:'input.external'`
discipline, and it satisfies invariant 30 / §10.2: editor-local history
never crosses into structural undo.

## Criterion 5 — perf

5,072-word / 31,277-char generated body (headings, paragraphs, lists,
wiki-links). Median of 7 opens; 500 single-char insert transactions.

```
OPEN (parse markdown + construct EditorView) : median 36.6 ms (min 32.4, max 96.3)
TYPING (per-keystroke transaction apply)     : mean 0.052 ms  median 0.042 ms  p95 0.093 ms
```

**Method caveat (do not over-trust):** jsdom has no layout engine, so
ProseMirror's DOM write + reflow is under-counted; these are the
CPU-bound floor (parse, transaction, plugin apply). Open at ~37 ms for a
5k-word note is comfortably sub-frame-budget for a one-time note switch;
per-keystroke JS work is negligible. Real composited typing latency in
Electron should be confirmed in the first integration IMP, but there is
no CPU-side concern.

## Criterion 6 — hidden-window safety

The entire test + perf suite constructs editors, applies transactions,
folds, and serializes **with no browser** (jsdom in Node) — the
strongest headless floor. Static scan of the bundled source
(`scan-hazards.mjs`) for hidden/offscreen-Electron hazards:

```
datalist            : 0     dialog/showModal : 0
window.open/popup   : 0     alert/prompt/confirm : 0
getBoundingClientRect : 21  contentEditable : 35   execCommand : 1
```

None of the EW-burned hazards (notably `<datalist>`) appear. The only
layout-dependent surface is `getBoundingClientRect` (caret/coord
positioning); in a zero-size window it returns zeros but never crashes
and never affects doc integrity or serialization — and the app already
runs a `contentEditable`-family editor (CodeMirror) in sized-hidden e2e
windows (`EW_TEST_HIDDEN_WINDOWS=1`). A real hidden-`BrowserWindow`
smoke was **not** run here: a fresh worktree gets only a husk
`electron/dist` (documented macOS+pnpm behavior) and fetching the real
binary / touching app scripts is outside the spike fence. Recommend a
one-test hidden-Electron smoke as the first acceptance check of the
integration IMP — cheap confirmation, not a blocker.

## Criterion 7 — bundle cost

esbuild, minified, ESM, browser target:

```
TipTap minimal (Editor+StarterKit+markdown+wiki atoms):
  raw 462.8 KiB   gzip 148.1 KiB
CodeMirror set currently shipped in note-editor.ts:
  raw 489.1 KiB   gzip 168.9 KiB
```

**TipTap is ~21 KiB gz smaller than the CodeMirror stack already in the
renderer.** If TipTap *replaces* CodeMirror (§7.1 "CodeMirror
replacement or coexistence"), the net bundle change is slightly
negative. `markdown-it` (~100 KiB) dominates TipTap's weight; if bundle
ever matters more, a lighter markdown bridge is an option. No bundle
concern either way.

## Conditions on the GO

1. **Prose-only through the §7.8 strip seam.** The whole-body path
   HTML-escapes the metadata fence; disqualified. Reuse
   `stripMetadataBlock` exactly as `note-editor.ts` does today.
2. **Adopt TipTap's Markdown dialect as canonical, via one-time
   canonicalization on load.** On first open of an existing note,
   normalize prose to the editor's output dialect and let the first
   autosave commit it; steady-state saves are then byte-stable. Pick and
   freeze the dialect knobs (`bulletListMarker`, emphasis marker, hard
   break, tight lists) and document them in the RFC as the canonical
   Markdown flavour. Accept that hand-edits to the vault mirror in a
   different flavour will re-normalize on next in-app save (the standard
   Obsidian-class tradeoff).
3. **`addToHistory:false` on every syncExternal write** (proven seam).
4. **Fold IMP must move the caret out of a folded range** and treat the
   fold range as a sibling scan (flat-doc gotcha).
5. **First integration IMP opens with a real hidden-Electron smoke**
   (construct editor + round-trip a body in a hidden `BrowserWindow`)
   to close the one criterion not exercised in a browser here.
6. **Owner ratifies dialect churn.** This is the single judgment call
   that could flip the verdict: if byte-exact preservation of the user's
   authored Markdown (not just render-identical) is a hard requirement,
   TipTap cannot meet it without serializer surgery and the fallback
   below wins.

## Recommended EPIC-018 IMP breakdown (GO path)

1. **IMP — TipTap editor controller behind the ProjectPort seam.**
   Replace `NoteEditorController`'s CodeMirror internals with a TipTap
   editor; preserve the exact §7.1/§10.2 commit lifecycle (idle
   debounce, blur/switch/quit flush, `flushPending`, `syncExternal` with
   `addToHistory:false`) and the §7.8 strip/reattach. Opens with the
   hidden-Electron smoke. Ships the one-time canonicalization-on-load.
2. **IMP — wiki-link + embed atom nodes wired to link resolution.**
   Port the spike atoms; feed `classFor` from `linkDisplayState`
   (§7.1); Mod+Click activation; suggestion popup on `[[`
   (reuse §7.2 suggestions). Serialize parity tests from the spike
   corpus become permanent domain tests.
3. **IMP — org-style heading folding.** Port `HeadingFold`; caret-out
   -of-fold handling; fold persistence policy (view-only, not durable);
   chevron affordance.
4. **IMP — presentation: Maple Mono face, loud colored headings, live
   typed-markdown styling, floating selection format bar.** Pure
   TipTap styling + a selection-driven toolbar; the §7.1 typography
   carve-out (bundled woff2, OFL).
5. **IMP — canonical-dialect definition + RFC update.** Freeze the
   Markdown flavour knobs, add the round-trip corpus as a regression
   gate, document the canonicalization migration in §7.1/§7.8.

## Fallback sketch — CodeMirror decorations (if condition 6 fails)

The shipped editor is already CodeMirror; the §7.3 deferred live-preview
direction *already names* "inline decorations over the same CodeMirror
source buffer." Against the seven criteria:

- **(1) Round-trip:** *perfect by construction* — the buffer **is** the
  canonical Markdown string; decorations are pure overlay, zero
  serialization, zero churn, zero range drift. This is the fallback's
  decisive advantage.
- **(2) Atoms:** wiki-links as atomic `Decoration.replace` widgets over
  the `[[...]]` source range (the existing `wiki-link-plugin.ts` already
  decorates these ranges — extend to atomic widgets with state classes).
  Source is never rewritten.
- **(3) Folding:** CodeMirror `@codemirror/language` `foldService` +
  `foldGutter`, or a custom fold range on heading fences; live styling
  via `ViewPlugin` decorations that hide/soften markdown punctuation
  (Obsidian-style live preview). Feasible but the "hide syntax as you
  type, reveal on the active line" behavior is notably fiddlier than
  TipTap's node model — this is the real cost of the fallback.
- **(4) Undo:** already correct and shipped (`history()`,
  `userEvent:'input.external'` — the model this spike mirrored).
- **(5) Perf:** CodeMirror 6 is viewport-virtualized; equal or better
  than TipTap on large docs.
- **(6) Hidden-window:** already proven — the shipped editor runs in the
  hidden-window e2e suite today.
- **(7) Bundle:** the 169 KiB gz already in the app; no addition.

Net: the fallback trades harder live-preview/folding/format-bar
engineering for zero round-trip risk and reuse of a shipped, proven
editor. Choose it iff the owner requires byte-exact Markdown
preservation (condition 6). Otherwise TipTap's richer document model
makes the loud-headings / folding / atom / format-bar presentation
materially cheaper to build, at net-neutral bundle and comfortable perf
— hence **GO-WITH-CONDITIONS**.
